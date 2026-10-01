#!/usr/bin/env node
'use strict';

/**
 * 운영 빌드 산출물에 envelope 테스트용 라우트가 없는지 검사한다. `npm run build` 의 postbuild 가 돌린다.
 * 실패하면 빌드(=배포)가 실패한다.
 *
 * 테스트용 라우트는 일부러 오류를 던지고 요청 헤더의 값을 메시지에 넣는다. 운영에 있으면 안 된다.
 */

const fs = require('fs');
const path = require('path');
const { findTestRoutes } = require('./envelope-test/build-switch');

if (require.main === module) {
  if (process.env.ENVELOPE_TEST === '1') {
    console.error('[test-routes] ENVELOPE_TEST=1 로는 운영 빌드를 만들 수 없다. `npm run test:envelope` 을 쓴다.');
    process.exit(1);
  }

  const manifestPath = path.join(process.cwd(), '.next', 'app-path-routes-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`[test-routes] ${manifestPath} 를 읽을 수 없다: ${error.message}`);
    process.exit(1);
  }

  const found = findTestRoutes(manifest);
  if (found.length > 0) {
    console.error('[test-routes] 운영 빌드에 테스트용 라우트가 들어 있다:');
    for (const route of found) console.error(`  - ${route}`);
    process.exit(1);
  }

  console.log(`[test-routes] 통과: 라우트 ${Object.keys(manifest).length}개 가운데 테스트용 라우트가 없다.`);
}
