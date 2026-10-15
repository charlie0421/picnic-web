'use strict';
// Builds the product with production settings (real fonts by default) and serves it on loopback for the replay harness.
// Usage, from the repository root:
//   node scripts/replay-p0/tools/vote-list-server.cjs --out <evidence dir> [--font-mock] [--reuse-build]
// Stop it with SIGTERM to the pid in <out>/server.json. It never stops other processes.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startUpstream } = require('./vote-list-upstream.cjs');

const NEXT_PORT = 53931;
const UPSTREAM_PORT = 59862;
const BUILD_DIR = '.next-envtest';
const GUARDED_SOURCES = ['tsconfig.json', 'next-env.d.ts'];
const PRODUCT_ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];
const FONT_HOSTS = 'fonts.googleapis.com,fonts.gstatic.com';

/** Product env files that Next would load from the repository root. */
function productEnvFiles(root) { return PRODUCT_ENV_FILES.filter(f => fs.existsSync(path.join(root, f))); }
/** The complete child environment. Nothing is copied from the parent except PATH, HOME and TMPDIR. */
function harnessEnv({ out, fontMock, build }) {
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', ENVELOPE_TEST: '1', BUILD_VERSION: 'replay-build-manifest',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${UPSTREAM_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
    SUPABASE_URL: `http://127.0.0.1:${UPSTREAM_PORT}`, SUPABASE_ANON_KEY: 'synthetic-anon-key', SUPABASE_SERVICE_ROLE_KEY: '',
    SENTRY_DSN: '', SENTRY_AUTH_TOKEN: '', NEXT_PUBLIC_SENTRY_DSN: '',
    NEXT_PUBLIC_SENTRY_SESSION_SAMPLE_RATE: '0', NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE: '0',
    NEXT_PUBLIC_CDN_URL: '', NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${NEXT_PORT}`,
    NODE_OPTIONS: `--require=${path.join(__dirname, 'net-guard.cjs')}`, REPLAY_NET_GUARD: '1',
    REPLAY_NET_LOG: path.join(out, 'blocked-network.jsonl'),
  };
  if (build && !fontMock) env.REPLAY_NET_ALLOW = FONT_HOSTS;
  if (fontMock) env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = path.join(__dirname, 'font-mock.cjs');
  return env;
}
function portFree(port) {
  return new Promise(resolve => {
    const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}
async function main() {
  const root = process.cwd(); const args = process.argv.slice(2);
  const outAt = args.indexOf('--out'); if (outAt < 0 || !args[outAt + 1]) throw new Error('missing --out');
  const out = path.resolve(args[outAt + 1]); const fontMock = args.includes('--font-mock'); const reuse = args.includes('--reuse-build');
  if (!fs.existsSync(path.join(root, 'next.config.js'))) throw new Error('run from the repository root');
  const envFiles = productEnvFiles(root);
  if (envFiles.length) throw new Error(`product env files present (${envFiles.join(', ')}); remove them from this worktree first`);
  for (const port of [NEXT_PORT, UPSTREAM_PORT]) {
    if (!(await portFree(port))) throw new Error(`port ${port} is in use; stop here and do not stop its owner`);
  }
  fs.mkdirSync(out, { recursive: true });
  const statePath = path.join(out, 'server.json');
  const previous = reuse ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
  const before = Object.fromEntries(GUARDED_SOURCES.map(f => [f, fs.readFileSync(path.join(root, f))]));
  const state = { pid: process.pid, nextPid: null, port: NEXT_PORT, upstreamPort: UPSTREAM_PORT, buildId: null, fontMock, phase: 'starting', restored: [] };
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  // Next can rewrite tsconfig.json and next-env.d.ts for the extra build directory. Put the committed bytes back.
  const restore = () => {
    for (const f of GUARDED_SOURCES) {
      if (fs.readFileSync(path.join(root, f)).equals(before[f])) continue;
      fs.writeFileSync(path.join(root, f), before[f]); if (!state.restored.includes(f)) state.restored.push(f);
    }
  };
  const upstream = await startUpstream({ port: UPSTREAM_PORT, logFile: path.join(out, 'backend.jsonl'), now: Date.now() });
  let next = null; let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; next?.kill('SIGTERM'); upstream.close(); restore(); save(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const run = (cmd, log, build) => {
    const fd = fs.openSync(path.join(out, log), 'w');
    return spawn(path.join(root, 'node_modules/.bin/next'), cmd, { cwd: root, env: harnessEnv({ out, fontMock, build }), stdio: ['ignore', fd, fd] });
  };
  try {
    if (!reuse) {
      state.phase = 'building'; save();
      next = run(['build'], 'build.log', true); state.nextPid = next.pid; save();
      const code = await new Promise(resolve => next.once('exit', resolve)); next = null;
      restore(); save();
      if (code !== 0) throw new Error(`next build exited with ${code}; see build.log`);
    }
    state.buildId = fs.readFileSync(path.join(root, BUILD_DIR, 'BUILD_ID'), 'utf8').trim();
    if (reuse && (previous.buildId !== state.buildId || previous.fontMock !== fontMock)) throw new Error('build does not match server.json');
    next = run(['start', '--hostname', '127.0.0.1', '--port', String(NEXT_PORT)], 'next.log', false);
    state.nextPid = next.pid; state.phase = 'serving'; save();
    next.once('exit', code => { state.phase = `exited:${code}`; save(); stop(); });
    console.log(`serving ${BUILD_DIR} ${state.buildId} on http://127.0.0.1:${NEXT_PORT}`);
  } catch (error) { state.phase = 'failed'; stop(); throw error; }
}
module.exports = { productEnvFiles, harnessEnv, NEXT_PORT, UPSTREAM_PORT };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
