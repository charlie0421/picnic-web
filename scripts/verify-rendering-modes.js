#!/usr/bin/env node
'use strict';

/**
 * 빌드 결과가 렌더링 모드 선언(scripts/rendering-modes.js)과 같은지 검증한다. `npm run build` 의 postbuild 가 돌린다.
 *
 * 왜 필요한가: 소스의 `export const dynamic/revalidate` 만 보는 테스트는 "선언은 그대로인데 실제 모드가 바뀐"
 * 경우를 잡지 못한다. 예를 들어 페이지가 쓰던 쿠키 조회가 리팩터링으로 사라지면, 그 페이지는 조용히 정적으로
 * 렌더돼 첫 결과가 모든 사용자에게 영원히 캐시된다. 반대로 ISR 페이지에 쿠키 조회가 끼어들면 조용히 동적으로
 * 돌아간다. 둘 다 .next/prerender-manifest.json 에는 그대로 드러난다.
 *
 * 실패하면 빌드(=배포)가 실패한다. 의도한 변경이면 scripts/rendering-modes.js 의 선언을 고친다.
 * 긴급 우회: SKIP_RENDERING_MODE_CHECK=1
 */

const fs = require('fs');
const path = require('path');
const {
  MODES,
  EXTRA_PRERENDERED,
  PREBUILT_LANGUAGES,
  ALL_LANGUAGES,
  DYNAMIC_SEGMENT,
  routeOfFile,
} = require('./rendering-modes');

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 빌드에서 HTML 이 만들어지거나(프리렌더) 요청 시 만들어져 캐시되는(온디맨드) 모드인가. */
const isStaticKind = (mode) =>
  mode.kind === 'isr' ||
  mode.kind === 'force-static' ||
  mode.kind === 'static-shell' ||
  (mode.kind === 'redirect' && !mode.dynamicParam);

const expectedRevalidate = (mode) =>
  mode.kind === 'isr' || mode.kind === 'force-static' ? mode.revalidate : false;

function describeEntries(modes) {
  return Object.entries(modes).map(([file, mode]) => {
    const route = routeOfFile(file);
    const segments = route.split('/').filter(Boolean);
    const dynamicCount = segments.filter((segment) => DYNAMIC_SEGMENT.test(segment)).length;
    const pattern = segments
      .map((segment) => (DYNAMIC_SEGMENT.test(segment) ? '[^/]+' : escapeRegExp(segment)))
      .join('/');
    return {
      file,
      mode,
      route,
      regex: new RegExp(`^/${pattern}$`),
      staticCount: segments.length - dynamicCount,
      hasDynamicSegment: dynamicCount > 0,
    };
  });
}

/**
 * @param {{routes?: Record<string, {initialRevalidateSeconds: number|false}>, dynamicRoutes?: Record<string, {fallback?: string|null|false}>}} manifest
 * @returns {string[]} 문제 목록. 비어 있으면 빌드 결과가 선언과 일치한다.
 */
