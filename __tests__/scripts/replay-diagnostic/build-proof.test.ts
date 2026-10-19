// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDiagnosticBuildMetadata } from '@/scripts/replay-diagnostic/build-metadata.cjs';
import { verifyBuild } from '@/scripts/replay-diagnostic/verify-build.cjs';
import { runBuild } from '@/scripts/replay-diagnostic/build.cjs';
import { readDiagnosticBuild } from '@/lib/sentry/replay/diagnostic-build';

const commit = 'a'.repeat(40);
const release = `picnic-web@${commit}`;
const environment = 'replay-diagnostic-production';
const css = '.a{color:red}';
const styled = '.s.jsx-abc123{top:0}';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
let root: string;
let manifestPath: string;
let buildDir: string;
const proofPath = () => path.join(root, 'lib/sentry/replay/generated/diagnostic-proof.json');
const put = (file: string, value: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, value); };
const options = () => ({ buildDir, manifestPath, commit, release, environment });
function metadataEnv() {
  vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_COMMIT', commit);
  vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_RELEASE', release);
  vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_ENVIRONMENT', environment);
  vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_MANIFEST_SHA256', sha(readFileSync(manifestPath)));
}
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'replay-build-proof-'));
  buildDir = path.join(root, '.next');
  manifestPath = path.join(root, 'lib/sentry/replay/generated/diagnostic-manifest.json');
  put(path.join(buildDir, 'BUILD_ID'), 'final-build');
  put(path.join(buildDir, 'static/css/abc.css'), css);
  put(path.join(buildDir, 'static/chunks/vote.js'), `x={id:"abc123",children:${JSON.stringify(styled)}};`);
  put(path.join(root, 'node_modules/@sentry-internal/replay/package.json'), '{"version":"9.47.1"}');
  // A real executable fixture asserts that old proof was invalidated BEFORE next build.
  put(path.join(root, 'node_modules/next/dist/bin/next'), `const fs=require('fs');
if(JSON.parse(fs.readFileSync('lib/sentry/replay/generated/diagnostic-proof.json')).verified!==false)process.exit(7);
process.exit(Number(process.env.FIXTURE_BUILD_EXIT||0));`);
  put(manifestPath, JSON.stringify({
    version: 2, generatedFrom: { buildId: 'capture-build', origin: 'http://127.0.0.1:53931', commit: 'old-capture' },
    sdkVersion: '9.47.1', viewport: 'width=device-width, initial-scale=1', announcerStyle: '',
    linkCss: [{ asset: '/_next/static/css/abc.css', sourceSha256: sha(css), accept: [{ engine: 'chromium', sha256: sha(css), text: css }], output: { sha256: sha(css), text: css } }],
    styleText: [{ accept: [{ engine: 'chromium', sha256: sha(styled), text: styled }], output: { sha256: sha(styled), text: styled } }],
    classes: ['a', 's', 'jsx-abc123'], statusColors: [], sourceStyleSha256: [sha(styled)],
  }, null, 2) + '\n');
  metadataEnv();
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

describe('final build proof', () => {
  it('binds exact manifest bytes, final BUILD_ID and current commit without trusting capture metadata', async () => {
    const proof = await verifyBuild(options());
    expect(proof).toEqual({ version: 1, verified: true, buildId: 'final-build', commit,
      manifestSha256: sha(readFileSync(manifestPath)), sdkVersion: '9.47.1', release, environment });
    const meta = getDiagnosticBuildMetadata({ env: { VERCEL: '1', VERCEL_GIT_COMMIT_SHA: commit }, manifestPath });
    expect(meta.manifestSha256).toBe(proof.manifestSha256);
    expect(meta.release).toBe(release);
    put(proofPath(), JSON.stringify(proof));
    expect(await readDiagnosticBuild({ root })).toEqual(proof);
  });
  it.each(['css', 'style', 'sdk', 'asset-path', 'metadata'])('rejects changed %s', async kind => {
    if (kind === 'css') put(path.join(buildDir, 'static/css/abc.css'), '.a{color:blue}');
    if (kind === 'style') put(path.join(buildDir, 'static/chunks/new.js'), 'x={id:"def456",children:".new{top:1px}"};');
    if (kind === 'sdk') put(path.join(root, 'node_modules/@sentry-internal/replay/package.json'), '{"version":"10.0.0"}');
    if (kind === 'asset-path') {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')); m.linkCss[0].asset = '/_next/../../private.css'; put(manifestPath, JSON.stringify(m));
    }
    await expect(verifyBuild({ ...options(), ...(kind === 'metadata' ? { release: 'old-release' } : {}) })).rejects.toThrow();
  });
  it('does not certify a placeholder with no captured CSS', async () => {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')); m.linkCss = []; put(manifestPath, JSON.stringify(m));
    await expect(verifyBuild(options())).rejects.toThrow();
  });
  it.each(['buildId', 'manifestSha256', 'commit', 'release', 'environment', 'sdkVersion', 'extra'])('closes on a mismatched proof field: %s', async field => {
    const proof = { ...await verifyBuild(options()), [field]: 'other' };
    put(proofPath(), JSON.stringify(proof));
    expect(await readDiagnosticBuild({ root })).toBeNull();
  });
  it('closes on missing, malformed and explicitly invalid proof', async () => {
    expect(await readDiagnosticBuild({ root })).toBeNull();
    put(proofPath(), '{bad'); expect(await readDiagnosticBuild({ root })).toBeNull();
    put(proofPath(), '{"version":1,"verified":false}'); expect(await readDiagnosticBuild({ root })).toBeNull();
  });
  it('closes after a rebuild even if the manifest is unchanged', async () => {
    put(proofPath(), JSON.stringify(await verifyBuild(options())));
    put(path.join(buildDir, 'BUILD_ID'), 'second-build');
    expect(await readDiagnosticBuild({ root })).toBeNull();
  });
});

describe('build wrapper', () => {
  it.each([{}, { REPLAY_DIAGNOSTIC_REQUIRE_PROOF: '1' }, { REPLAY_DIAGNOSTIC_ENABLED: '1' }])('accepts a matching build: %j', async flags => {
    put(proofPath(), '{"verified":true}');
    expect(await runBuild({ root, env: { ...process.env, VERCEL: '1', VERCEL_GIT_COMMIT_SHA: commit, ...flags } })).toBe(0);
    expect(JSON.parse(readFileSync(proofPath(), 'utf8')).verified).toBe(true);
  });
  it.each([[{}, 0], [{ REPLAY_DIAGNOSTIC_REQUIRE_PROOF: '1' }, 1], [{ REPLAY_DIAGNOSTIC_ENABLED: '1', REPLAY_DIAGNOSTIC_REQUIRE_PROOF: '0' }, 1]] as const)
    ('leaves invalid proof and enforces strict mode on mismatch: %j', async (flags, expected) => {
      put(proofPath(), '{"verified":true}');
      put(path.join(buildDir, 'static/css/abc.css'), '.a{color:blue}');
      expect(await runBuild({ root, env: { ...process.env, VERCEL: '1', VERCEL_GIT_COMMIT_SHA: commit, ...flags } })).toBe(expected);
      expect(JSON.parse(readFileSync(proofPath(), 'utf8'))).toEqual({ version: 1, verified: false });
    });
  it('never hides a next build failure in OFF mode', async () => {
    expect(await runBuild({ root, env: { ...process.env, FIXTURE_BUILD_EXIT: '9' } })).toBe(9);
    expect(JSON.parse(readFileSync(proofPath(), 'utf8')).verified).toBe(false);
  });
});
