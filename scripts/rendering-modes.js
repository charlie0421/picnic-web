'use strict';

/**
 * app/ 아래 모든 페이지의 렌더링 모드 선언 — 단일 정본.
 *
 * 루트 레이아웃이 headers() 를 부르지 않으므로, 요청 시점 API(cookies·headers·searchParams)를 쓰지 않는 페이지는
 * Next 가 정적으로 렌더해 (revalidate 가 없으면) 영원히 캐시한다. 그래서 모든 페이지는 여기에 모드를 선언한다.
 *
 * 두 곳이 이 표를 쓴다.
 * - __tests__/app/rendering-mode-contract.test.ts: 소스의 세그먼트 설정이 선언과 같은지(빌드 없이)
 * - scripts/verify-rendering-modes.js: 빌드 결과(.next/prerender-manifest.json)가 선언과 같은지(postbuild)
 *
 * 키는 app/ 기준 파일 경로다. 새 페이지를 추가하면 여기에 항목을 추가해야 테스트와 빌드가 통과한다.
 *
 * kind
 * - isr:           `export const revalidate = N`. onDemand 는 [id] 처럼 빌드에 없는 파라미터를 요청 시 생성·캐시.
 * - force-static:  `export const dynamic = 'force-static'` + revalidate.
 * - force-dynamic: `export const dynamic = 'force-dynamic'`. 요청마다 렌더.
 * - request-api:   세그먼트 설정 없이, 페이지가 직접 요청 시점 API 를 읽어 동적이다. marker 는 그 호출 형태
 *                  (주석을 지운 코드에서 찾는다). 호출이 사라지면 다시 판단해야 한다.
 * - static-shell:  서버 데이터가 없는 클라이언트 셸. 굳어도 되는 페이지만.
 * - redirect:      redirect() 만 하는 페이지. dynamicParam 은 [id] 가 빌드에 없어 요청마다 렌더되는 경우.
 *
 * prebuilt: 'all' 은 페이지가 자체 generateStaticParams 로 모든 언어를 사전 생성한다는 뜻이다(download).
 * 그 밖의 [lang] 정적/ISR 페이지는 [lang] 레이아웃의 generateStaticParams 언어(PREBUILT_LANGUAGES)만 사전 생성한다.
 */

// app/[lang]/layout.tsx 의 generateStaticParams 가 돌려주는 언어. 일치 여부는
// __tests__/app/lang-layout-html.test.tsx 가 검증한다(이 파일은 CJS 라 TS 설정을 import 할 수 없다).
const PREBUILT_LANGUAGES = ['en', 'ko', 'my'];

// config/settings.ts 의 SUPPORTED_LANGUAGES. 일치 여부는 __tests__/scripts/verify-rendering-modes.test.ts 가 검증한다.
const ALL_LANGUAGES = ['en', 'ko', 'zh-cn', 'zh-tw', 'ja', 'id', 'es', 'bn', 'tl', 'th', 'vi', 'my'];

const SERVER_USER = /await getServerUser\(\)/;
const PROPS_SEARCH_PARAMS = /await props\.searchParams/;

