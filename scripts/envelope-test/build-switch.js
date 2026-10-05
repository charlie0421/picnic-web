'use strict';

/**
 * envelope 테스트 전용 빌드의 스위치.
 *
 * 테스트용 라우트의 원본은 scripts/envelope-test/routes/ 에 있고 저장소의 app/ 에는 없다. 실행기(run.js)가
 * 테스트 빌드를 만들 때만 app/api/envelope-test/ 로 복사했다가 지운다. 보통 빌드는 git 의 app/ 만 보므로
 * 테스트용 라우트가 들어갈 길이 없다. 런타임 환경변수로는 이미 빌드된 라우트를 뺄 수 없으므로 빌드에서 가른다
 * (docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.7).
 *
 * 확장자로 가르는 방식(pageExtensions 에 envtest.ts 를 더하고 route.envtest.ts 로 두는 것)은 쓰지 않는다.
 * Next 15.5 는 확장자가 두 겹인 edge 라우트에 client reference manifest 를 만들지 않아 빌드가 실패한다
 * (flight-manifest-plugin 은 이름이 정확히 /route 로 끝나는 entry 에만 manifest 를 만든다).
 */

const TEST_DIST_DIR = '.next-envtest';
const TEST_ROUTE_PREFIX = '/api/envelope-test';
/** 테스트용 라우트의 원본. 라우트가 아닌 자리에 둔다. */
const TEST_ROUTE_SOURCE = 'scripts/envelope-test/routes';
/** 테스트 빌드 때 원본을 복사해 넣는 자리. 저장소에는 없어야 한다. */
const TEST_ROUTE_TARGET = 'app/api/envelope-test';

/** next.config.js 에 펼쳐 넣을 설정. 테스트 빌드가 아니면 빈 객체다. */
function nextConfigOverrides(env) {
  if (env.ENVELOPE_TEST !== '1') return {};
  if (env.VERCEL) {
    throw new Error('ENVELOPE_TEST=1 은 로컬 envelope 테스트 전용이다. Vercel 빌드에서는 쓸 수 없다.');
  }
  // 보통 빌드의 산출물(.next)과 섞이지 않게 따로 둔다.
  return { distDir: TEST_DIST_DIR };
}

/** app-path-routes-manifest.json 에서 테스트용 라우트를 찾는다. 비어 있어야 운영 산출물이다. */
function findTestRoutes(appPathRoutes) {
  return Object.entries(appPathRoutes || {})
    .filter(([file, route]) => `${file} ${route}`.includes(TEST_ROUTE_PREFIX))
    .map(([file, route]) => `${file} → ${route}`);
}

module.exports = {
  TEST_DIST_DIR,
  TEST_ROUTE_PREFIX,
  TEST_ROUTE_SOURCE,
  TEST_ROUTE_TARGET,
  nextConfigOverrides,
  findTestRoutes,
};
