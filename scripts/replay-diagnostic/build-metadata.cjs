'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ENVIRONMENT = 'replay-diagnostic-production';
function getDiagnosticBuildMetadata({ env = process.env, manifestPath, root = process.cwd() }) {
  const commit = env.VERCEL || env.VERCEL_ENV ? env.VERCEL_GIT_COMMIT_SHA
    : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Invalid diagnostic build commit');
  const bytes = fs.readFileSync(manifestPath || path.join(root, 'lib/sentry/replay/generated/diagnostic-manifest.json'));
  return { commit, manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    release: `picnic-web@${commit}`, environment: ENVIRONMENT };
}
module.exports = { getDiagnosticBuildMetadata, ENVIRONMENT };
