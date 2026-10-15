// __tests__/scripts/replay-p0/vote-list/harness-tools.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { connectTarget, hostAllowed } from '../../../../scripts/replay-p0/tools/net-guard.cjs';
import { fixtures, filter } from '../../../../scripts/replay-p0/tools/vote-list-upstream.cjs';
import { harnessEnv, productEnvFiles } from '../../../../scripts/replay-p0/tools/vote-list-server.cjs';

describe('network guard', () => {
  it('allows loopback and exact extra hosts only', () => {
    expect(hostAllowed('127.0.0.1', [])).toBe(true);
    expect(hostAllowed('localhost:53931', [])).toBe(true);
    expect(hostAllowed('[::1]', [])).toBe(true);
    expect(hostAllowed('::1', [])).toBe(true);
    expect(hostAllowed('fonts.gstatic.com', [])).toBe(false);
    expect(hostAllowed('fonts.gstatic.com', ['fonts.gstatic.com'])).toBe(true);
    expect(hostAllowed('evil.fonts.gstatic.com', ['fonts.gstatic.com'])).toBe(false);
    expect(hostAllowed('fonts.gstatic.com.evil', ['fonts.gstatic.com'])).toBe(false);
  });
  it('reads the destination of every net.Socket connect form', () => {
    expect(connectTarget([{ host: 'fonts.gstatic.com', port: 443 }])).toEqual({ host: 'fonts.gstatic.com' });
    expect(connectTarget([[{ host: '127.0.0.1', port: 53931 }, null]])).toEqual({ host: '127.0.0.1' });
    expect(connectTarget([80, 'example.com'])).toEqual({ host: 'example.com' });
    expect(connectTarget([80])).toEqual({ host: 'localhost' });
    expect(connectTarget([{ port: 80 }])).toEqual({ host: 'localhost' });
    expect(connectTarget([{ path: '/tmp/x.sock' }])).toEqual({ path: '/tmp/x.sock' });
    expect(connectTarget(['/tmp/x.sock'])).toEqual({ path: '/tmp/x.sock' });
  });
  // Runs in a child process with the guard preloaded, as the server does. Every destination is local or blocked,
  // so the test sends nothing off this machine once the guard is in place.
  const SCENARIO = `
const http = require('node:http'), https = require('node:https'), net = require('node:net'), tls = require('node:tls');
const results = {};
const outcome = p => p.then(() => 'ok', e => String((e && e.cause && e.cause.message) || (e && e.message) || e));
const viaEvent = make => new Promise(done => {
  try {
    const x = make();
    x.on('error', e => done(String(e.message)));
    x.on('response', r => { r.resume(); done('ok'); });
    x.on('connect', () => { x.destroy(); done('ok'); });
    if (typeof x.end === 'function' && x instanceof http.ClientRequest) x.end();
  } catch (e) { done('throw:' + e.message); }
});
const server = http.createServer((req, res) => {
  if (req.url === '/redirect') { res.writeHead(302, { location: 'http://blocked.invalid/x' }); return res.end(); }
  res.end('ok');
}).listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  results.loopback = await viaEvent(() => http.request(base + '/ok'));
  results.httpOverride = await viaEvent(() => http.request(base + '/ok', { hostname: 'blocked.invalid' }));
  results.httpsOverride = await viaEvent(() => https.request('https://127.0.0.1:1/', { hostname: 'blocked.invalid' }));
  results.fetchRedirect = await outcome(fetch(base + '/redirect'));
  results.undici = await outcome(require('undici').fetch('http://blocked.invalid/'));
  results.net = await viaEvent(() => net.connect({ host: 'blocked.invalid', port: 80 }));
  results.tls = await viaEvent(() => tls.connect({ host: 'blocked.invalid', port: 443, servername: 'blocked.invalid' }));
  server.close(); process.stdout.write(JSON.stringify(results));
});`;
  it('blocks every client path to a non-allowed host and allows loopback', () => {
    const log = join(mkdtempSync(join(tmpdir(), 'replay-net-')), 'blocked.jsonl');
    const guard = resolve('scripts/replay-p0/tools/net-guard.cjs');
    const out = execFileSync(process.execPath, ['-e', SCENARIO], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH, NODE_OPTIONS: `--require=${guard}`, REPLAY_NET_GUARD: '1', REPLAY_NET_LOG: log } });
    const r = JSON.parse(out);
    expect(r.loopback).toBe('ok');
    for (const k of ['httpOverride', 'httpsOverride', 'fetchRedirect', 'undici', 'net', 'tls']) {
      expect(r[k], k).toBe('replay-harness-network-blocked:blocked.invalid');
    }
    expect(readFileSync(log, 'utf8')).toContain('"host":"blocked.invalid"');
  });
});

describe('server setup', () => {
  it('finds product env files that Next would load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'replay-env-'));
    writeFileSync(join(dir, '.env.example'), 'X=1');
    expect(productEnvFiles(dir)).toEqual([]);
    writeFileSync(join(dir, '.env.local'), 'X=1');
    expect(productEnvFiles(dir)).toEqual(['.env.local']);
  });
  it('allows the font hosts only while building with real fonts', () => {
    const build = harnessEnv({ out: '/o', fontMock: false, build: true });
    expect(build.REPLAY_NET_ALLOW).toBe('fonts.googleapis.com,fonts.gstatic.com');
    expect(build.NEXT_FONT_GOOGLE_MOCKED_RESPONSES).toBeUndefined();
    expect(build.NODE_OPTIONS).toContain('net-guard.cjs');
    expect(build.REPLAY_NET_GUARD).toBe('1');
    expect(harnessEnv({ out: '/o', fontMock: false, build: false }).REPLAY_NET_ALLOW).toBeUndefined();
    const mock = harnessEnv({ out: '/o', fontMock: true, build: true });
    expect(mock.REPLAY_NET_ALLOW).toBeUndefined();
    expect(mock.NEXT_FONT_GOOGLE_MOCKED_RESPONSES).toContain('font-mock.cjs');
  });
  it('never copies product secrets from the parent environment', () => {
    process.env.SENTRY_AUTH_TOKEN = 'parent-secret'; process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://k@o.ingest.sentry.io/1';
    try {
      const env = harnessEnv({ out: '/o', fontMock: false, build: true });
      expect(env.SENTRY_AUTH_TOKEN).toBe(''); expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe('');
      expect(JSON.stringify(env)).not.toContain('parent-secret');
    } finally { delete process.env.SENTRY_AUTH_TOKEN; delete process.env.NEXT_PUBLIC_SENTRY_DSN; }
  });
});

describe('synthetic upstream', () => {
  const { banners, votes } = fixtures(Date.UTC(2026, 9, 15));
  it('serves synthetic rows without absolute URLs', () => {
    expect(banners).toHaveLength(5); expect(votes).toHaveLength(12);
    expect(JSON.stringify({ banners, votes })).not.toMatch(/https?:\/\//);
  });
  it('applies the PostgREST operators the vote list sends', () => {
    expect(filter(votes, new URLSearchParams('deleted_at=is.null&offset=2&limit=3')).map((v: any) => v.id)).toEqual([910002, 910003, 910004]);
    expect(filter(votes, new URLSearchParams('areas=cs.{kpop}'))).toHaveLength(12);
    expect(filter(banners, new URLSearchParams('location=eq.vote_home'))).toHaveLength(5);
    expect(filter(banners, new URLSearchParams('location=eq.other'))).toHaveLength(0);
  });
});
