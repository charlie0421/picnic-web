'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getDiagnosticBuildMetadata } = require('./build-metadata.cjs');
const { verifyBuild } = require('./verify-build.cjs');
async function runBuild({ root = process.cwd(), env = process.env } = {}) {
  const dir = path.join(root, 'lib/sentry/replay/generated');
  const proofPath = path.join(dir, 'diagnostic-proof.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(proofPath, JSON.stringify({ version: 1, verified: false }) + '\n');
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], { cwd: root, env, stdio: 'inherit' });
    child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) return code;
  try {
    const manifestPath = path.join(dir, 'diagnostic-manifest.json');
    const metadata = getDiagnosticBuildMetadata({ root, env, manifestPath });
    const proof = await verifyBuild({ buildDir: path.join(root, env.ENVELOPE_TEST === '1' ? '.next-envtest' : '.next'), manifestPath, ...metadata });
    const temporary = `${proofPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(proof) + '\n'); fs.renameSync(temporary, proofPath);
    return 0;
  } catch (error) {
    console.warn(`Replay diagnostic disabled: ${error.message}`);
    return env.REPLAY_DIAGNOSTIC_ENABLED === '1' || env.REPLAY_DIAGNOSTIC_REQUIRE_PROOF === '1' ? 1 : 0;
  }
}
module.exports = { runBuild };
if (require.main === module) runBuild().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