const MODES = {
  // ── app/[lang] ─────────────────────────────────────────────────────────────
  '[lang]/page.tsx': { kind: 'redirect' },
  '[lang]/(auth)/login/page.tsx': { kind: 'static-shell' },
  '[lang]/(main)/concert2025/page.tsx': { kind: 'force-static', revalidate: 86400 },
  '[lang]/(main)/media/page.tsx': { kind: 'force-dynamic' },
  '[lang]/(main)/privacy/page.tsx': { kind: 'force-dynamic' },
  '[lang]/(main)/terms/page.tsx': { kind: 'force-dynamic' },
  '[lang]/(main)/rewards/page.tsx': { kind: 'isr', revalidate: 60 },
  '[lang]/(main)/rewards/[id]/page.tsx': { kind: 'isr', revalidate: 300, onDemand: true },
  '[lang]/(main)/star-candy/page.tsx': { kind: 'force-dynamic' },
  '[lang]/(main)/vote/page.tsx': { kind: 'request-api', marker: /await Promise\.all\(\[searchParams, params\]\)/ },
  '[lang]/(main)/vote/[id]/page.tsx': { kind: 'force-dynamic' },
  '[lang]/(mypage)/faq/page.tsx': { kind: 'isr', revalidate: 300 },
  '[lang]/(mypage)/notice/page.tsx': { kind: 'isr', revalidate: 300 },
  '[lang]/(mypage)/notice/[id]/page.tsx': { kind: 'isr', revalidate: 300, onDemand: true },
  '[lang]/(mypage)/mypage/page.tsx': { kind: 'request-api', marker: SERVER_USER },
  '[lang]/(mypage)/mypage/candy-history/page.tsx': { kind: 'request-api', marker: SERVER_USER },
  '[lang]/(mypage)/mypage/expiry-guide/page.tsx': { kind: 'request-api', marker: SERVER_USER },
  '[lang]/(mypage)/mypage/notifications/page.tsx': { kind: 'request-api', marker: SERVER_USER },
  '[lang]/(mypage)/mypage/qna/page.tsx': { kind: 'request-api', marker: PROPS_SEARCH_PARAMS },
  '[lang]/(mypage)/mypage/qna/new/page.tsx': { kind: 'static-shell' },
  '[lang]/(mypage)/mypage/qna/[thread_id]/page.tsx': { kind: 'force-dynamic' },
  '[lang]/(mypage)/mypage/recharge-history/page.tsx': { kind: 'request-api', marker: PROPS_SEARCH_PARAMS },
  '[lang]/(mypage)/mypage/vote-history/page.tsx': { kind: 'request-api', marker: PROPS_SEARCH_PARAMS },
  '[lang]/download/page.tsx': { kind: 'isr', revalidate: 3600, prebuilt: 'all' },
  '[lang]/open-in-browser/page.tsx': { kind: 'request-api', marker: /await headers\(\)/ },

  // ── app/(bare): 언어 세그먼트 밖 ─────────────────────────────────────────────
  // redirect 스텁 넷은 정상 흐름에서 닿지 않는다(middleware 가 먼저 선호 언어로 보낸다). 첫 배포에서는 남겨 둔다.
  '(bare)/auth/loading/page.tsx': { kind: 'static-shell' },
  '(bare)/auth/callback/page.tsx': { kind: 'force-dynamic' },
  '(bare)/auth/callback/[provider]/page.tsx': { kind: 'force-dynamic' },
  '(bare)/ads/shortform/player/page.tsx': { kind: 'static-shell' },
  '(bare)/vote/page.tsx': { kind: 'redirect' },
  '(bare)/vote/[id]/page.tsx': { kind: 'redirect', dynamicParam: true },
  '(bare)/mypage/page.tsx': { kind: 'redirect' },
  '(bare)/concert2025/page.tsx': { kind: 'redirect' },
};

/** 페이지 파일이 아닌데 프리렌더되는 경로 → 기대하는 revalidate. */
const EXTRA_PRERENDERED = {
  '/_not-found': false,
};

const PAGE_FILE = /(^|\/)page\.(tsx|ts|jsx|js|mdx)$/;
const DYNAMIC_SEGMENT = /^\[.*\]$/;
const ROUTE_GROUP = /^\(.*\)$/;

/** '[lang]/(main)/rewards/[id]/page.tsx' → '/[lang]/rewards/[id]' (prerender-manifest 의 dynamicRoutes 키와 같은 형태). */
function routeOfFile(file) {
  const segments = file
    .replace(PAGE_FILE, '')
    .split('/')
    .filter((segment) => segment && !ROUTE_GROUP.test(segment));
  return `/${segments.join('/')}`;
}

/** 블록·줄 주석을 지운다. 'https://…' 의 // 는 남긴다. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/**
 * 페이지 소스의 세그먼트 설정을 읽는다. 읽을 수 없는 형태(산술식, 타입 표기, re-export, 아직 다루지 않는 옵션)는
 * 예외로 끝낸다 — 조용히 "설정 없음"으로 읽히면 계약 테스트가 거짓으로 통과한다.
 */
function readSegmentConfig(source) {
  const code = stripComments(source);
  const config = {
    dynamic: null,
    revalidate: null,
    hasStaticParams: /^export\s+(async\s+)?function\s+generateStaticParams\s*\(/m.test(code),
  };

  if (/^export\s*\{[^}]*\b(dynamic|revalidate|dynamicParams|fetchCache)\b/m.test(code)) {
    throw new Error('세그먼트 설정을 export { … } 로 내보내면 읽을 수 없다. `export const dynamic = \'…\'` 형태로 쓴다.');
  }

  const declarations = code.match(/^export\s+(?:const|let|var)\s+(?:dynamic|revalidate|dynamicParams|fetchCache)\b.*$/gm) || [];
  for (const line of declarations) {
    const dynamic = line.match(/^export\s+const\s+dynamic\s*=\s*(['"])([a-z-]+)\1\s*;?\s*$/);
    const revalidate = line.match(/^export\s+const\s+revalidate\s*=\s*(\d+)\s*;?\s*$/);
    if (dynamic) {
      config.dynamic = dynamic[2];
    } else if (revalidate) {
      config.revalidate = Number(revalidate[1]);
    } else {
      throw new Error(`해석할 수 없는 세그먼트 설정: ${line.trim()}`);
    }
  }

  return config;
}

module.exports = {
  MODES,
  EXTRA_PRERENDERED,
  PREBUILT_LANGUAGES,
  ALL_LANGUAGES,
  PAGE_FILE,
  DYNAMIC_SEGMENT,
  routeOfFile,
  stripComments,
  readSegmentConfig,
};
