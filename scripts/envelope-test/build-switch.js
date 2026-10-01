'use strict';

/**
 * envelope 테스트 전용 빌드의 스위치.
 *
 * 테스트용 라우트(app/api/envelope-test/ 아래의 route.envtest.ts)는 ENVELOPE_TEST=1 로 만든 빌드에만 들어간다.
 * 런타임 환경변수로는 이미 빌드된 라우트를 뺄 수 없으므로 빌드에서 가른다
 * (docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.7).
 */

const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];
const TEST_PAGE_EXTENSION = 'envtest.ts';
const TEST_DIST_DIR = '.next-envtest';
const TEST_ROUTE_PREFIX = '/api/envelope-test';

/** next.config.js 에 펼쳐 넣을 설정. 테스트 빌드가 아니면 빈 객체다. */
function nextConfigOverrides(env) {
  if (env.ENVELOPE_TEST !== '1') return {};
  if (env.VERCEL) {
    throw new Error('ENVELOPE_TEST=1 은 로컬 envelope 테스트 전용이다. Vercel 빌드에서는 쓸 수 없다.');
  }
  return {
    pageExtensions: [...DEFAULT_PAGE_EXTENSIONS, TEST_PAGE_EXTENSION],
    distDir: TEST_DIST_DIR,
  };
}

/** app-path-routes-manifest.json 에서 테스트용 라우트를 찾는다. 비어 있어야 운영 산출물이다. */
function findTestRoutes(appPathRoutes) {
  return Object.entries(appPathRoutes || {})
    .filter(([file, route]) => `${file} ${route}`.includes(TEST_ROUTE_PREFIX))
    .map(([file, route]) => `${file} → ${route}`);
}

module.exports = {
  DEFAULT_PAGE_EXTENSIONS,
  TEST_PAGE_EXTENSION,
  TEST_DIST_DIR,
  TEST_ROUTE_PREFIX,
  nextConfigOverrides,
  findTestRoutes,
};
