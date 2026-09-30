# 루트 레이아웃 `headers()` 제거와 ISR 전환 — 설계

- 날짜: 2026-09-30
- 근거: 감사 계획 `docs/audit-2026-09-26/plan.md` U-11(PERF-01, STR-012, PERF-22), 결정 #8(rewards/faq/notice ISR 승인), B-R3
- 상태: 머지·Production 배포 완료 (PR #103 → `c099c95e`, 2026-09-30). 교차 리뷰 4회차 APPROVE. Production 검증 결과는 §9

이 문서는 구현된 상태를 기준으로 쓴다. 승인된 초안에서 달라진 점은 §8 에 모았다.

## 1. 목표와 성공 기준

### 1.1 목표

1. 루트 레이아웃 `app/layout.tsx` 의 `headers()` 호출을 없애, 요청 시점 API 를 쓰지 않는 페이지가 정적/ISR 로 렌더될 수 있게 한다.
2. 결정 #8 에 따라 rewards, faq, notice 를 ISR 로 전환한다.
3. 위 변경으로 **의도치 않게 영구 정적으로 굳는 페이지가 하나도 없게** 한다.
4. 캐시 전환 외의 동작(URL, 상태 코드, 리다이렉트, 화면)은 Production 과 같게 유지한다. 의도적으로 바꾼 것은 §8 에 적는다.

### 1.2 목표가 아닌 것

- 서버 TTFB 개선. 이미 78~144ms 라 목적은 CDN HIT 와 함수 호출·DB 조회 비용 절감이다.
- `/vote/[id]` 의 ISR 전환. 종료 시각·노출 시각 판정·404 캐시 문제가 있어 별도 설계로 미룬다(결정: 현상 유지, 명시적 `force-dynamic`).
- `/vote` 목록 ISR. `searchParams` 를 읽는 구조라 동적으로 남는다.
- middleware 의 `x-locale` 주입 제거. 소비자가 사라지지만 테스트가 있고 무해하므로 후속 정리로 남긴다.

### 1.3 성공 기준

| 기준 | 확인 방법 |
|---|---|
| rewards·faq·notice·download 가 ISR 로 프리렌더되고, 동적으로 선언한 페이지는 프리렌더되지 않는다 | `npx next build` 뒤 `node scripts/verify-rendering-modes.js` (빌드 결과 `.next/prerender-manifest.json` 을 선언과 대조). `npm run build` 에서는 postbuild 가 자동으로 돌린다 |
| 모든 페이지에 렌더링 모드가 선언돼 있다 | `npx vitest run __tests__/app/rendering-mode-contract.test.ts` |
| `<html lang>` 이 12개 언어에서 #92 와 동일하다 (`zh-cn → zh-CN` 등) | 레이아웃 단위 테스트 + `next start` 후 curl |
| ISR 페이지 응답에 `Cache-Control: s-maxage=<revalidate>, stale-while-revalidate`, 동적 페이지에 `private, no-store` | `next start` 후 curl -I |
| Supabase 장애 때 캐시된 정상 페이지가 폴백·404 로 덮이지 않는다 | 도달 불가능한 `SUPABASE_URL` 로 `next start` (§4.7) |
| 접두어 없는 경로·인앱 브라우저 리다이렉트 체인이 Production 과 같다 | curl 로 Production 과 나란히 비교 (§4.2) |
| 머지 후 Production 에서 두 번째 요청부터 `x-vercel-cache: HIT` | curl (Preview 배포가 없으므로 Production 에서만 확인 가능) |
| 로그인, 로그아웃, 인증 콜백, 광고 플레이어, 404 페이지가 깨지지 않는다 | 로컬 스모크. **로그인 상태의 스모크는 실제 계정이 필요하다**(§6) |

빌드 출력의 라우트 표는 기준으로 쓰지 않는다. `[lang]` 레이아웃의 `generateStaticParams` 때문에 동적 페이지에도 `●` 가 붙는다. 기준은 매니페스트와 런타임 `Cache-Control` 이다.

## 2. 변경 전 구조와 문제

- `app/layout.tsx` 가 middleware 가 주입한 `x-locale` 을 `headers()` 로 읽어 `<html lang>` 을 정했다. 이 한 줄이 모든 라우트를 동적 렌더링으로 만들었다. `headers()` 의 소비자는 이것뿐이었다.
- `app/[lang]/layout.tsx` 는 이미 `params.lang` 으로 언어를 알고 `generateStaticParams`(en/ko/my) 와 `generateMetadata` 를 가진다.
- rewards 페이지는 `force-dynamic` 과 `revalidate = 60` 을 동시에 내보내 후자가 죽어 있었다. faq/notice 는 `force-dynamic` 이고 쿠키 기반 Supabase 클라이언트로 조회했다.
- 루트 `headers()` 를 없애면 숨은 문제가 드러난다.
  1. **레이아웃 안의 `useSearchParams()`**: `useLocaleRouter` 가 호출하고 Header·Footer·SubMenu·LanguageSelector 등이 이 훅을 쓴다. 정적 프리렌더에서 Suspense 밖의 `useSearchParams` 는 빌드 오류다.
  2. **우연히 동적인 페이지**: `/vote/[id]` 는 공개 클라이언트만 쓰고 `revalidate` 가 없어, 제거 즉시 첫 렌더가 영구 캐시된다. `/star-candy` 는 try/catch 로 감싼 `cookies()` 덕에, `/notice/[id]`·`/privacy`·`/terms` 는 쿠키 클라이언트 덕에 동적일 뿐이었다.
  3. **조회 실패를 가리는 폴백**: 빈 FAQ, 가짜 공지, 샘플 리워드, 버전 없는 다운로드 화면, 장애를 404 로 바꾸는 리워드 상세. 동적 렌더에서는 그 요청에만 보였지만 ISR 에서는 캐시에 저장된다.
- 사실 확인: `faqs`, `notices`, `reward` 테이블은 RLS 가 꺼져 있고 `faq_categories` 는 public SELECT(active=true), `banner` 는 anon 읽기 정책이 있어 공개 anon 키로 읽힌다. Vercel 빌드 환경에 `SUPABASE_URL`/`SUPABASE_ANON_KEY` 가 있다.

## 3. 접근법 선택

| 안 | 요약 | 판단 |
|---|---|---|
| **A. pass-through 루트 + `[lang]` 이 `<html>` 소유** | `app/layout.tsx` 는 children 만 반환. `[lang]/layout.tsx` 가 `<html lang>`·`<body>` 를 렌더. `[lang]` 밖 페이지는 `app/(bare)/` 그룹의 최소 레이아웃 아래로 이동 | **채택**. next-intl 이 문서화한 패턴. `app/[lang]` 을 옮기지 않아 `@/app/[lang]/...` import 가 안전 |
| B. 루트 유지, `<html lang="ko">` 고정 + 클라이언트 동기화 | 변경 최소 | 기각. en/my 초기 HTML 이 `ko` 로 나가 #92 이전으로 퇴행 |
| C. `app/(site)/[lang]` 로 완전 이동한 다중 루트 | 정석 | 기각. 결과가 A 와 같은데 import 대량 변경과 충돌 위험만 큼 |

루트 레이아웃(`app/layout.tsx`)은 여전히 모든 경로의 공통 루트다. 그래서 `(bare)` 와 `[lang]` 사이, 언어 사이의 이동은 전체 새로고침이 아니라 소프트 내비게이션이고, `<html>`·`<body>` 는 React 가 재사용한다. 언어를 바꾸면 `<html lang>` 도 함께 갱신된다.

## 4. 설계

### 4.1 레이아웃 구조

```
app/
  layout.tsx                 # pass-through: children 만 반환. headers()·cookies() 없음.
                             # metadata(title 'Picnic', description, google-adsense-account)는 여기서 내보낸다 — 모든 경로의 기본값
  not-found.tsx              # 자체 <html lang="ko"><body> 렌더. 인라인 스타일만 써서 CSS import 없음.
                             # 클라이언트에서 경로 언어를 감지해 document.documentElement.lang 을 갱신
  global-error.tsx           # 변경 없음 (이미 자체 <html> 렌더)
  shell.ts                   # 폰트(Inter)·AdSense 상수·viewport 공유
  sitemap.ts                 # force-dynamic 명시 (§4.3)
  open-in-browser/route.ts   # 변경 없음 (route handler 는 레이아웃 불필요)
  [lang]/
    layout.tsx               # <html lang={getLanguageTag(lang.toLowerCase()) ?? 'ko'}><head preconnect/><body className={inter}>
                             #   AdSense(프로덕션) · <div className="bg-white"><ClientLayout>…</ClientLayout></div> · CookieConsentBanner(프로덕션)
                             # globals.css, viewport, generateMetadata 는 그대로
    ...                      # 페이지별 렌더링 모드는 §4.3
  (bare)/                    # 언어 세그먼트 밖. 그룹 폴더라 URL 에 나타나지 않는다
    layout.tsx               # <html lang="ko"><body className={inter}><div className="bg-white">{children}</div></body></html>
                             # 전역 CSS·AdSense·쿠키 배너 없음 (아래 설명)
    auth/                    # 기존 app/auth (layout.tsx·callback/**·loading/)
    ads/shortform/player/    # 기존 app/ads
    vote/, vote/[id]/, mypage/, concert2025/   # 접두어 없는 진입 경로의 리다이렉트 페이지 (§4.2)
```

`<html>` 을 렌더하는 파일은 정확히 네 개다: `app/[lang]/layout.tsx`, `app/(bare)/layout.tsx`, `app/not-found.tsx`, `app/global-error.tsx`. 모든 페이지는 `[lang]` 또는 `(bare)` 아래에 있어야 한다(계약 테스트가 강제).

삭제: `app/page.tsx`(`next.config.js` 의 `/ → /en/vote` 가 먼저 잡던 죽은 코드), `app/404.tsx`(App Router 에서 라우트가 아닌 죽은 파일).

**메타데이터.** 루트 레이아웃은 아무것도 렌더하지 않아도 `metadata` 는 내보낼 수 있다. Next 가 하위 세그먼트와 병합하고 `other` 는 키 단위로 합치므로, AdSense 계정 확인 메타는 Production 처럼 모든 페이지에 한 번 실린다. 어느 라우트에도 맞지 않는 URL 의 전역 404 는 루트 레이아웃 + `not-found.tsx` 만 렌더하므로, 루트에 metadata 가 없으면 404 페이지에 `<title>` 이 없다.

**`(bare)` 에 전역 CSS 를 싣지 않는 이유.** Production 의 `/auth/*`·`/ads/shortform/player` 는 Tailwind 없이(Inter 폰트 CSS 만) 서비스된다. 예전 루트 레이아웃이 전역 CSS 를 import 하지 않았기 때문이다. `(bare)` 에서 `globals.css` 를 불러오면 preflight 가 광고 플레이어의 제목·버튼 기본 스타일을 지우고 body 배경이 바뀌어 앱 웹뷰의 화면이 달라진다. 그래서 불러오지 않는다.

**`(bare)` 에서 뺀 것(의도한 변경).** AdSense 스크립트와 쿠키 배너. 인증 콜백·광고 플레이어는 콘텐츠 페이지가 아니다. 동의 상태는 localStorage 에 있고 `[lang]` 페이지가 그대로 읽는다. CDN preconnect 도 빠진다(성능 영향 없음).

### 4.2 접두어 없는 진입 경로

`/vote`, `/vote/:id`, `/mypage`, `/concert2025` 는 **페이지**(`app/(bare)/…/page.tsx`)가 `redirect('/en/…')` 한다. `next.config.js` 의 `redirects()` 로 옮기지 않는다.

이유: 설정 리다이렉트는 middleware 보다 먼저 실행된다. 그러면 카카오톡 같은 인앱 브라우저로 `/vote/123` 을 연 사용자가 middleware 의 "외부 브라우저로 열기" 안내에 도달하기 전에 이미 `/en/vote/123` 이 되어, 안내 페이지 언어가 Accept-Language 가 아니라 `en` 으로 고정된다. 탈퇴 계정 리다이렉트의 언어도 같은 식으로 바뀐다. 페이지로 두면 Production 과 같이 middleware 가 접두어 없는 경로를 먼저 본다.

검증(Production 과 나란히 비교, 동일):

```
인앱 UA + Accept-Language: ko
/vote/123 → 307 /open-in-browser?returnTo=%2Fvote%2F123 → 308 /ko/open-in-browser?returnTo=… → 200
일반 브라우저
/vote → 307 /en/vote      /vote/295 → 307 /en/vote/295      /mypage → 307 /en/mypage      /concert2025 → 307 /en/concert2025
```

`/` 는 Production 과 마찬가지로 `next.config.js` 가 `/en/vote` 로 보낸다(변경 없음). `/vote`·`/mypage`·`/concert2025` 는 이제 정적 리다이렉트(프리렌더)이고 `/vote/[id]` 는 요청마다 렌더된다.

### 4.3 페이지별 렌더링 모드 (명시 원칙)

원칙: **우연에 기대는 페이지를 0개로 만든다.** 모든 페이지의 모드는 `scripts/rendering-modes.js` 에 선언한다(§4.8).

| 라우트 | 설정 | 결과 |
|---|---|---|
| `/[lang]/rewards` | `revalidate = 60` | ISR 60s |
| `/[lang]/rewards/[id]` | `revalidate = 300` + `generateStaticParams() → []` | ISR 300s, 온디맨드 생성 |
| `/[lang]/faq` | `revalidate = 300` | ISR 300s |
| `/[lang]/notice` | `revalidate = 300` | ISR 300s |
| `/[lang]/notice/[id]` | `revalidate = 300` + `generateStaticParams() → []` | ISR 300s, 온디맨드 생성 |
| `/[lang]/download` | `revalidate = 3600` (기존 설정이 이제 효력) | ISR 3600s, 12개 언어 프리빌드 |
| `/[lang]/concert2025` | `force-static` + 86400 (변경 없음) | 정적 |
| `/[lang]` | `redirect()` 만 | 정적 리다이렉트 |
| `/[lang]/login`, `/[lang]/mypage/qna/new` | 설정 없음, 서버 데이터 없는 클라이언트 페이지 | 정적 셸 |
| `/[lang]/vote/[id]` | **`force-dynamic` 명시** | 동적 (현상 유지) |
| `/[lang]/star-candy`, `/[lang]/privacy`, `/[lang]/terms` | `force-dynamic` 명시 | 동적 (현상 유지) |
| `/[lang]/media`, `/[lang]/mypage/qna/[thread_id]` | `force-dynamic` (변경 없음) | 동적 |
| `/[lang]/vote`, `/[lang]/mypage/**`, `/[lang]/open-in-browser` | 설정 없음. 페이지가 `searchParams`·`getServerUser()`·`headers()` 를 직접 읽음 | 동적 |
| `/auth/loading`, `/ads/shortform/player` | 설정 없음, 클라이언트 셸 | 정적 셸 |
| `/auth/callback`, `/auth/callback/[provider]` | `force-dynamic` (변경 없음) | 동적 |
| `/vote`, `/mypage`, `/concert2025` | `redirect()` 만 | 정적 리다이렉트 |
| `/vote/[id]` | `redirect()` 만, `[id]` 는 빌드에 없음 | 동적 |
| `app/sitemap.ts`, `app/[lang]/sitemap.ts` | `force-dynamic` 명시 | 동적 (현상 유지) |

`/[lang]/vote` 의 `revalidate = 60` 은 죽은 설정이라 지웠다.

**sitemap 을 캐시하지 않는 이유.** sitemap 은 투표·리워드·공지 조회가 실패해도 부분 결과를 돌려준다(구간별 try/catch). 캐시하면 URL 이 빠진 sitemap 이 굳는다. `getNotices` 가 쿠키 없는 클라이언트가 되면서 이 라우트가 정적으로 굳는 것을 막기 위해 `force-dynamic` 을 명시했다.

**공개 클라이언트.** faq·notice 조회는 `createPublicSupabaseServerClient()`(쿠키 없음)를 쓴다. 이 테이블들은 RLS 가 없어 `status = PUBLISHED`·`active = true` 필터가 유일한 공개 범위 제한이고, 테스트가 그 필터를 고정한다.

**ISR 조회 실패 원칙.** ISR 페이지의 서버 렌더는 조회 실패를 "정상처럼 보이는 화면"으로 끝내지 않는다.

- 조회 실패·타임아웃 → 예외로 전파한다. Next 는 재생성이 실패하면 마지막 정상 페이지를 계속 제공하고 다음 요청에서 다시 시도한다.
- 결과가 실제로 비어 있음 → 빈 상태를 렌더한다(오류가 아니다). 리워드가 하나도 없으면 조회 계층의 "샘플 리워드"(id -1 — 목록 카드로 렌더되는 가짜 DB 항목)를 렌더하지 않고, 기존에 준비돼 있던 빈 상태 화면 `RewardFallbackShowcase`("곧 공개될 리워드 라인업" 안내와 리워드 유형 예시 3종)를 렌더한다. 이 화면은 2025-11 부터 있던 UI 이고, 조회 계층이 빈 결과에 샘플을 돌려주던 탓에 도달할 수 없었다. 화면 내용을 바꾸는 것은 이 작업의 범위가 아니다.
- 실제로 없는 id → "없음"을 렌더·캐시한다(300s 뒤 재확인). `rewards/[id]` 는 `PGRST116`·정수가 아닌 id·범위를 벗어난 id 를 "없음"으로, 그 밖의 오류를 장애로 구분한다.
- 대상: `getFaqs`, `getFaqCategories`, `getNotices`(4초 예산), `getNoticeById`, `getLatestVersion`, `_getRewards({ throwOnError: true })`(3회 시도·7초 예산), `reward-service.getRewardById`. 페이지와 `generateMetadata` 는 이 예외를 잡지 않는다.
- `rewards/[id]` 는 예전에 페이지의 `catch` 가 프로덕션에서 모든 오류를 `notFound()` 로 바꿨다. ISR 에서는 장애로 생긴 404 가 5분간 캐시되므로 `catch` 를 없앴다.
- 리워드 목록은 `queries.ts` 의 `getRewards`(`withRetry` 로 한 번 더 감쌈)가 아니라 `_getRewards` 를 직접 부른다. 예외가 바깥 재시도를 돌리면 장애 시 최악 약 30초·쿼리 12회가 된다.

### 4.4 `useSearchParams` 제거

- `hooks/useLocaleRouter.ts`: `useSearchParams()` 를 쓰지 않는다. 언어 전환 시 **이동 직전에** `window.location` 에서 경로와 쿼리를 함께 읽는다. 전환 함수 안의 `await`(사용자 조회, 번역 로딩) 사이에 사용자가 다른 페이지로 이동할 수 있어, 렌더 시점의 pathname 에 새 쿼리를 붙이면 서로 다른 페이지의 값이 섞인다.
- `/[lang]/login`: `useSearchParams` 를 쓰는 `LoginContentInner` 는 이미 Suspense 안에 있다. 파일 변경 없음.
- `/[lang]/mypage/qna/new`: 본문을 `NewQnaForm` 으로 내리고 default export 가 `<Suspense fallback={null}>` 으로 감싼다.

### 4.5 middleware

동작은 바꾸지 않는다. `x-locale` 주석만 고쳤다. Vercel 에서 middleware 는 CDN 캐시 조회 전에 요청마다 실행되므로 ISR 페이지도 middleware 비용은 남지만 함수 렌더와 DB 조회는 건너뛴다. 세션 갱신 `Set-Cookie` 는 캐시된 응답 위에 요청별로 붙고 캐시 항목에는 저장되지 않는다.

### 4.6 데이터 흐름과 빌드

```
요청 /ko/rewards
  → next.config redirects (해당 없음)
  → middleware (x-locale 주입, 로그인 시 getClaims)
  → 캐시 HIT: 캐시 HTML 반환 (60s 내)
  → stale: 캐시 HTML 을 반환하고 뒤에서 재생성 → 성공하면 교체, 실패하면 기존 것 유지
  → 캐시 없음(프리빌드되지 않은 언어·id 의 첫 요청): 그 자리에서 생성·캐시. 실패하면 500, 캐시하지 않음
```

- **빌드 시 프리렌더.** `[lang]` 레이아웃의 `generateStaticParams`(en/ko/my)로 rewards·faq·notice 가 3개 언어, download 가 12개 언어로 프리렌더된다. 조회가 실패하면 그 페이지의 프리렌더가 실패하고 **빌드(=배포)가 실패한다**. 깨진 내용을 배포하지 않기 위한 의도된 동작이고 Vercel 은 이전 배포를 유지한다. 일시 오류로 배포가 실패하지 않도록 `experimental.staticGenerationRetryCount: 3` 을 켰다(최대 3번 시도). supabase-js 도 네트워크 실패를 자체 재시도한다(1·2·4초 백오프). 빌드 중에는 조회 하나를 30초까지 기다리고(`withDeadline` 의 `BUILD_QUERY_TIMEOUT_MS`), 예산을 넘기면 요청을 끊는다(§9.1).
- **빌드 안에서의 응답 공유.** 빌드 중의 조회는 Next 의 fetch 캐시(`.next/cache/fetch-cache`)에 저장돼 같은 조회를 하는 언어별 페이지가 응답 하나를 나눠 쓴다. 상태 200 인 응답만 저장된다. 리워드 목록은 `count` 를 요청해 206 을 받던 탓에 공유되지 않았고, 지금은 `count` 를 요청하지 않는다(§9.1).
- **배포 직후의 데이터 신선도.** fetch 캐시는 `.next/cache` 와 함께 다음 빌드에 복원된다. 복원된 항목은 파일 수정 시각으로 나이를 재기 때문에 새것처럼 보여 다시 조회되지 않았다. 그래서 새 배포의 faq·notice·download 가 예전 빌드가 받아 둔 데이터로 프리렌더되고 `revalidate` 가 지나 재생성될 때까지 옛 내용이 나갔다. 지금은 `prebuild`(`scripts/clear-build-fetch-cache.js`)가 빌드 전에 fetch 캐시를 비워 **빌드마다 현재 데이터로 프리렌더한다**. 배포 직후의 지연은 운영 중과 같다(아래).
- **운영 중의 반영 지연.** 관리자가 공지·FAQ·리워드·앱 버전을 바꾸면 최대 `revalidate` + 요청 한 번 뒤에 보인다(만료 뒤 첫 요청자는 옛 화면을 받고 그다음 요청부터 새 화면). 동적 렌더였던 이전에는 즉시 반영됐다.

### 4.7 오류 처리

도달 불가능한 `SUPABASE_URL` 로 `next start` 를 띄워 확인한 동작이다.

| 상황 | 결과 |
|---|---|
| 프리빌드된 페이지(`/ko/rewards` 등)의 재검증 주기가 지난 뒤 재생성 실패 | `x-nextjs-cache: STALE`, 마지막 정상 페이지 유지 |
| 캐시된 리워드 상세(`/ko/rewards/1`)의 재검증 주기가 지난 뒤 재생성 실패 | `STALE`, 마지막 정상 상세 유지. 404 로 바뀌지 않는다 |
| 캐시 없는 경로의 첫 요청(`/ja/faq`, `/ja/notice`, `/ja/rewards`, `/ko/rewards/2`, `/ko/notice/4`) | 500, `private, no-store`. 약 7초(notice 목록은 4초) 뒤 응답 |
| 잘못된 id(`/ko/rewards/abc`) | DB 조회 없이 "없음". Production 처럼 200 + noindex (loading 경계 때문에 상태 코드는 200) |
| `/ko/sitemap.xml` | 200, 부분 결과, 캐시 안 함 |

- 온디맨드 첫 생성이 실패했을 때 사용자가 보는 화면은 `app/[lang]/error.tsx` 가 아니라 Next 의 기본 500 페이지(영문 "500 Internal Server Error")다. 정적 생성 경로의 렌더 실패는 App Router 의 error 경계가 아니라 기본 500 으로 처리된다. DB 오류 내용은 노출되지 않는다. 이 화면은 "배포 뒤 아직 아무도 열지 않은 언어·id" + "Supabase 장애"가 겹칠 때만 보인다.
- 실패까지 걸리는 약 7초는 supabase-js 의 네트워크 재시도 시간이고 이전에도 같았다(그 뒤에 폴백을 보였다). 시간 예산(리워드 목록 7초, 공지 목록 4초)을 넘기면 진행 중인 요청을 끊는다.
- `[lang]/error.tsx`, `global-error.tsx` 는 변경 없음. `global-error` 는 자체 `<html>` 을 렌더하므로 pass-through 루트와 호환된다.
- 어느 라우트에도 맞지 않는 URL(`/ko/no/such/page`): `app/not-found.tsx` 가 자체 `<html>` 로 렌더한다. 제목과 AdSense 메타는 루트 metadata 에서 온다.

### 4.8 렌더링 모드 보증

선언 하나(`scripts/rendering-modes.js`)를 두 검사가 쓴다.

1. **소스 계약 테스트** `__tests__/app/rendering-mode-contract.test.ts` (빌드 없이):
   - `app/` 의 모든 페이지 파일(`page.tsx|ts|jsx|js|mdx`)이 표에 있고, 모두 `[lang]` 또는 `(bare)` 아래에 있다.
   - 각 페이지의 `dynamic`/`revalidate` 가 선언과 같다. 읽을 수 없는 형태(산술식, 타입 표기, re-export, `dynamicParams`·`fetchCache`)는 통과가 아니라 실패다.
   - "요청 시점 API 를 읽어 동적"인 페이지는 주석을 지운 코드에 그 호출(`await getServerUser()` 등)이 실제로 있어야 한다.
   - 정적 셸은 클라이언트 페이지이거나 `await` 가 없어야 한다.
   - `[lang]`·`(bare)` 의 레이아웃은 세그먼트 설정도 `next/headers` import 도 갖지 않는다.
2. **빌드 결과 검사** `scripts/verify-rendering-modes.js` (`npm run build` 의 postbuild, `next-sitemap` 앞):
   - 프리렌더된 모든 경로가 선언된 정적/ISR 페이지에 속하고 `revalidate` 가 선언과 같다.
   - `[lang]` 의 정적/ISR 페이지는 사전 생성하기로 한 언어마다(en·ko·my, download 는 12개 언어) 프리렌더 경로가 있어야 한다. 한 언어만 빠져도 실패한다.
   - 동적으로 선언한 페이지가 프리렌더되거나 온디맨드 정적 생성 대상이 되면 실패한다(요청 시점 API 가 사라져 조용히 굳는 경우).
   - 정적/ISR 로 선언한 페이지가 프리렌더되지 않으면 실패한다(요청 시점 API 가 끼어들어 조용히 동적이 된 경우).
   - 실패하면 빌드(=배포)가 실패한다. 의도한 변경이면 선언을 고친다. 긴급 우회는 `SKIP_RENDERING_MODE_CHECK=1`.

소스 테스트만으로는 "선언은 그대로인데 실제 모드가 바뀐" 경우를 잡지 못하고, 빌드 검사만으로는 빌드 전까지 알 수 없다. 둘을 함께 둔다.

### 4.9 sitemap 파일

postbuild 의 next-sitemap 은 프리렌더된 경로를 전부 `public/sitemap-0.xml` 에 쓴다. 프리렌더 경로가 늘면서 인증 콜백·광고 플레이어·로그인·리다이렉트 경로가 들어가게 되어 `next-sitemap.config.js` 의 `exclude` 에 추가했다. 검색엔진이 읽는 정본은 `app/sitemap.ts` 다(Production 의 `/sitemap.xml`).

## 5. 테스트

| 테스트 | 내용 |
|---|---|
| `__tests__/app/root-layout-passthrough.test.tsx` | 루트 레이아웃이 children 을 그대로 반환하고, 기본 metadata 를 내보내며, `next/headers` 를 import 하지 않는다 |
| `__tests__/app/lang-layout-html.test.tsx` | `[lang]` 레이아웃이 `params.lang` 으로 `<html lang>` 을 정한다(대소문자·미지원·악의적 값 포함), `headers()`/`cookies()` 를 부르지 않는다, AdSense 옵션과 프로덕션 분기 |
| `__tests__/app/bare-layout.test.tsx` | `(bare)` 레이아웃의 뼈대, 전역 CSS 를 불러오지 않음, 전역 not-found 의 자체 `<html>` |
| `__tests__/app/unprefixed-redirect-stubs.test.tsx` | 접두어 없는 네 경로를 페이지가 기본 언어로 보내고, `next.config.js` 는 그 경로를 리다이렉트하지 않는다 |
| `__tests__/next-config-redirects.test.ts` | 언어 루트 정규식, `app/` 바로 아래에 페이지가 없음, 프리렌더 재시도 설정 |
| `__tests__/app/rendering-mode-contract.test.ts` | §4.8 의 소스 계약 |
| `__tests__/scripts/verify-rendering-modes.test.ts` | 세그먼트 설정 파서, 빌드 결과 검사기(드리프트 시나리오: 동적 페이지의 프리렌더·온디맨드화, 미선언 경로, 주기 불일치, ISR 의 동적화, 언어 하나 누락 등), 언어 목록 동기화, postbuild 연결. 로컬에 `.next` 가 있으면 실제 매니페스트도 검사 |
| `__tests__/next-sitemap-config.test.ts` | next-sitemap 의 실제 매처로, 비콘텐츠 경로가 빠지고 콘텐츠 경로가 남는지 |
| `__tests__/hooks/useLocaleRouter.test.ts` | `useSearchParams` 미사용, 쿼리 보존, 전환 중 이동 시 경로·쿼리를 함께 읽음 |
| `__tests__/app/qna-new-suspense.test.tsx` | 문의 작성 페이지의 Suspense 경계 |
| `__tests__/lib/data-fetching/server/public-client-services.test.ts` | faq·notice 서비스: 공개 클라이언트, `next/headers` 미호출, 공개 범위 필터, 오류 전파, 빈 결과, 타임아웃 |
| `__tests__/lib/data-fetching/server/version.test.ts`, `reward-service.test.ts` | 없음(null)과 장애(예외)의 구분, 잘못된 id |
| `__tests__/utils/api/queries-content.test.ts`, `rewards-isr-budget.test.ts`, `queries.test.ts` | `throwOnError`, 빈 결과, 실제 재시도·타임아웃 합성(3회·7초) |
| `__tests__/components/server/reward/RewardListFetcher-isr.test.tsx` | 한 겹 재시도 경로 사용, 실패 전파, 빈 상태 렌더 |
| `__tests__/app/reward-detail-isr.test.tsx`, `isr-pages-propagate-failures.test.tsx` | ISR 페이지가 조회 실패를 삼키지 않는다(페이지 수준) |
| 기존 `__tests__/middleware/*` | 변경 없이 통과 |

검증 절차:

1. `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npx next build`, `node scripts/verify-rendering-modes.js`. (로컬에서는 `npm run build` 를 쓰지 않는다 — postbuild 의 next-sitemap 이 추적 중인 `public/sitemap*.xml`·`robots.txt` 를 다시 쓴다.)
2. `npx next start` 후 curl: ISR·동적 페이지의 `Cache-Control`, 언어별 `<html lang>`, 접두어 없는 경로와 인앱 UA 의 리다이렉트 체인(Production 과 비교), 404 의 제목, `(bare)` 페이지의 stylesheet 수.
3. 도달 불가능한 `SUPABASE_URL` 로 `next start`: §4.7 표.
4. 브라우저 스모크: 언어 전환 시 쿼리 보존, 로그인 페이지, ISR 페이지 렌더, hydration 오류 없음.
5. 머지 후 Production: `x-vercel-cache` HIT, 로그인/로그아웃, Sentry 신규 이슈.

## 6. 리스크와 운영

| 리스크 | 완화 |
|---|---|
| 어떤 페이지가 몰래 영구 정적화 | §4.8: 선언 + 소스 계약 + 빌드 결과 검사(배포 차단) |
| 조회 실패 시의 폴백·404 가 ISR 캐시에 저장 | §4.3 원칙 + 서비스·페이지 수준 테스트 + 장애 주입 검증 |
| 빌드가 Supabase 에 의존 | 프리렌더 재시도 3회, 빌드 중 조회 예산 30초, 시간 초과 시 요청 끊기(§9.1). 더 긴 장애 중에는 배포가 실패하고 이전 배포가 유지된다 |
| 정적 프리렌더에서 Suspense 밖 `useSearchParams` 로 빌드 실패 | §4.4. 새로 생기면 빌드 오류가 파일을 지목한다 |
| `(bare)` 이동으로 auth 콜백 경로 깨짐 | URL 은 그룹 폴더의 영향을 받지 않는다. 라우트와 curl 로 확인 |
| 임의의 언어·id 경로마다 ISR 캐시 항목이 생김 | 후속 과제(§7). 레이아웃의 `notFound()` 는 404 도 캐시 항목이 되므로 middleware 수준에서 막아야 한다 |
| Preview 배포가 없어 머지 전 실환경 확인 불가 | 로컬 `next start` 검증 + 머지 직후 Production 스모크 + 아래 롤백 절차 |
| **로그인 상태의 검증 공백** | 자동 검증은 전부 비로그인이다. 정적 셸 위의 로그인 표시, ISR 페이지에서의 로그아웃, OAuth 콜백 성공 뒤 `(bare)→[lang]` 이동, 로그인 상태의 언어 전환은 실제 계정으로 확인해야 한다. 코드상 `AuthProvider` 는 서버에서 세션을 받지 않아 정적화의 영향이 없고 Provider 재마운트는 이전과 같다 |

### 롤백

- 되돌릴 신호: `/[lang]/(rewards|faq|notice|download)` 의 5xx 증가(`vercel logs --environment production --status-code 5xx --since 5m`), 로그인 실패 신고, 페이지가 옛 내용에 굳어 있음.
- 즉시 수단: Vercel Instant Rollback(대시보드 또는 `vercel rollback <이전 배포 URL>`, 상태는 `vercel rollback status`). 빌드 없이 이전 배포로 돌아간다.
- 주의: Instant Rollback 뒤에는 이후 배포가 Production 도메인에 자동 반영되는지 대시보드에서 확인한다. 반영되지 않으면 수정 배포를 `vercel promote <배포 URL>` 로 올린다. (이 동작은 문서 검색으로 확정하지 못했다.)
- `git revert` 로 되돌리려면 새 빌드가 필요하고, 이 브랜치부터 빌드는 Supabase 조회에 의존한다. Supabase 장애 중에는 revert 빌드도 실패할 수 있으므로 그때는 Instant Rollback 을 쓴다.

### 콘텐츠 반영 지연과 긴급 삭제

- 반영 지연: rewards 최대 60초, faq·notice 최대 5분, download(앱 버전·링크) 최대 1시간. 배포 직후에도 같다(빌드마다 현재 데이터로 프리렌더한다, §4.6).
- 잘못 올린 공지를 내려도 상세 페이지가 최대 5분(+요청 한 번) 동안 남는다. 저장소에 공지·FAQ·리워드용 온디맨드 무효화는 없다.
- 즉시 지워야 할 때: Vercel 의 캐시 퍼지(`vercel cache purge`, 또는 대시보드의 CDN Cache·Data Cache 퍼지). Production 에서 이 절차를 실제로 실행해 보지는 않았다.
- 후속: 비밀키로 보호한 재검증 API(`revalidatePath`)를 두고 관리자 도구가 호출하게 한다(§7).

### Sentry

ISR 재생성 실패는 이제 예외로 전파되므로 Supabase 장애 중에는 해당 페이지 요청마다 재생성 시도와 오류 이벤트가 생길 수 있다(예전에는 폴백이 오류를 삼켰다). 대상은 rewards·faq·notice·download 와 그 상세 페이지다. 트래픽이 큰 투표 페이지는 해당하지 않는다. 사용자 영향은 없고 이벤트 쿼터의 문제다. 머지 뒤 Supabase 장애가 있으면 이벤트 수를 확인한다.

## 7. 범위 밖·후속

- **미지원 언어 세그먼트와 접두어 없는 경로**: `/xx/rewards`, `/login`(→ `/login/vote`), `/download` 는 지금처럼 `[lang]` 이 받아 200 으로 렌더한다(`<html lang>` 은 `ko` 폴백). ISR 전환 뒤에는 임의 문자열마다 캐시 항목이 생길 수 있다. middleware 에서 404·리다이렉트로 막는다.
- `/vote/[id]` ISR (종료·노출 시각, 404 캐시, 폴링과의 관계 별도 설계).
- 공지·FAQ·리워드용 온디맨드 재검증 API.
- 온디맨드 생성 실패 시의 브랜드 500 페이지.
- middleware `x-locale` 주입 제거와 관련 테스트 정리.
- `/privacy`, `/terms` 의 ISR 전환.
- `rendering-utils.ts` 의 미사용 헬퍼 정리.
- 잘못된 id 의 soft 404: `/rewards/:id`·`/notice/:id` 는 없는 id 에 200 을 돌려준다(기존 동작). ISR 전환 뒤에는 id 마다 300초 캐시 항목이 된다. 실제 404 상태 코드와 공지 상세의 `noindex` 는 별도 과제다.
- `/{lang}/rewards/null` 요청의 출처 확인(§9).
- 이 작업에서 발견한 기존 버그(이 브랜치와 무관): `VoteCard` 포디움 클릭이 접두어 없는 `/vote/:id` 로 하드 이동, 마이페이지 알림 타일의 `/notifications` 404, 약관·개인정보 페이지의 `/contact` 링크, sitemap 의 샘플 리워드 id(-1), 추적 중인 `public/sitemap.xml` 과 `app/sitemap.ts` 의 이중 소유(U-31).

## 8. 승인된 초안에서 달라진 점

| 항목 | 초안 | 구현 | 이유 |
|---|---|---|---|
| 접두어 없는 리다이렉트 | `next.config.js` 로 이동 | `(bare)` 아래의 페이지로 유지 | 설정 리다이렉트는 middleware 보다 먼저 실행돼 인앱 안내 언어가 바뀐다 (다각도 검토) |
| 조회 실패 | 폴백을 렌더(빌드가 실패하지 않게) | 예외로 전파 | 폴백이 ISR 캐시에 저장된다 (교차 리뷰 1·2차) |
| sitemap | `revalidate = 3600` | `force-dynamic` | 부분 결과가 캐시된다 (교차 리뷰 1차) |
| 루트 metadata | 없음 | 루트에서 내보냄 | 전역 404 에 제목·메타가 없어진다 (다각도 검토) |
| `(bare)` 의 전역 CSS | import | import 하지 않음 | Production 은 전역 CSS 없이 서비스 중. 광고 플레이어 화면이 달라진다 (다각도 검토) |
| 계약 테스트 | 테스트 파일 안의 표 | 공유 선언 + 빌드 결과 검사 | 선언만 보는 테스트는 실제 모드 변화를 못 잡는다 (다각도 검토) |
| 빌드 | — | 프리렌더 재시도 3회 | 빌드가 Supabase 에 의존하게 됐다 (다각도 검토) |
| 상세 페이지 ISR | `revalidate` 만 | + `generateStaticParams() → []` | 온디맨드 ISR 의 조건 (구현 중 확인) |

의도적으로 바꾼 동작: `(bare)` 페이지에서 AdSense·쿠키 배너 제거, 리워드가 0건일 때의 화면(샘플 리워드 카드 1개 → 기존 빈 상태 화면 `RewardFallbackShowcase`), 잘못된 리워드 id 의 제목("로딩 중 오류" → "찾을 수 없습니다"), 언어 전환 시 `<html lang>` 갱신.

## 9. Production 검증 (2026-09-30)

머지 커밋 `c099c95e` 의 트리는 검토한 `2c515433` 과 같다(tree `8949950d`). 배포 `dpl_A14uJSP9QmzEjN8xLQCamQuKR1pr` 는 21:40 KST 에 READY 가 됐다. 롤백 대상은 직전 배포 `dpl_6u7zsvZYbG5Z3X7xCT58yNTvrHHU`(`ead2157f`)다.

| 항목 | 결과 |
|---|---|
| 빌드 | postbuild 가 `[rendering-modes] 통과: 프리렌더 39개 경로와 온디맨드 10개 경로가 선언과 일치한다.` 를 출력했고 next-sitemap 이 실행됐다 |
| ISR(프리렌더) | `/ko/rewards`·`/en/faq`·`/ko/notice`·`/ko/download`·`/ko/login` 이 `x-vercel-cache: HIT`. `/ko/rewards` 는 60초 뒤 STALE 이 됐다가 재생성 후 HIT(age 초기화) |
| ISR(온디맨드) | `/ja/rewards` MISS → HIT, `/ko/rewards/1`·`/ko/notice/1` HIT. 캐시 기록이 반영되기까지 1~2초가 걸려 두 번째 요청은 MISS 일 수 있다 |
| 동적 | `/ko/vote`·`/ko/vote/310`·`/ko/star-candy`·`/ko/mypage`·`/ko/privacy`·`/ko/terms`·`/ko/media`·`/en/open-in-browser` 는 MISS, `private, no-store` |
| RSC | `RSC: 1` 요청은 `text/x-component`, `x-matched-path: /ko/rewards.rsc` 로 HTML 과 분리된다 |
| 쿼리·쿠키 | `?utm_source=…` 는 같은 항목 HIT. `Cookie: locale=ja` 요청도 HIT 이고 응답에 `Set-Cookie` 가 없다 |
| 404 | 지원 언어 아래 없는 경로는 정적 404(`x-matched-path: /404`, HIT). 이전에는 요청마다 렌더했다 |
| `(bare)` | `/auth/loading`·`/ads/shortform/player` 200 HIT, stylesheet 1개. code 없는 `/auth/callback` 은 기존처럼 `/login?error=auth_code_missing` 으로 307 |
| 머지 전후 비교 | 같은 44개 경로(76요청)의 상태 코드·Location·`<html lang>`·제목·robots·canonical·hreflang 을 비교했다. 차이는 세 가지다: 404 의 매칭 경로(`/_not-found` → `/404`), `/en/rewards` 의 매칭 경로(프리렌더), `/en/concert2025` 의 `<html lang>` 이 `ko` 에서 `en` 으로 교정 |
| 브라우저(익명) | rewards·rewards/1·faq·notice·download·login·mypage·404 전체 로드와 클라이언트 내비게이션(notice/4 → rewards → vote)에서 콘솔 오류 0건. 언어 전환 `/ko/vote?status=ongoing` → `/en/vote?status=ongoing` |
| 런타임 | 배포 후 5xx 0건. error 로그는 기존 원인뿐이다(미지원 언어 세그먼트의 번역 로드 실패, sitemap 핸들러). Sentry 신규 이슈 0건(배포 직후) |
| sitemap | `/sitemap.xml` 3240, `/ko/sitemap.xml` 3240(동적). `sitemap-0.xml` 은 24개 URL 이고 제외 대상은 0건 |

확인하지 못한 것: 로그인 상태의 화면 동작(실제 계정 필요), Vercel 캐시 퍼지 절차, Supabase 장애 시의 Production 동작(로컬 장애 주입으로만 확인).

배포 뒤 관찰:

- 예상대로 미지원 세그먼트가 ISR 항목이 된다. `/xx/rewards`·`/xx/faq` 는 MISS → HIT 이고, `/login`·`/wp-admin` 의 307(`/<seg>/vote`)도 HIT 다. §7 의 첫 후속 과제가 이것을 막는다.
- 잘못된 id(`/ko/rewards/99999999`, `/ko/rewards/abc`, `/ko/notice/99999999`)는 기존처럼 200(soft 404)이다. 리워드는 `noindex` 가 붙고 공지는 붙지 않는다.
- 이전 배포의 error 로그에 `/{lang}/rewards/null` 요청이 12개 언어에 고르게 있었다. sitemap 과 투표 목록의 서버 렌더 HTML 에는 그런 링크가 없어 출처를 찾지 못했다. 지금은 id 검증 덕분에 DB 조회 없이 soft 404 가 된다.
- AdSense 전면 광고(vignette)가 링크 클릭을 가로채 자동화 브라우저의 클릭 내비게이션이 막힌다. 스모크의 클라이언트 내비게이션은 `window.next.router.push` 로 했다.
- 기기 언어가 한국어인 브라우저에서 언어 선택기로 영어를 고르면 URL 과 메뉴는 영어가 되지만 `locale` 쿠키와 언어 스토어(`language-storage`)는 `ko` 로 되돌아간다. `LanguageSyncProvider` 가 저장값 `en`(기본값)을 미설정으로 취급해 기기 언어로 덮어쓰기 때문이다. 그래서 스토어 언어를 쓰는 베타 안내 문구가 `/en` 페이지에서 한국어로 나온다. 관련 코드는 이 변경에서 손대지 않았다(`changeLocale` 은 경로·쿼리 계산만 바뀜). 접두어 없는 경로의 언어를 쿠키로 정할 때 고려해야 한다.

### 9.1 배포 후 빌드 실패와 수정 (PR #105)

머지 22분 뒤의 두 번째 Production 빌드(문서만 바뀐 `b3d9d8ee`, `dpl_GH635Ys5JfRjqH9yMFi2ntnTH75n`)가 실패했다. Production 은 `c099c95e` 배포 그대로였고 사용자 영향은 없었다.

```
Error: [supabase-timeout] getRewards exceeded 7000ms
Failed to build /[lang]/(main)/rewards/page: /my/rewards after 3 attempts.
```

원인은 세 가지가 겹친 것이다.

1. **리워드 목록 응답이 빌드에서 공유되지 않았다.** 조회가 쓰지 않는 `count: 'estimated'` 를 요청해 PostgREST 가 206 을 돌려줬다(8건 요청, 전체 11건). Next 는 상태 200 인 응답만 fetch 캐시에 넣고, 같은 요청은 잠금으로 직렬화한다. en·ko·my 페이지가 요청을 차례로 따로 보냈고, 뒤 페이지는 앞 요청을 기다리는 동안 자기 예산을 소진했다.
2. **시간 초과된 요청을 끊지 않았다.** 포기한 요청이 잠금을 쥔 채 남아 재시도가 그 뒤에서 기다렸다.
3. **빌드 머신에서 본 Supabase 응답이 약 22초 동안 느렸다.** Supabase edge 로그에서 목록 요청 넷이 앞 요청이 끝난 직후 차례로 시작했고 8.6초·3.2초·5.7초·0.19초가 걸렸다. 같은 시각 다른 요청의 대부분은 0.2초대였다. 7초 예산 세 번으로는 넘기지 못했다. 느려진 이유는 특정하지 못했다.

faq·notice·version 조회는 같은 빌드에서 요청 자체가 없었다. 복원된 fetch 캐시를 그대로 썼기 때문이고, 이것이 §4.6 의 신선도 문제다.

수정(PR #105):

| 변경 | 효과 |
|---|---|
| 리워드 목록에서 `count` 요청 제거 | 응답이 200 이 되어 언어별 페이지가 응답 하나를 나눠 쓴다 |
| `rejectOnTimeout` → `withDeadline` | 예산을 넘기면 `AbortSignal` 로 조회를 끊는다. 끊은 요청은 다시 보내지 않는다(백오프 뒤에도 다시 확인) |
| 리워드 ISR 조회에서 postgrest-js 자체 재시도를 끔 | postgrest-js 는 재시도 요청에 `X-Retry-Count` 헤더를 붙이고, Next 의 fetch 캐시 키에는 요청 헤더가 들어간다. 재시도로 성공한 응답이 다른 언어 페이지의 첫 시도와 다른 키에 저장돼 공유되지 않았다. 재시도는 `withRetry` 가 같은 요청으로, 같은 간격(1초·2초 뒤)으로 한다 |
| `next build` 중 조회 예산 30초 | 느리지만 끝나는 응답을 기다린다. 런타임은 4~7초 그대로 |
| `prebuild` 가 fetch 캐시를 비움 | 빌드마다 현재 데이터로 프리렌더한다 |

재현: Supabase 앞에 지연 프록시를 두고 `next build` 를 돌렸다(연결 실패 2회 뒤 모든 목록 응답 8.6초, 워커 1개). 수정 전 코드는 `/en/rewards after 3 attempts` 로 실패했고(Production 과 같은 오류), 수정 후에는 프리렌더 실패 없이 통과했다. 같은 워크트리에서 빌드를 두 번 돌리면 두 번째 빌드의 Supabase 조회가 0건에서 5건이 된다.

남은 것: faq·version·상세 조회에는 시간 예산이 없다. 응답이 아예 오지 않으면 Next 의 페이지 생성 제한(`staticPageGenerationTimeout`, 120초)이나 함수 제한 시간까지 기다린다.