function verifyPrerenderManifest(manifest, modes = MODES, extra = EXTRA_PRERENDERED) {
  const problems = [];
  const entries = describeEntries(modes);
  const routes = manifest.routes || {};
  const dynamicRoutes = manifest.dynamicRoutes || {};

  // /vote 는 '/[lang]' 과 '/vote' 에 모두 맞는다. Next 처럼 정적 세그먼트가 많은 쪽을 고른다.
  const entryForPath = (pathname) =>
    entries
      .filter((entry) => entry.regex.test(pathname))
      .sort((a, b) => b.staticCount - a.staticCount)[0];

  const prerenderedFiles = new Set();

  for (const [pathname, info] of Object.entries(routes)) {
    const actual = info.initialRevalidateSeconds;

    if (Object.prototype.hasOwnProperty.call(extra, pathname)) {
      if (actual !== extra[pathname]) {
        problems.push(`${pathname}: revalidate 가 ${actual} 이다. 기대값은 ${extra[pathname]} 이다.`);
      }
      continue;
    }

    const entry = entryForPath(pathname);
    if (!entry) {
      problems.push(
        `선언되지 않은 경로가 프리렌더됐다: ${pathname} (revalidate ${actual}). ` +
          'scripts/rendering-modes.js 에 이 페이지의 렌더링 모드를 선언한다.',
      );
      continue;
    }

    if (!isStaticKind(entry.mode)) {
      problems.push(
        `동적(${entry.mode.kind})으로 선언한 페이지가 프리렌더됐다: ${pathname} (app/${entry.file}). ` +
          '요청 시점 API 호출이 사라졌거나 force-dynamic 이 빠졌다. 이대로 배포하면 첫 렌더 결과가 모든 사용자에게 캐시된다.',
      );
      continue;
    }

    prerenderedFiles.add(entry.file);
    const expected = expectedRevalidate(entry.mode);
    if (actual !== expected) {
      problems.push(
        `${pathname}: revalidate 가 ${actual} 이다. app/${entry.file} 의 선언은 ${expected} 이다.`,
      );
    }
  }

  for (const [route, info] of Object.entries(dynamicRoutes)) {
    const entry = entries.find((candidate) => candidate.route === route);
    if (!entry) {
      problems.push(
        `선언되지 않은 경로가 요청 시 정적 생성(온디맨드) 대상이다: ${route}. ` +
          'scripts/rendering-modes.js 에 이 페이지의 렌더링 모드를 선언한다.',
      );
      continue;
    }
    if (!isStaticKind(entry.mode)) {
      problems.push(
        `동적(${entry.mode.kind})으로 선언한 페이지가 요청 시 정적 생성 대상이 됐다: ${route} (app/${entry.file}). ` +
          '프리빌드되지 않은 언어·id 의 첫 렌더 결과가 캐시된다.',
      );
      continue;
    }
    if (info && info.fallback === false) {
      problems.push(
        `${route}: fallback 이 false 다(dynamicParams = false). 프리빌드되지 않은 언어·id 가 404 가 된다.`,
      );
    }
  }

  for (const entry of entries) {
    if (!isStaticKind(entry.mode)) continue;

    if (entry.hasDynamicSegment) {
      if (!Object.prototype.hasOwnProperty.call(dynamicRoutes, entry.route)) {
        problems.push(
          `${entry.mode.kind} 로 선언한 ${entry.route} (app/${entry.file}) 가 정적 생성 대상이 아니다. ` +
            '요청 시점 API 호출이 끼어들어 동적으로 렌더되고 있다.',
        );
        continue;
      }
      if (!entry.mode.onDemand) {
        // "하나라도 있으면 통과" 로는 부족하다 — 사전 생성하기로 한 언어마다 경로가 있어야 한다.
        // (예: /ko/rewards 는 남고 /en/rewards 만 빠진 빌드.) 선언보다 많은 언어가 생성되는 것은 문제가 아니다.
        const languages = entry.mode.prebuilt === 'all' ? ALL_LANGUAGES : PREBUILT_LANGUAGES;
        for (const lang of languages) {
          const pathname = entry.route.replace('[lang]', lang);
          if (!Object.prototype.hasOwnProperty.call(routes, pathname)) {
            problems.push(
              `${entry.mode.kind} 로 선언한 ${entry.route} (app/${entry.file}) 의 ${pathname} 가 프리렌더되지 않았다. ` +
                '사전 생성 언어가 줄었거나 이 언어의 프리렌더가 빠졌다.',
            );
          }
        }
      }
    } else if (!prerenderedFiles.has(entry.file)) {
      problems.push(
        `${entry.mode.kind} 로 선언한 ${entry.route} (app/${entry.file}) 가 프리렌더되지 않았다. ` +
          '요청 시점 API 호출이 끼어들어 동적으로 렌더되고 있다.',
      );
    }
  }

  return problems;
}

module.exports = { verifyPrerenderManifest };

if (require.main === module) {
  if (process.env.SKIP_RENDERING_MODE_CHECK === '1') {
    console.warn('[rendering-modes] SKIP_RENDERING_MODE_CHECK=1 — 빌드 결과 검증을 건너뛴다.');
    process.exit(0);
  }

  const manifestPath = path.join(process.cwd(), '.next', 'prerender-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`[rendering-modes] ${manifestPath} 를 읽을 수 없다: ${error.message}`);
    process.exit(1);
  }

  const problems = verifyPrerenderManifest(manifest);
  if (problems.length > 0) {
    console.error('[rendering-modes] 빌드 결과가 렌더링 모드 선언과 다르다:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      '[rendering-modes] 의도한 변경이면 scripts/rendering-modes.js 의 선언을 고친다. ' +
        '의도하지 않았다면 페이지가 영구 캐시되거나(정적화) 캐시되지 않는(동적화) 회귀다.',
    );
    process.exit(1);
  }

  console.log(
    `[rendering-modes] 통과: 프리렌더 ${Object.keys(manifest.routes || {}).length}개 경로와 ` +
      `온디맨드 ${Object.keys(manifest.dynamicRoutes || {}).length}개 경로가 선언과 일치한다.`,
  );
}
