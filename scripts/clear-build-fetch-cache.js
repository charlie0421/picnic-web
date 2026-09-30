#!/usr/bin/env node
/**
 * 빌드 전에 Next 의 fetch 캐시(.next/cache/fetch-cache)를 비운다. package.json 의 prebuild 가 실행한다.
 *
 * ISR 페이지(rewards·faq·notice·download)의 프리렌더는 같은 빌드 안에서 언어별 페이지가 Supabase 응답
 * 하나를 나눠 쓰도록 조회 결과를 캐시한다. `.next` 가 남아 있는 환경(로컬, 자체 CI)에서는 그 캐시가
 * 이 디렉터리에 파일로 남고, 다음 빌드는 남은 응답으로 페이지를 만든다(만료된 항목도 그대로 쓰고
 * 뒤에서만 다시 조회한다). 페이지가 예전 데이터로 만들어지고, 느린 응답 같은 조회 경로의 문제도
 * 빌드에서 드러나지 않는다.
 *
 * 비우면 빌드마다 현재 데이터로 프리렌더한다. webpack 등 다른 빌드 캐시는 건드리지 않는다.
 *
 * Vercel 빌드에서는 비울 것이 없다. Next 의 기본 캐시 핸들러는 `NOW_BUILDER` 환경에서 이 캐시를
 * 디스크에 쓰지도 읽지도 않는다(next/dist/export/worker.js 의 `flushToDisk: !hasNextSupport`).
 * 2026-10-01 Production 빌드 로그의 "비울 fetch 캐시가 없다" 로 확인했다
 * (docs/superpowers/specs/2026-09-30-root-layout-isr-design.md §9.2).
 */
const fs = require('fs');
const path = require('path');

function clearBuildFetchCache(projectDir = process.cwd()) {
  const dir = path.join(projectDir, '.next', 'cache', 'fetch-cache');
  const existed = fs.existsSync(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return { dir, existed };
}

if (require.main === module) {
  const { existed } = clearBuildFetchCache();
  console.log(
    existed
      ? '[build-fetch-cache] 이전 빌드의 fetch 캐시를 비웠다. ISR 페이지를 현재 데이터로 프리렌더한다.'
      : '[build-fetch-cache] 비울 fetch 캐시가 없다.',
  );
}

module.exports = { clearBuildFetchCache };
