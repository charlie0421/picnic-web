'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { buildStyleSources, chunkTexts } = require('../replay-p0/tools/build-css-manifest.cjs');
const { ENVIRONMENT } = require('./build-metadata.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
async function verifyBuild({ buildDir, manifestPath, commit, release, environment }) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(release, `picnic-web@${commit}`); assert.equal(environment, ENVIRONMENT);
  const bytes = fs.readFileSync(manifestPath); const manifest = JSON.parse(bytes);
  assert.equal(manifest.version, 2); assert.equal(manifest.sdkVersion, '9.47.1');
  assert(!('release' in manifest) && !('environment' in manifest), 'Template must not contain deployment metadata');
  assert(Array.isArray(manifest.linkCss) && manifest.linkCss.length > 0, 'No captured CSS');
  const seen = new Set();
  for (const css of manifest.linkCss) {
    assert.match(css.asset, /^\/_next\/static\/css\/[a-zA-Z0-9_-]+\.css$/);
    assert(!seen.has(css.asset), 'Duplicate CSS asset'); seen.add(css.asset);
    assert.match(css.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(sha(fs.readFileSync(path.join(buildDir, css.asset.slice('/_next/'.length)))), css.sourceSha256, 'CSS source changed');
  }
  const sourceStyleSha256 = [...new Set([...buildStyleSources(chunkTexts(buildDir))].map(sha))].sort();
  assert.deepEqual(manifest.sourceStyleSha256, sourceStyleSha256, 'styled-jsx sources changed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(buildDir, '../node_modules/@sentry-internal/replay/package.json'))).version, '9.47.1');
  const buildId = fs.readFileSync(path.join(buildDir, 'BUILD_ID'), 'utf8').trim();
  assert.match(buildId, /^[a-zA-Z0-9_-]+$/);
  return { version: 1, verified: true, buildId, commit, manifestSha256: sha(bytes), sdkVersion: '9.47.1', release, environment };
}
module.exports = { verifyBuild };
