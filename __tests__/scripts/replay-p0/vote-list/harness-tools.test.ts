// __tests__/scripts/replay-p0/vote-list/harness-tools.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostAllowed, hostOf } from '../../../../scripts/replay-p0/tools/net-guard.cjs';
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
  it('reads the host from URLs, request options and request objects', () => {
    expect(hostOf('https://fonts.googleapis.com/css2?family=Inter')).toBe('fonts.googleapis.com');
    expect(hostOf(new URL('http://127.0.0.1:59862/rest/v1/vote'))).toBe('127.0.0.1');
    expect(hostOf({ hostname: 'example.com', port: 443 })).toBe('example.com');
    expect(hostOf({ url: 'https://x.test/a' })).toBe('x.test');
    expect(hostOf({ port: 80 })).toBe('localhost');
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
