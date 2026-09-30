#!/usr/bin/env node
/**
 * 빌드 전에 Next 의 fetch 캐시(.next/cache/fetch-cache)를 비운다. package.json 의 prebuild 가 실행한다.
 *
 * ISR 페이지(rewards·faq·notice·download)의 프리렌더는 Supabase 조회 응답을 이 디렉터리에 남긴다.
 * 같은 빌드 안에서 언어별 페이지가 응답 하나를 나눠 쓰게 하려는 캐시인데, Vercel 은 `.next/cache` 를
 * 다음 빌드에 복원한다. 복원된 항목은 파일 수정 시각 기준으로 "방금 받은 것"처럼 보여 다시 조회되지 않고,
 * 새 배포의 페이지가 예전 빌드가 받아 둔 데이터로 만들어진다. 그 뒤 revalidate 시간(공지·FAQ 5분,
 * 다운로드 1시간)이 지나 재생성될 때까지 옛 내용이 나간다.
 *
 * 비우면 빌드마다 현재 데이터로 프리렌더한다. webpack 등 다른 빌드 캐시는 건드리지 않는다.
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
