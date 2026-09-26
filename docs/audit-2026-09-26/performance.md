# picnic-web 성능 감사 (2026-09-26)

> **읽기 전용 감사**: 소스·설정·`package.json`은 바꾸지 않았고 브랜치·커밋도 만들지 않았다. 이 파일 하나만 작성했다.
> DB(스키마·인덱스·RLS·RPC) 관련 제안은 모두 **picnic-supabase 이관 필요**로 표시했다. 이 레포에는 마이그레이션을 추가하지 않는다.

| 항목 | 값 |
|---|---|
| 대상 | `main` @ `09b0461e` |
| 프로덕션 URL | `https://www.picnic.fan`. `vercel.json`의 `picnic.fan → www` 리다이렉트와 `next-sitemap.config.js:3`의 `siteUrl`로 확인했다. |
| 설치 버전 | Next.js 15.5.23(App Router, webpack 빌드), `@supabase/ssr` 0.12.4, `@supabase/supabase-js` 2.112.3, `@sentry/nextjs` 9.47.1, Node 24 |
| 실행 위치 | 응답 헤더가 `x-vercel-id: icn1::icn1::…`이므로 엣지와 함수가 모두 `icn1`(서울)이다. Supabase `PICNIC-PROD`도 `ap-northeast-2`(서울)에 있어 같은 리전이다. |
| 측정 시각 | 2026-09-26 01:08–01:45 KST. 서울 회선에서 프로덕션을 측정했다. |
| 단위 | KB = 1,000바이트, KiB = 1,024바이트다. `br`은 brotli로 전송된 크기를 뜻한다. |

---

## 0. 핵심 요약

1. **공개 페이지가 전부 매 요청 동적 렌더링된다.** 루트 레이아웃과 `[lang]` 레이아웃이 `await headers()`를 호출해서 `revalidate` 선언이 모두 무효가 된다. 측정한 페이지 라우트 17종 가운데 CDN 캐시 HIT는 `force-static`인 `/[lang]/concert2025` 하나뿐이다. 나머지는 `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`로 응답했다(PERF-01).
2. **서버는 빠르고 병목은 클라이언트다.** 서울 기준 HTML TTFB 중앙값은 대부분 78–144ms이고, 개인정보처리방침만 165–263ms다. 스트리밍 완료는 103–183ms다. 반면 `/ko/vote`는 초기 JS가 **581 KiB(br), 1.76 MiB(raw)**다. 모바일 Lighthouse에서 **LCP 8.8–9.6s, TTI 8.8–9.6s**가 나왔다(데스크톱 LCP는 1.4s)(PERF-04, PERF-05).
3. **LCP 요소(배너·카드 이미지)가 SSR HTML에 없다.** `OptimizedImage`가 이미지 `src`를 `useEffect`에서 결정하고, 로드 전에는 `opacity-0`로 숨긴다. 그래서 LCP가 JS 하이드레이션이 끝날 때까지 밀린다(PERF-04).
4. **투표 상세는 시청자 1명당 1초마다 함수 1회와 순차 쿼리 4개를 실행한다.** 12.1일 동안 **163,258회** 호출됐고, `vote_item` 조회의 누적 DB 시간은 **3,364초**다. 모바일 앱과 같은 DB를 쓰므로 투표 이벤트 때 가장 큰 스케일 리스크다(PERF-03).
5. **미들웨어가 정적 자산까지 가로챈다.** `/images`, `/favicon`, `/locales` 요청에도 미들웨어가 돌아 익명 요청 기준 +20–27ms가 붙는다. 로그인 사용자가 `/vote`를 한 번 열 때 Auth `getUser()`가 최대 4회, `user_profiles` 조회가 3회 발생한다(PERF-06).
6. **이미 만든 성능 분기가 꺼져 있다.** `x-pathname` 헤더를 설정하는 코드가 없어서 투표 경량 레이아웃, 투표 라우트 광고 지연, `/download` 광고 제외가 모두 동작하지 않는다(PERF-02).
7. **작은 작업(S)으로 큰 효과를 볼 수 있는 항목이 많다.** Sentry Replay 제거(−134KB raw), 폴링 가시성·간격 조정과 CDN 마이크로캐시, 공개 API `s-maxage`, 미들웨어 matcher에서 정적 자산 제외, sitemap 경량화, 루트 리다이렉트 정적화가 여기에 해당한다(§5 Top 10).

---

## 1. 측정 방법과 한계

| 도구 | 방법 |
|---|---|
| curl | 라우트마다 5회(TTFB·크기), 7회(스트리밍 완료 시간), 12회(미들웨어 비교) 측정하고 중앙값을 썼다. `Accept-Encoding: br` 크기와 무압축 크기를 함께 적었다. |
| Lighthouse 13.5.0 | 스크래치 디렉터리에서 `npx`로 실행했다. 모바일 기본 프리셋(simulated throttling)으로 URL당 1회, `/ko/vote`는 2회 돌렸고 데스크톱도 1회 돌렸다. |
| 번들 분석 | 프로덕션 HTML의 `<script src>` 42개를 받아 raw·br 크기를 쟀다. acorn으로 webpack 모듈을 파싱한 뒤 문자열 지문으로 어떤 라이브러리인지 판별했다(휴리스틱). 소스맵은 공개되지 않아 404다. |
| Supabase | 읽기 전용 SQL(`pg_stat_statements`, `pg_class`)과 performance advisors를 썼다. |
| 코드 | 파일을 읽고 `grep`으로 호출 경로를 추적했다. |

**한계**
- **측정 지점이 서울 한 곳뿐이다.** 해외 사용자(12개 언어) 지연은 추정이다.
- **Lighthouse는 URL당 1–2회만 돌렸다.** `/ko/vote` LCP가 1회차 9.6s, 2회차 8.8s로 편차가 있다.
- **`pg_stat_statements`는 모바일 앱과 공유하는 DB의 누적값이다.** 2026-09-13 14:12 UTC에 리셋된 뒤 약 12.1일치다. 웹 트래픽으로 본 근거는 PostgREST 쿼리 형태(select 컬럼 순서, 임베드 구조)를 코드와 맞춰 본 것이어서 **추정**이다.
- **실행하지 않은 명령과 이유**
  - `next build`: 지시에 따라 실행하지 않았다.
  - `npm run lint`, `npx tsc --noEmit`: 성능 근거를 주지 않고 레포에 쓰기 부작용이 생길 수 있다. `tsconfig.json:20`이 `incremental: true`라 tsbuildinfo가 갱신되고, `next.config.js`가 로드되면 빌드 버전 파일을 생성하는 코드가 실행될 수 있다.
  - `npx vitest run`: 성능 근거가 아니다.
  - Playwright MCP: 레포 안 `.playwright-mcp/`에 로그를 쓰므로 Lighthouse로 대체했다.
- **측정하지 않은 대상**: 로그인이 필요한 `/[lang]/mypage/*` 하위 라우트는 측정하지 않았고, 코드로만 분석했다.

---

## 2. 라우트별 렌더링 전략·캐시 (측정)

### 2.1 페이지 라우트

- **TTFB**: 5회 측정의 중앙값이다. 두 차례 측정한 라우트는 범위로 적었다.
- **완료**: 스트리밍이 끝나는 시간의 7회 중앙값이다.
- **HTML 크기**: 무압축/br 순서다.

| 라우트 | 파일 | 선언된 segment config | 실제 동작(측정) | 캐시 헤더 / x-vercel-cache | TTFB | 완료 | HTML 크기 | 비고 |
|---|---|---|---|---|---|---|---|---|
| `/` | `app/page.tsx:5` | 없음 | 동적 307 → `/en` | private, no-store / MISS | 70ms | – | 5.7KB | 페이지 함수 안에서 `redirect()`한다. Accept-Language를 무시한다(PERF-14). |
| `/[lang]` (`/en`) | `app/[lang]/page.tsx:9` | 없음 | 동적 307 → `/en/vote` | MISS | 89ms | – | 15.1KB | 레이아웃을 렌더한 뒤 리다이렉트해서 본문이 15KB다. |
| `/[lang]/vote` | `(main)/vote/page.tsx` | `revalidate=60` (**무효**) | 동적 SSR과 Suspense 스트리밍 | private, no-store / MISS | 106–123ms | 177ms (p90 214) | 145.6 / 16.0KB | `headers()` 3곳과 `cookies()`가 원인이다(PERF-01, PERF-07). 모바일 LCP 8.8–9.6s. |
| `/[lang]/vote/[id]` | `(main)/vote/[id]/page.tsx` | 없음 | 동적 SSR, presenter가 `ssr:false` | MISS | 95–112ms | 183ms | 239.7 / 23.4KB | RSC payload가 HTML의 85%(201KB)다. 1초 폴링(PERF-03, PERF-11). 모바일 LCP 9.9s. |
| `/[lang]/rewards` | `(main)/rewards/page.tsx:11,14` | `force-dynamic` + `revalidate=60` (**모순**) | 동적 | MISS | 88–98ms | 115ms | 59.2 / 12.2KB | 모바일 CLS 0.32, LCP 8.6s(PERF-15). |
| `/[lang]/rewards/[id]` | `(main)/rewards/[id]/page.tsx:14` | `force-dynamic` | 동적 | MISS | 90–107ms | 112ms | 44.7 / 9.1KB | `getRewardById`가 metadata와 page에서 두 번 호출된다(PERF-23). |
| `/[lang]/star-candy` | `(main)/star-candy/page.tsx` | 없음 | 동적 | MISS | 84–91ms | 105ms | 62.2 / 10.0KB | 상품을 `select('*')`로 조회한다. |
| `/[lang]/media` | `(main)/media/page.tsx:4` | `force-dynamic` | 동적 | MISS | 78–87ms | 128ms | 313.6 / 16.8KB | 148개를 한 번에 렌더하고 div가 1,554개다(PERF-20). |
| `/[lang]/notice` | `(mypage)/notice/page.tsx:8` | `force-dynamic` | 동적 | MISS | 80–112ms | 105ms | 40.7 / 7.3KB | 모바일 CLS 0.20. |
| `/[lang]/notice/[id]` | `(mypage)/notice/[id]/page.tsx` | 없음 | 동적 | MISS | 93ms | – | 44.2 / 8.6KB | |
| `/[lang]/faq` | `(mypage)/faq/page.tsx:7` | `force-dynamic` | 동적 | MISS | 87–88ms | 139ms | 107.7 / **30.2KB** | br 기준으로 가장 큰 HTML이다. |
| `/[lang]/privacy` | `(main)/privacy/page.tsx` | 없음 | 동적. `react-markdown`을 서버에서 렌더한다 | MISS | 165–263ms | 171ms | 128.3 / 19.7KB | 거의 바뀌지 않는 문서라 ISR 1순위 후보다. |
| `/[lang]/terms` | `(main)/terms/page.tsx` | 없음 | 동적 | MISS | 122–141ms | 126ms | 74.0 / 13.4KB | ISR 후보다. |
| `/[lang]/download` | `download/page.tsx:7` | `revalidate=3600` + `generateStaticParams` (**무효**) | 동적 | MISS | 102–108ms | 103ms | 24.2 / 5.6KB | LCP 요소가 쿠키 동의 배너다(PERF-02). |
| `/[lang]/concert2025` | `(main)/concert2025/page.tsx:26-27` | `force-static` + `revalidate=86400` | **ISR 정상** | public, max-age=0 / **HIT** | 93ms (연결 시간 제외 51ms) | – | 82.0 / 13.3KB | CDN에 캐시되는 유일한 페이지다. |
| `/[lang]/login` | `(auth)/login/page.tsx` (client) | 없음 | 동적 | MISS | 99–141ms | 148ms | 22.7 / 6.0KB | `ClientLayout`이 이중으로 마운트된다(PERF-13). |
| `/[lang]/mypage` (비로그인) | `(mypage)/mypage/page.tsx` | 없음 | 동적 | MISS | 101–144ms | 151ms | 68.7 / 10.4KB | 레이아웃과 페이지에서 `getServerUser`를 각각 호출한다(PERF-13). |
| `/[lang]/mypage/*` 하위 | `(mypage)/mypage/**` | 일부 `force-dynamic` | 코드상 동적(`cookies`) | – | 미측정(로그인 필요) | – | – | vote-history 집계 문제(PERF-17). |
| `/[lang]/open-in-browser` | `[lang]/open-in-browser/page.tsx` | 없음 | 동적 | MISS | 90ms | – | 22.9 / 6.4KB | |
| `/open-in-browser` | `app/open-in-browser/route.ts` | – | 308 → `/en/open-in-browser` | MISS | 61ms | – | 0 | |
| `/vote`, `/vote/[id]`, `/mypage`, `/concert2025` | `app/*/page.tsx`의 `redirect()` | 없음 | 동적 307 → `/en/...` | MISS | 72–99ms | – | 약 6.2–6.8KB | 정적 리다이렉트로 바꿀 수 있다(PERF-14). |
| `/auth/callback` | `app/auth/callback/page.tsx:4` | `force-dynamic` | 307 | MISS | 83ms | – | 7.0KB | |
| `/ads/shortform/player` | `app/ads/shortform/player/page.tsx` | 없음 | 동적 | MISS | 93ms | – | 7.8 / 2.4KB | `hls.js`는 이 라우트에만 들어간다(정상). |
| `/sitemap.xml` (및 `/[lang]/sitemap.xml`) | `app/sitemap.ts`, `app/[lang]/sitemap.ts` | 없음 | **동적** | public, max-age=0 / MISS | **3,733ms** (2,934–4,275) | – | 514.6 / 17.3KB | URL 3,228개(PERF-08). |
| `/robots.txt` | `public/robots.txt` | – | 정적 | HIT | 36ms | – | 156B | |

### 2.2 API·기타 라우트

| 라우트 | 선언 | 캐시 헤더 / x-vercel-cache | TTFB | 크기 | 호출 패턴 |
|---|---|---|---|---|---|
| `/api/popups` | `force-dynamic` (`route.ts:4`) | public, max-age=0 / MISS | 66–130ms | 8B(빈 배열) | `PopupBannerLoader`가 **페이지뷰마다** 호출한다(PERF-09). |
| `/api/banners` | `force-dynamic` (`route.ts:4`) | public, max-age=0 / MISS | 72–89ms | 876B | 공개 데이터다(PERF-09). |
| `/api/votes` | 없음 | MISS | 187–231ms | 5.2KB br | 무한 스크롤·필터에서 쓴다. 후보 전체를 조회한 뒤 잘라낸다(PERF-10). |
| `/api/vote/[id]/detail` | `force-dynamic` | `no-cache` + ETag / MISS | 200 응답 138–268ms, **304도 144–175ms** | vote 295 기준 121KB raw / 12.7KB br | **1초 폴링**(PERF-03). |
| `/api/qna/categories` | 없음 | MISS | 80–86ms | 1.8KB | |
| `/api/proxy-image` | 없음 | `public, max-age=3600, s-maxage=86400`(코드) | 미측정 | – | 소셜 아바타 전용이고 캐시 헤더가 적절하다. |

### 2.3 동적 렌더링 원인 (코드 근거)

| 원인 | 위치 | 영향 범위 |
|---|---|---|
| `await headers()` | `app/layout.tsx:41` | **모든 라우트**(루트 레이아웃) |
| `await headers()` | `app/[lang]/layout.tsx:76` | `/[lang]/**` |
| `await headers()` | `components/server/banner/BannerListFetcher.tsx:57` | `/[lang]/vote` |
| `cookies()`(`lib/supabase/server.ts:27`) ← `getCurrentUserContext`(`lib/data-fetching/server/safe-operations.ts:60`) | `(main)/vote/page.tsx:84`, `app/api/votes/route.ts:72` | 투표 목록, 목록 API |
| `getServerUser()`(결과 미사용) | `app/[lang]/(mypage)/layout.tsx:21` | 마이페이지·공지·FAQ 그룹 전체 |
| `export const dynamic = 'force-dynamic'` | media, rewards, rewards/[id], faq, notice, mypage/qna/[thread_id], auth/callback×2, api/popups, api/banners, api/vote/[id]/detail 등 | 명시적 동적 |
| 캐시 태그, `unstable_cache`, `fetch(..., { next })` | **0건**. `app/[lang]/utils/rendering-utils.ts:43`의 `revalidateTagHelper`를 호출하는 곳이 없다. | 온디맨드 재검증 인프라가 없다. |

---

## 3. 측정 근거

### 3.1 진입 리다이렉트 체인 (신규 방문자)

| 시작 URL | 리다이렉트 | 최종 | 총 소요(3회) |
|---|---|---|---|
| `https://picnic.fan/` | 3회. 도메인 307 → `/` 함수 307 → `/en` 함수 307 | `/en/vote` | 300 / 389 / 408ms |
| `https://www.picnic.fan/` | 2회. 함수 307 두 번 | `/en/vote` | 272 / 274 / 275ms |

`Accept-Language: ko-KR`로 요청해도 `/en`으로 간다. `middleware.ts:64`의 `getPreferredLanguage()`는 정의만 되어 있고 호출하는 곳이 없다.

### 3.2 미들웨어 오버헤드 (익명, 캐시 HIT 자산, 12회 중앙값, TTFB − 연결 시간)

| 경로 | 미들웨어 | x-vercel-cache | 중앙값 | p25–p75 |
|---|---|---|---|---|
| `/manifest.json` | matcher에서 제외 | HIT | 29.1ms | 26.2–30.8 |
| `/robots.txt` | 제외 | HIT | 24.9ms | 22.4–25.8 |
| `/images/logo.webp` | **실행** | HIT | 52.2ms | 49.2–56.4 |
| `/favicon/favicon-32x32.png` | **실행** | HIT | 49.6ms | 45.0–53.5 |
| `/locales/ko.json` | **실행** | HIT | 49.0ms | 46.8–54.3 |
| `/ko/concert2025` | **실행** | HIT | 51.1ms | 47.8–51.5 |

미들웨어를 통과하면 요청마다 **+20–27ms**가 붙는다. 익명 요청이라 Supabase 네트워크 호출이 없는 상태에서 잰 값이다.

### 3.3 클라이언트 번들 (`/ko/vote`)

초기 `<script>`는 42개다. 합계는 raw 1,958KB, br 637KB다. 이 중 `polyfills`(`noModule`, 112.6KB / 41.3KB)는 모던 브라우저가 받지 않으므로 빼면 실질 크기는 **raw 1,845KB(1.76 MiB), br 595KB(581 KiB)**다.

| 청크 | raw | br | 주 내용(지문 분석) | Lighthouse 미사용 |
|---|---|---|---|---|
| `8274-*.js` | 712.7KB | 223.6KB | App Router 내장 react-dom, Next 라우터 런타임, **Sentry**(Replay 4모듈 134.3KB raw, brotli q11 기준 37.9KB). 모듈 302개가 한 청크에 들어 있다. | 115KB (51%) |
| `8286-*.js` | 252.8KB | 67.5KB | `@supabase/supabase-js`(GoTrue, Realtime, PostgREST, Storage) | 55KB (82%) |
| `1170-*.js` | 128.8KB | 44.3KB | `framer-motion` | 38.7KB (87%) |
| `4694-*.js` | 121.9KB | 36.5KB | `luxon`(69KB 모듈), `date-fns-tz`, `date-fns` 로케일 5종 | 23.7KB (66%) |
| `7026-*.js` | 95.1KB | 27.3KB | 투표 카드·리스트 UI | 약 21–24 KiB |
| `4286-*.js` | 56.8KB | 20.4KB | `@headlessui/react`, `zustand`, `lucide-react` | – |
| `1566-*.js` | 42.4KB | 12.8KB | 배너 캐러셀, 인증 코드 교환, auth 에러 메시지 맵 | – |
| `3172-*.js` | 28.5KB | 10.4KB | 소셜 로그인(Kakao, Google, Apple) 핸들러 | – |
| `9050-*.js` | 26.6KB | 9.2KB | **PortOne·PayPal 결제 흐름**(star-candy). 투표 페이지에는 필요 없다(PERF-05b). | – |
| `5941-*.js` | 24.4KB | 8.0KB | 인증 스토어·로그아웃 | – |
| error·not-found·global-error 4종 | 60.7KB | 23.3KB | 12개 언어 번역과 장식을 내장한 에러·404 UI(PERF-05g) | – |

**지연 로드 청크 11개(52.9 KiB)**
- `6143.js`: `ko.json`이 JS 청크로 들어간 것이다. 54.8KB raw, 전송 17.3 KiB.
- Firebase 청크 4개: 61.4KB raw, 약 22 KiB.

**서드파티**
- `gtag.js`(GA4, Firebase Analytics가 불러온다): **155.8 KiB**로 가장 큰 서드파티다. 67 KiB가 미사용이다.
- Vercel Insights: 2.3 KiB.

**Lighthouse 네트워크 집계(`/ko/vote`)**
- 요청 100건 가운데 JS 청크 52건, 642 KiB.
- `/locales/ko.json` 17.2 KiB. `6143.js`와 내용이 같다(PERF-05f).
- Inter 폰트 1개 47.5 KiB.
- `/favicon/favicon.ico` 15.1 KiB.

### 3.4 Lighthouse 13.5.0

| URL | 기기 | 점수 | FCP | LCP | TBT | CLS | SI | TTI | 전송량 | 미사용 JS | LCP 요소 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/ko/vote` (1회차) | 모바일 | 62 | 3.0s | **9.6s** | 240ms | 0 | 5.3s | 9.6s | 976 KiB | 293 KiB | 배너 이미지(`OptimizedImage`) |
| `/ko/vote` (2회차) | 모바일 | 63 | 2.8s | **8.8s** | 260ms | 0.016 | 4.4s | 8.8s | – | 293 KiB | 배너 이미지 |
| `/ko/vote` | 데스크톱 | 96 | 0.4s | 1.4s | 0ms | 0.031 | 0.8s | 1.4s | – | 293 KiB | 배너 이미지 |
| `/ko/vote/295` | 모바일 | 68 | 1.2s | **9.9s** | 240ms | 0.02 | 4.1s | 9.9s | 1,064 KiB | 277 KiB | 후보 아티스트 이미지(`loading="lazy"`) |
| `/ko/rewards` | 모바일 | 57 | 0.9s | **8.6s** | 160ms | **0.32** | 3.0s | 8.9s | 1,188 KiB | 319 KiB | 리워드 썸네일(`loading="lazy"`) |
| `/ko/notice` | 모바일 | 68 | 0.9s | 5.2s | 190ms | **0.202** | 2.6s | 6.7s | 784 KiB | 255 KiB | h2 텍스트 |
| `/ko/download` | 모바일 | 79 | 0.9s | 4.7s | 210ms | 0 | 2.5s | 4.7s | 626 KiB | 187 KiB | **쿠키 동의 배너 문구** |

**관측값(무쓰로틀) 참고**

`/ko/vote`의 관측 FCP는 1,410–1,862ms다. 같은 조건에서 `/ko/notice`, `/ko/rewards`, `/ko/vote/295`는 151–180ms였다(PERF-24).

필름스트립(2회차)은 다음과 같다.
- 750ms: 흰 화면
- 1,500ms: 전체 화면에 어두운 오버레이가 덮이고 스켈레톤이 보인다.
- 2,250ms: 콘텐츠와 쿠키 동의 배너가 나타난다.

`/ko/vote` LCP 분해(2회차 관측): TTFB 35ms, 리소스 로드 지연 328ms, 리소스 로드 15ms, **요소 렌더 지연 1,799ms**.

### 3.5 Supabase (읽기 전용 조회)

**`pg_stat_statements`**: 2026-09-13 14:12 UTC부터 2026-09-25 16:15 UTC까지, 약 12.1일치다.

| 쿼리 형태 | 역할 | 호출 | 평균 | 총 DB 시간 | 웹 귀속(추정) |
|---|---|---|---|---|---|
| `vote_item.*` + `artist.*` + `artist_group.*` (`vote_id=`) | anon | **152,297** | 21.04ms | **3,204.0s** | `/api/vote/[id]/detail` 폴링 |
| 같은 형태 | authenticated | 10,961 | 14.57ms | 159.8s | 로그인 사용자의 폴링 |
| `vote.*`(id=) / `vote_reward.reward_id` / `reward.*`(id=ANY) | anon | 152,320 / 152,297 / 150,592 | 0.03–0.07ms | 약 24s | 폴링의 나머지 3개 쿼리. 호출 수가 같다. |
| `VOTE_LIST_SELECT` 형태(`id,title,main_image,start_at,stop_at,updated_at,…`) | anon | 29,275 | 25.01ms (최대 1,384) | 732.2s | 투표 목록 SSR. #79의 NULLS LAST 개선 이후 값이다. |
| 같은 형태 | anon | 240 | **1,733.8ms** (최대 2,859) | 416.1s | sitemap의 `getVotes('all')` |

**테이블 규모(`pg_class.reltuples` 추정치)**

| 테이블 | 행 수 | 크기 |
|---|---|---|
| `vote_pick` | 785K | 245MB |
| `user_notifications` | 233K | 486MB |
| `user_profiles` | 210K | 919MB |
| `vote_item` | 84K | 20MB |
| `vote` | 257 | – |
| `artist` | 3,119 | – |

`vote_item` 실측(삭제 제외): 투표 257건, 후보 78,913행이다. 투표당 평균 307.1개, 중앙값 51개, **최대 1,568개**다.

**performance advisors(핫패스 테이블 위주)**

| 항목 | 전체 건수 | 핫패스 해당 |
|---|---|---|
| `duplicate_index` | 13건 | `vote_item`은 **동일한 인덱스 3개**(`vote_item_id_key`, `vote_item_id_uindex`, `vote_item_pkey`)가 있다. `vote`, `artist`, `reward`, `user_profiles`, `vote_pick`, `star_candy_history`에도 PK와 unique가 중복된다. |
| `auth_rls_initplan` | 66건 | `user_notifications` 2, `qna_threads` 5, `qna_messages` 3 |
| `multiple_permissive_policies` | 333건 | `user_profiles` 14, `qna_threads` 52, `qna_messages` 52, `banner` 1 |
| `unindexed_foreign_keys` | 103건 | `vote_item.artist_id`, `vote_item.group_id`, `vote_reward.reward_id`, `artist.group_id` 등 |
| `auth_db_connections_absolute` | – | **Auth 서버 DB 커넥션이 최대 10개로 고정**되어 있다. |

**JWKS**: `/auth/v1/.well-known/jwks.json`에 **EC/ES256 서명 키**가 있다. 그래서 `getClaims()`로 로컬 JWT 검증이 가능하다. 다만 현재 발급되는 토큰의 `alg`는 확인하지 못했다.

### 3.6 Sentry 샘플링 (프로덕션 번들에 인라인된 값)

- **클라이언트**(`main-app` 청크)
  - `tracesSampleRate = parseFloat("0.1")`
  - `replaysSessionSampleRate = parseFloat("0")`
  - `replaysOnErrorSampleRate = parseFloat("0")`
  - Vercel env가 코드 기본값(0.02, 0.0, 1.0)을 덮어쓴다.
- **서버**: `sentry.server.config.js:21`에 0.1이 하드코딩되어 env로 조정할 수 없다.
- **엣지(미들웨어)**: `sentry.edge.config.js:21`에 0.05가 하드코딩되어 있다.

---

## 4. 발견사항

**심각도**
- P0: 치명
- P1: 높음
- P2: 중간
- P3: 낮음

**작업량**
- S: 1일 이내
- M: 2–5일
- L: 1주 이상

| ID | 심각도 | 제목 |
|---|---|---|
| PERF-01 | P1 | 레이아웃 `headers()` 때문에 모든 페이지가 동적 렌더링된다. ISR·CDN 캐시가 0%다. |
| PERF-02 | P1 | `x-pathname` 헤더가 설정되지 않아 경로 기반 성능 분기가 전부 비활성이다. |
| PERF-03 | P1 | 투표 상세 1초 폴링: 시청자당 초당 함수 1회와 순차 쿼리 4개 |
| PERF-04 | P1 | LCP 이미지가 SSR HTML에 없다(`OptimizedImage`). 모바일 LCP가 8.6–9.9s다. |
| PERF-05 | P1 | 초기 JS 581 KiB(br). 세부 원인 05a–05h |
| PERF-06 | P1 | 미들웨어가 정적 자산까지 실행되고, 로그인 요청마다 Auth·DB를 왕복한다. |
| PERF-07 | P2 | 투표 목록 SSR이 불필요한 사용자 컨텍스트를 직렬로 기다린다. |
| PERF-08 | P2 | sitemap이 3.7초 걸린다. 모든 투표와 후보를 조인하고 캐시가 없다. |
| PERF-09 | P2 | `/api/popups`와 `/api/banners`에 CDN 캐시가 없다. |
| PERF-10 | P2 | `/api/votes`가 후보 전체를 조회한 뒤 JS에서 잘라낸다. |
| PERF-11 | P2 | 투표 상세 SSR이 3단계 직렬 쿼리에 과다 컬럼을 쓴다. RSC가 201KB다. |
| PERF-12 | P2 | Firebase: gtag 156 KiB, FCM이 페이지 로드마다 권한 요청과 토큰 재등록을 한다. |
| PERF-13 | P2 | Provider가 이중·삼중으로 마운트되고, 결과를 쓰지 않는 서버 인증 호출이 있다. |
| PERF-14 | P2 | 진입 리다이렉트 체인이 함수를 2회 거친다. |
| PERF-15 | P2 | CLS(리워드 0.32, 공지 0.20). styled-jsx가 SSR에 주입되지 않는다. |
| PERF-16 | P2 | 이미지 파이프라인: 이중 변환, 캐시 TTL 1시간, `priority` 남용 |
| PERF-17 | P2 | 마이페이지 투표 내역이 행 전체를 조회한 뒤 JS에서 집계한다. |
| PERF-18 | P2 | DB 레벨: 중복 인덱스, RLS initplan, permissive 정책, Auth 커넥션 10개(picnic-supabase 이관 필요) |
| PERF-19 | P3 | Sentry 샘플링과 서버 설정 |
| PERF-20 | P3 | `/media` 148개를 한 번에 렌더한다(HTML 314KB). |
| PERF-21 | P3 | 투표 카드마다 1초 타이머가 따로 돈다. |
| PERF-22 | P3 | 무효·모순된 config와 구식 실험 옵션 |
| PERF-23 | P3 | `rewards/[id]` 중복 조회(추정) |
| PERF-24 | P2 | `/ko/vote` 모바일 첫 페인트 지연과 전체 오버레이(원인 미확정) |

---

### PERF-01 [P1] 레이아웃의 `headers()` 때문에 모든 페이지가 동적 렌더링된다 (ISR·CDN 캐시 0%)

- **근거**
  - `app/layout.tsx:41`, `app/[lang]/layout.tsx:76`, `components/server/banner/BannerListFetcher.tsx:57`에서 `await headers()`를 호출한다.
  - 그래서 `(main)/vote/page.tsx:1`의 `revalidate = 60`과 `download/page.tsx:7`의 `revalidate = 3600`이 무효가 된다.
  - 측정: 페이지 17종 중 16종이 5회 모두 `private, no-cache, no-store`와 `MISS`로 응답했다(§2.1).
- **재현**: `curl -sI https://www.picnic.fan/ko/vote | grep -iE 'cache-control|x-vercel-cache'`를 실행하면 항상 `MISS`가 나온다.
- **영향**
  - 모든 HTML·RSC 요청이 `icn1` 함수를 호출하고 Supabase를 조회한다. 공개 데이터 페이지(투표 목록, 리워드, 공지, FAQ, 약관, 다운로드)도 CDN에서 응답하지 못한다.
  - 서울 사용자의 TTFB는 90–120ms로 괜찮다. 하지만 12개 언어의 해외 사용자는 매 요청마다 `icn1`까지 왕복한다(추정 +100–300ms, 미측정).
  - 코드에 적힌 `revalidate`와 실제 동작이 달라 유지보수자가 캐시된다고 착각하게 된다.
- **최소 수정 방향**
  1. 레이아웃에서 `headers()`를 없앤다. 언어는 `params.lang`에서 가져온다. `<html lang>`은 `app/[lang]/layout.tsx`가 렌더하게 옮기고(루트 레이아웃은 통과만 한다), 투표 전용 경량 레이아웃은 헤더를 읽는 대신 라우트 그룹으로 나눈다.
  2. 공개 페이지에서 `cookies()` 경로를 없앤다(PERF-07).
  3. 그다음 `revalidate`를 건다(목록 30–60초, 약관·다운로드 3600초). 운영 데이터를 바꿀 때 `revalidateTag`를 쓰도록 캐시 태그를 도입한다.
  4. 사용자별 영역은 클라이언트에서 처리한다. Next 16으로 올리면 Cache Components/PPR로도 처리할 수 있다.
- **작업량**: L
- **회귀 위험**: 중–높음
  - `<html lang>`, 광고 게이팅, VoteLite 레이아웃 활성화(PERF-02)가 한꺼번에 바뀐다.
  - 캐시된 HTML에 사용자별 데이터(예: admin 필터)가 섞이지 않는지 반드시 확인해야 한다.

### PERF-02 [P1] `x-pathname`·`x-url` 헤더를 설정하는 코드가 없어 경로 기반 성능 분기가 전부 꺼져 있다

- **근거**
  - 헤더를 읽는 곳은 3곳(`app/layout.tsx:42-43`, `app/[lang]/layout.tsx:77`, `BannerListFetcher.tsx:58`)인데, 설정하는 곳은 **0곳**이다(`grep`). `middleware.ts:84`는 원본 요청 헤더를 그대로 넘긴다.
  - 프로덕션 `/en/vote` HTML이 `<html lang="ko">`이고, 배너 링크가 `https://www.picnic.fan/ko/vote/...`를 가리킨다.
  - Lighthouse `/ko/download`의 LCP 요소가 `p#cookie-consent-description`이다.
- **영향**
  - `VoteLiteClientLayout`(fc68b750 "perf: lighten vote layout providers")이 한 번도 적용되지 않는다. `git log -S x-pathname --all` 기준으로 이 헤더를 설정한 커밋이 없다. 투표 경로에도 전체 `ClientLayout`과 `MainLayoutClient`가 이중으로 붙는다.
  - `app/layout.tsx:66, 83-87`의 투표 라우트 AdSense 5초 idle 지연(PICNIC-WEB-5C 완화책)이 적용되지 않는다. `delayUntilIdle=false`라서 동의한 사용자는 즉시 광고를 로드한다.
  - `/download`의 광고·쿠키 배너 제외(`app/layout.tsx:64-65`)가 동작하지 않는다. 그 결과 쿠키 배너가 `/download`의 LCP 요소(4.7s)가 된다.
  - (정확성 부작용) `<html lang>`이 항상 `ko`다. 영어 사용자의 배너 링크도 `/ko`로 연결된다.
- **최소 수정 방향**
  - 미들웨어에서 헤더를 주입하는 방식은 **권하지 않는다.** "모든 페이지가 동적" 구조가 굳어진다.
  - PERF-01과 함께 `params`와 라우트 그룹 기반으로 바꾼다.
  - `VoteLiteClientLayout`은 `<Suspense fallback={children}>`과 `ssr:false` Provider를 조합한 구조다. 활성화하면 children이 SSR fallback과 클라이언트 Provider 트리에서 두 번 마운트될 가능성이 있다(추정). 활성화 전에 따로 검증해야 한다.
- **작업량**: M
- **회귀 위험**: 중

### PERF-03 [P1] 투표 상세 1초 폴링: 시청자 1명당 초당 함수 1회와 순차 쿼리 4개

- **근거**
  - `components/server/vote/VoteDetailFetcher.tsx:47`에서 `pollingInterval={1000}`을 쓴다.
  - `components/client/vote/detail/useVotePolling.ts:244-247`의 `setInterval`에는 가시성 확인도, 종료된 투표 확인도 없다.
  - `app/api/vote/[id]/detail/route.ts:25, 37, 54, 66`이 순차 쿼리 4개(`vote *`, `vote_item *`+`artist *`+`artist_group *`, `vote_reward`, `reward *`)를 실행한다. ETag는 **4개 쿼리를 모두 실행한 뒤**에 계산하므로 304 응답도 144–175ms가 걸린다.
- **측정**
  - vote 295(후보 115명) 200 응답: 121KB raw, 12.7KB br. 후보가 가장 많은 투표(1,568명)는 이에 비례하면 1회 응답이 약 1.6MB raw다(추정).
  - Lighthouse 실행 한 번에 `/api/vote/295/detail`이 **45회** 호출됐다.
  - `pg_stat_statements` 12.1일 누적: anon 152,297회 + authenticated 10,961회 = **163,258회**(하루 약 1.35만 회). `vote_item` 쿼리 평균은 21ms, 누적 DB 시간은 **3,364초**다.
- **재현**: `/ko/vote/295`를 열고 DevTools Network에서 `detail` 요청이 1초마다 나가는지 본다.
- **영향**
  - 동시 시청자 N명이면 초당 함수 N회와 쿼리 4N회가 발생한다. 예를 들어 1,000명이면 초당 함수 1,000회, 쿼리 4,000회다(산술 추정).
  - 모바일 앱과 같은 DB라 투표 이벤트 때 앱까지 느려질 수 있다. 부하에 따라 P0로 커질 수 있다.
  - 모바일 사용자는 득표가 계속 바뀌는 동안 시간당 약 45MB(br)를 받고, 매초 121KB JSON을 파싱한다(vote 295 기준, 12.7KB × 3,600).
  - (부수 버그) `useVotePolling.ts:262` 효과의 deps가 `[]`라서 인터벌이 첫 렌더의 클로저를 쓴다. 이때 `user=null`이므로 폴링 중 `vote_pick` 갱신이 실행되지 않는다. 기능 확인이 필요하다.
- **최소 수정 방향**
  1. `document.hidden`이면 멈추고 `visibilitychange`로 다시 시작한다.
  2. 간격을 5초 이상으로 늘리고 지수 백오프를 적용한다. `stop_at`이 지난 투표는 폴링하지 않는다.
  3. 응답을 `vote_item(id, vote_total, updated_at)`만으로 줄인다. 아티스트 메타데이터는 초기 SSR 데이터를 재사용한다.
  4. 쿼리는 `createPublicSupabaseServerClient`로 쿠키 없이 1개(임베드) 또는 RPC로 만든다. 여기에 `Cache-Control: public, s-maxage=2, stale-while-revalidate=5`를 붙이면 시청자 수와 상관없이 투표 1건당 원본 호출이 0.5 req/s 이하로 제한된다.
  5. 장기적으로는 Supabase Realtime broadcast를 검토한다.
- **작업량**: S–M
- **회귀 위험**: 낮음–중. 실시간 체감이 달라지므로 간격은 제품 판단이 필요하다. ETag/304 계약은 유지한다.

### PERF-04 [P1] LCP 이미지가 SSR HTML에 없다 (`OptimizedImage`가 클라이언트에서 src를 정하고 opacity로 페이드)

- **근거**
  - `components/ui/OptimizedImage.tsx:61`에서 `currentSrc`의 초기값이 `''`다.
  - `:164-200`의 `useEffect`에서 `window.innerWidth`와 DPR로 폭을 계산한 뒤에야 `setCurrentSrc`를 호출한다.
  - `:285`는 `isInView && currentSrc`일 때만 `<Image>`를 렌더한다.
  - `:293`은 로드 전 `opacity-0`, 이후 `transition-opacity duration-500`을 적용한다.
  - 배너(`components/client/banner/BannerItem.tsx:23-31`), 투표 카드, 리워드 카드가 모두 이 컴포넌트를 쓴다.
  - SSR HTML에 배너 `<img>`가 없다. 스트리밍 경계 `<template id="B:3">` 안에 스켈레톤만 있다.
- **측정**
  - 모바일 LCP: `/ko/vote` 8.8–9.6s, `/ko/vote/295` 9.9s, `/ko/rewards` 8.6s. LCP 요소는 모두 이 컴포넌트의 이미지다.
  - LCP 분해(관측): 요소 렌더 지연 1.5–1.8s, 배너 이미지 요청 시작 347ms(HTML은 30ms).
  - `/ko/vote/295`와 `/ko/rewards`에서는 LCP 이미지에 `loading="lazy"`가 붙어 있다.
- **영향**: 모바일 LCP가 "나쁨"(> 4s)이다. 이미지 요청이 JS 581 KiB의 다운로드·실행·하이드레이션을 기다린 뒤에야 시작된다.
- **최소 수정 방향**
  - `priority` 경로에서는 서버가 결정적인 `src`로 `<Image>`를 렌더하게 한다. CDN 변환 URL은 서버에서 계산하고, 반응형 폭은 `sizes`/`srcset`에 맡긴다.
  - 우선순위 이미지에서는 opacity 페이드를 없앤다.
  - 첫 배너와 첫 카드에만 `priority`를 주고 `loading="lazy"`를 뺀다.
  - 폴백·에러 처리는 유지한다.
- **작업량**: M
- **회귀 위험**: 중. 공용 이미지 컴포넌트라 이미지 크기와 CDN 파라미터를 전 화면에서 확인해야 한다.

### PERF-05 [P1] 초기 JS 581 KiB(br), 1.76 MiB(raw): 모바일 TTI 8.8–9.9s의 주요 원인

- **근거**
  - §3.3 청크 표
  - Lighthouse: 미사용 JS 255–319 KiB, TBT 160–260ms
  - `8274` 청크 롱태스크 189ms와 105ms, bootup 0.8s
- **영향**: 모든 페이지가 같은 공통 청크를 받는다. 저가형 안드로이드에서 파싱·실행 비용이 LCP·INP로 바로 이어진다.
- **세부 원인**: 아래 각 항목이 독립적으로 고칠 수 있는 단위다.

**PERF-05a [P2] Sentry Replay 통합을 늘 번들하지만 프로덕션 샘플링이 0/0이다**
- **근거**: `instrumentation-client.ts:95`에서 `replayIntegration`을 등록한다. 프로덕션 번들에는 `replaysSessionSampleRate`와 `replaysOnErrorSampleRate`가 모두 `parseFloat("0")`으로 인라인되어 있다.
- **영향**: Replay 모듈 134KB raw(brotli 약 38KB)가 모든 사용자에게 전송·파싱되지만 사용되지 않는다.
- **최소 수정**: 통합을 제거한다. Replay가 필요할 때만 `Sentry.lazyLoadIntegration('replayIntegration')`으로 샘플링이 0보다 클 때 로드한다.
- **작업량**: S
- **회귀 위험**: 낮음. 지금도 Replay를 수집하지 않는다.

**PERF-05b [P2] 배럴 import로 관계없는 클라이언트 모듈이 들어온다**
- **근거**
  - `components/client/index.ts:1`은 `'use client'` 배럴로, `:17` media, `:23` star-candy 등 전부를 재수출한다.
  - `components/server/index.ts:27-30`에는 데모 컴포넌트 `ParallelDataFetching`, `ServerClientBoundary`, `VoteDataExample`이 들어 있다. `ServerClientBoundary`는 `@/components/client` 배럴을 import한다.
  - `(main)/vote/page.tsx:7`이 이 서버 배럴을 import한다.
- **영향**: 투표 페이지 초기 JS에 **PortOne·PayPal 결제 청크(9050, 9.2KB br)** 같은 무관한 모듈이 들어온다. 정확한 절감량은 번들 분석기로 확인해야 한다.
- **최소 수정**: 직접 경로로 import한다. 데모 컴포넌트를 배럴에서 빼거나 삭제하고, `'use client'` 배럴은 없앤다.
- **작업량**: S–M
- **회귀 위험**: 낮음

**PERF-05c [P2] 날짜 라이브러리 2종과 로케일 5종**
- **근거**: `utils/date.ts` 배럴이 `utils/date/timezone.ts`(luxon), `formatters.ts`(date-fns, date-fns-tz), `date-constants.ts`(로케일 5종)를 묶는다. `components/client/vote/list/VoteCard.tsx:7`과 `OngoingVoteItems.tsx:7`이 이 배럴을 쓴다.
- **영향**: 청크 `4694`가 122KB raw, 36.5KB br이고 66%가 미사용이다.
- **최소 수정**: `Intl.DateTimeFormat`(timeZoneName)과 `Intl.RelativeTimeFormat`으로 바꾸거나 라이브러리 하나로 통일한다. 로케일은 동적으로 로드한다.
- **작업량**: M
- **회귀 위험**: 중. 시간대 표기가 달라질 수 있다.

**PERF-05d [P2] framer-motion 전체 번들**
- **근거**: 청크 `1170`이 128.8KB raw, 44.3KB br이고 87%가 미사용이다. 9개 client 파일에서 쓴다.
- **최소 수정**: `LazyMotion`, `m`, `domAnimation`을 쓰거나 CSS transition으로 바꾼다.
- **작업량**: S–M
- **회귀 위험**: 낮음–중

**PERF-05e [P2] webpack `splitChunks`를 통째로 덮어쓴다**
- **근거**: `next.config.js:108-119`의 `chunks:'all', maxInitialRequests:25, minSize:20000` 설정 때문에 Next 기본 cacheGroups(framework, lib)가 사라진다.
- **영향**: React, Next 런타임, Sentry가 712KB 단일 청크(8274)로 합쳐진다. 배포 때 이 중 하나만 바뀌어도 224KB(br)를 다시 받아야 할 가능성이 있다(추정). 롱태스크 189ms가 발생한다.
- **최소 수정**: 커스텀 `splitChunks`를 제거하고 Next 기본값을 쓴다. Sentry의 `widenClientFileUpload`와 `applicationKey` 설정은 그대로 둔다.
- **작업량**: S
- **회귀 위험**: 낮음. 청크 해시는 한 번 전부 바뀐다.

**PERF-05f [P2] 번역을 두 번 다운로드한다**
- **근거**: `hooks/useTranslations.ts:54`의 `import()`가 청크 `6143`(54.8KB raw, 17.3 KiB)을 받고, `stores/languageStore.ts:69`의 `fetch('/locales/ko.json')`(58.5KB raw, 17.2 KiB)이 같은 데이터를 한 번 더 받는다.
- **영향**: 같은 데이터를 두 번 전송하고 파싱한다. `/locales` 요청은 미들웨어도 거친다.
- **최소 수정**: 한 경로로 통일한다. 가장 좋은 방법은 서버에서 필요한 키만 props로 넘기는 것이다.
- **작업량**: S–M
- **회귀 위험**: 중. 번역이 빠질 수 있다.

**PERF-05g [P3] 에러·404 경계 4종을 매 페이지 로드한다**
- **근거**: `app/[lang]/error.tsx`, `app/[lang]/not-found.tsx`, `app/not-found.tsx`, `app/global-error.tsx`가 모두 client 컴포넌트이고 12개 언어 번역과 장식을 내장한다. 합계 60.7KB raw, 23.3KB br.
- **최소 수정**: not-found를 서버 컴포넌트로 바꾸고, 장식과 번역은 지연 로드한다.
- **작업량**: S
- **회귀 위험**: 낮음

**PERF-05h [P3] 브라우저 supabase-js 67.5KB(br)의 82%가 미사용이다**
- **근거**: 브라우저가 Supabase를 직접 조회한다(`vote_pick`, 알림, 프로필 등).
- **최소 수정**: 조회를 서버나 Route Handler로 옮긴다. 인증 흐름 전체와 얽혀 있어 장기 과제다.
- **작업량**: L
- **회귀 위험**: 중

### PERF-06 [P1] 미들웨어가 정적 자산을 포함한 거의 모든 요청에서 Supabase 클라이언트를 만들고 `getUser()`와 프로필 조회를 실행한다

- **근거**
  - `middleware.ts:217-218`의 matcher는 `api`, `_next/static`, `_next/image`와 일부 파일만 제외한다. 그래서 `/images/*`, `/favicon/*`, `/locales/*`, `/firebase-messaging-sw.js`, RSC 요청까지 미들웨어가 실행된다.
  - `:130`에서 `createServerClient`를 만들고, `:154`에서 `auth.getUser()`를 호출한다(로그인 상태면 Auth 서버 왕복). `:164`에서 `user_profiles.deleted_at`을 조회한다(로그인 상태면 PostgREST 왕복).
  - 미들웨어는 Edge 런타임(Next 15.5 기본값)에서 실행된다.
- **측정**: 미들웨어를 통과하는 정적 자산의 TTFB는 49–52ms, 통과하지 않는 자산은 25–29ms다. 익명 요청에서도 **+20–27ms**가 붙는다(§3.2). `/ko/vote` 한 번 열 때 미들웨어를 거치는 요청은 문서, `/locales/ko.json`, 파비콘 2개로 최소 4건이다.
- **영향**
  - 로그인 사용자가 `/vote`를 한 번 열 때 Auth `getUser()`가 **최대 4회** 발생한다. 미들웨어, 페이지의 `getCurrentUserContext`, 클라이언트 `AuthStore`(`lib/supabase/auth-store-auth.ts:51`), `/api/user/profile`(`route.ts:88`, `lib/supabase/auth-store-profile.ts:122`에서 호출)이 각각 호출한다.
  - `user_profiles` 조회는 3회 발생한다.
  - advisor에 따르면 Auth 서버 DB 커넥션이 **10개로 고정**되어 있다. 트래픽이 몰리면 여기서 줄이 설 위험이 있다.
- **최소 수정 방향**
  1. matcher에서 확장자가 있는 경로를 제외한다(예: `.*\.(?:png|jpe?g|webp|svg|ico|json|txt|xml|js|woff2?)$`).
  2. `sb-*-auth-token` 쿠키가 있을 때만 Supabase를 호출한다. `getUser()` 대신 `getClaims()`를 쓴다. JWKS에 ES256 키가 있으므로 로컬 검증이 가능하다. 단, 현재 토큰의 `alg`를 먼저 확인해야 한다.
  3. 탈퇴 계정 확인은 로그인·콜백 흐름과 민감한 API로 옮기거나 JWT claim으로 대체한다. 방어 계층 자체는 유지한다.
  4. Edge 런타임은 deprecated라는 안내가 있다. 다만 Node 미들웨어로 옮기면 함수 리전(icn1)에서 실행되어 해외 요청마다 RTT가 붙을 수 있다(추정). 그러니 matcher를 좁히는 일부터 한다.
- **작업량**: S–M
- **회귀 위험**: 중. 세션 쿠키 갱신 동기화와 탈퇴 차단 위치가 바뀐다.

### PERF-07 [P2] 투표 목록 SSR이 불필요한 사용자 컨텍스트를 직렬로 기다린다

- **근거**: `(main)/vote/page.tsx:84-96`에서는 `status`가 admin이 아니어도 `getCurrentUserContext()`(`cookies` → `getUser` → `user_profiles`)가 끝나야 `getVotes`가 시작된다(`safeStatusPromise.then`). `VoteListFetcher.tsx:39-49`의 폴백 분기도 같은 로직이다.
- **영향**
  - 로그인 사용자는 목록 쿼리 전에 Auth와 DB를 **2회 직렬 왕복**한다. 미들웨어의 2회는 별도다.
  - 페이지가 `cookies()`에 묶여 ISR로 바꿀 수 없다.
  - 익명 사용자는 세션이 없어 네트워크 호출이 없다.
- **최소 수정**: `status === 'admin'`일 때만 사용자를 확인한다. 기본 경로는 곧바로 `getVotes`를 호출한다.
- **작업량**: S
- **회귀 위험**: 낮음. admin 필터의 권한 확인은 그대로 둔다.

### PERF-08 [P2] sitemap이 3.7초 걸린다: 모든 투표와 후보를 조인한 뒤 id만 쓰고, 캐시도 없다

- **근거**
  - `app/[lang]/sitemap.ts:166`의 `getVotes('all')`은 후보 수 제한 없이 투표 257건 × 후보 78,913행(실측) × 아티스트를 조인한다(`lib/data-fetching/server/vote-service-query.ts`의 `voteItemLimit`이 `undefined`).
  - `:183`과 `:200`의 쿼리 3개가 순차로 실행된다.
  - `:156`의 `lastModified: new Date()` 때문에 결과가 요청마다 달라진다.
  - `detectAppPages()`가 런타임에 `fs`로 디렉터리를 읽는다.
- **측정**: TTFB 중앙값 3,733ms(2,934–4,275ms), URL 3,228개, 캐시 MISS. `pg_stat_statements`에서 같은 형태의 anon 쿼리가 240회, 평균 1,734ms였다(추정 귀속). `robots.ts`가 알리는 `/ko/sitemap.xml`과 `/en/sitemap.xml`도 같은 비용이 든다.
- **최소 수정**: sitemap 전용 경량 쿼리(`vote: id, updated_at, created_at`)를 만들고 `Promise.all`로 병렬 실행한다. `export const revalidate = 3600`을 넣고 정적 페이지의 `lastModified`는 고정값으로 바꾼다.
- **작업량**: S
- **회귀 위험**: 낮음
- **참고**: `public/sitemap.xml`도 git에서 추적되고 `.gitignore`에도 있어 app route와 겹친다. 별도로 정리해야 한다.

### PERF-09 [P2] 공개 API `/api/popups`와 `/api/banners`에 CDN 캐시가 없다

- **근거**: 두 `route.ts`가 모두 `:4`에서 `dynamic = 'force-dynamic'`이고 `Cache-Control`을 지정하지 않는다. 응답은 `public, max-age=0`, `MISS`다. `components/client/common/PopupBannerLoader.tsx:20`의 SWR이 **페이지를 로드할 때마다** `/api/popups`를 호출한다.
- **측정**: TTFB 66–130ms. 현재 응답은 8B(빈 배열)이지만 매번 함수와 DB를 호출한다.
- **최소 수정**: 두 API 모두 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`을 넣는다. 또는 `revalidate = 60`으로 바꾸고 `force-dynamic`을 제거한다.
- **작업량**: S
- **회귀 위험**: 낮음. 팝업·배너 변경이 최대 60초 늦게 반영된다.

### PERF-10 [P2] `/api/votes`가 후보 전체를 조회한 뒤 JS에서 3개나 24개로 자른다

- **근거**
  - `app/api/votes/route.ts:13-37`의 `DEFAULT_VOTE_QUERY`에는 `vote_item` 제한이 없고, `reward:reward_id (*)`로 모든 컬럼을 가져온다.
  - `:134-155`에서 정렬하고 `slice(0, 3)`으로 자른다.
  - `:72`는 요청마다 `getCurrentUserContext()`를 호출한다.
  - SSR 경로(`buildVoteQuery`)는 #79 이후 `limit(…, { referencedTable: 'vote_item' })`과 NULLS LAST로 최적화되었는데, 이 API에는 반영되지 않았다.
- **영향**: 12건 페이지 하나에서 후보 수백~수천 행(중앙값 51 × 12 ≈ 600행, 평균 307 × 12 ≈ 3,700행)을 DB에서 함수로 옮긴 뒤 버린다. 측정 TTFB는 187–231ms다. 현재 호출량은 많지 않은 것으로 보인다(추정). 하지만 무한 스크롤과 필터 변경 때마다 발생한다.
- **최소 수정**: `buildVoteQuery`를 재사용한다. `getCurrentUserContext`는 admin일 때만 호출한다.
- **작업량**: S
- **회귀 위험**: 낮음

### PERF-11 [P2] 투표 상세 SSR이 3단계 직렬 쿼리에 과다 컬럼을 쓴다 (RSC 201KB)

- **근거**
  - `components/server/vote/VoteDetailFetcher.tsx`에서 `getVoteById`가 끝난 뒤 `Promise.all(getVoteItems, getVoteRewards)`를 실행한다. `getVoteRewards` 안에서 다시 `vote_reward` → `reward`를 순차 조회한다(`utils/api/queries-vote.ts:192-230`).
  - 그래서 최소 3 RTT가 걸리고 `vote_item *`, `artist *`, `artist_group *`, `reward *`를 전부 가져온다.
  - 1 RTT로 끝나는 `lib/data-fetching/server/vote-service.ts`의 `getVoteById(VOTE_DETAIL_SELECT)`가 이미 있는데 쓰지 않는다.
- **측정**: `/ko/vote/295` HTML은 239.7KB이고 그중 RSC payload가 201KB(85%)다. presenter가 `ssr:false`라 마크업은 스켈레톤뿐이다.
- **최소 수정**: 단일 임베드 쿼리로 바꾸고 필요한 컬럼만 고른다. 정적 히어로(제목, 기간, 대표 이미지)만 서버에서 렌더하는 방안도 검토한다. `ssr:false` 스위치는 되돌리지 않는다(§6).
- **작업량**: S–M
- **회귀 위험**: 낮음–중

### PERF-12 [P2] Firebase: gtag 156 KiB, FCM이 페이지 로드마다 권한 요청과 토큰 재등록을 한다

- **근거**
  - Firebase Analytics(`components/layouts/FirebaseAnalyticsTracker.tsx`, `app/[lang]/(main)/MainLayoutClient.tsx`)가 GA4 `gtag.js`를 불러온다. 155.8 KiB이고 그중 67 KiB가 미사용이다.
  - `components/layouts/FirebaseMessagingInitializer.tsx:55-57`이 페이지 로드마다 idle 시점에 SW를 등록하고, 사용자 제스처 없이 `Notification.requestPermission()`을 호출한다.
  - 권한이 있는 로그인 사용자는 `:73`의 `register-push-token` Edge Function을 **페이지를 로드할 때마다** 호출한다. 토큰이 바뀌지 않아도 호출한다.
- **영향**: 서드파티 JS 가운데 가장 크다. 페이지 로드마다 Edge Function 호출과 DB 쓰기가 한 번씩 생긴다(로그인·권한 허용 사용자).
- **최소 수정**
  - 토큰 해시를 로컬에 저장하고, 바뀌었을 때만 등록한다.
  - 권한 요청은 사용자가 버튼을 눌렀을 때만 한다.
  - GA가 Vercel Analytics와 중복되는지 검토한다. 유지한다면 consent와 idle 이후로 미룬다.
- **작업량**: S
- **회귀 위험**: 낮음

### PERF-13 [P2] Provider가 이중·삼중으로 마운트되고, 결과를 쓰지 않는 서버 인증 호출이 있다

- **근거**
  - `(main)` 그룹: `app/[lang]/ClientLayout.tsx:56-69`와 `components/layouts/MainLayoutClient.tsx:94-120`이 같은 Provider 세트(Navigation, GlobalLoading, LanguageSync, Auth, Notification, Dialog, AuthRedirectHandler, GlobalNotifications, GlobalLoadingOverlay, Analytics)를 **두 번** 마운트한다.
  - `(mypage)` 그룹: `app/[lang]/(mypage)/layout.tsx:24-25`가 `ClientLayout`을 한 번 더 감싸고, `(main)/MainLayoutClient`(SWR `/api/popups`, Firebase page_view)까지 붙인다.
  - `(auth)` 그룹: `ClientLayout`이 두 번 붙는다.
  - `(mypage)/layout.tsx:21`의 `getServerUser()`는 결과를 쓰지 않는다. 마이페이지·공지·FAQ 요청마다 Auth 왕복이 헛되이 한 번 더 생긴다.
- **영향**
  - 하이드레이션 비용과 이펙트가 두 배로 든다. `LanguageSyncProvider`의 기기 언어 감지는 조건이 맞으면 `getUser`와 `user_profiles` update를 두 번 실행할 수 있다.
  - 마이페이지 그룹에서는 `PopupBannerLoader`가 두 번 마운트된다. 팝업이 중복 표시될 가능성이 있다(추정).
- **최소 수정**
  - 공통 Provider는 `[lang]/layout`에서 한 번만 감싼다. 그룹 레이아웃에는 UI 셸(Header, Footer)만 둔다.
  - 쓰지 않는 `getServerUser`를 제거한다.
- **작업량**: M
- **회귀 위험**: 중. 컨텍스트 경계가 바뀌므로 인증·다이얼로그 흐름을 회귀 테스트해야 한다.

### PERF-14 [P2] 진입 리다이렉트 체인이 함수를 2회 거친다

- **근거**
  - `app/page.tsx:5`의 `redirect('/en')`와 `app/[lang]/page.tsx:9`의 `redirect('/${lang}/vote')`는 둘 다 페이지 함수 안에서 동작한다.
  - `app/vote/page.tsx:6`, `app/vote/[id]/page.tsx:7`, `app/mypage/page.tsx:6`, `app/concert2025/page.tsx:6`도 같은 방식이다.
  - `middleware.ts:64`의 `getPreferredLanguage`(Accept-Language 처리)는 쓰이지 않는 코드다.
- **측정**
  - `https://picnic.fan/`에서 콘텐츠까지 리다이렉트 3회, 총 300–408ms가 걸린다.
  - `https://www.picnic.fan/`에서는 2회, 272–275ms가 걸린다.
  - `/en` 리다이렉트 응답 본문이 15.1KB다. 레이아웃을 렌더한 결과다.
- **최소 수정**
  - `next.config.js`의 `redirects()`에 `/` → `/en/vote`, `/:lang(en|ko|…)` → `/:lang/vote`, 언어가 없는 경로 → `/en/...`을 정적으로 넣는다. Vercel 라우팅 단계에서 처리되어 함수를 호출하지 않는다.
  - 언어 감지가 필요하면 미들웨어에서 한 번에 최종 경로로 보낸다.
- **작업량**: S
- **회귀 위험**: 낮음. 307과 308 중 무엇을 쓸지는 SEO 판단이 필요하다.

### PERF-15 [P2] CLS: 리워드 0.32, 공지 0.20. styled-jsx 스타일이 SSR에 주입되지 않는다

- **근거**
  - Lighthouse에서 `/ko/rewards` CLS는 0.32이고, 리워드 카드 `a.bg-white`가 0.187과 0.074씩 이동했다. `/ko/notice` CLS는 0.202이고 상단 `div.container`가 이동했다.
  - `<style jsx>`를 쓰는 파일이 8개다(`components/layouts/Header.tsx`, `components/client/banner/BannerCarouselClient.tsx`, `BannerItem.tsx`, `CookieConsentBanner.tsx` 등). 그런데 프로덕션 HTML에 `<style>` 태그가 **0개**이고 CSS 번들에도 `.jsx-*` 선택자가 0개다. 스타일 레지스트리(`useServerInsertedHTML`)가 없어서 하이드레이션 뒤에야 주입된다.
  - 그래서 배너 슬라이드 폭(`flex-basis` 변수)과 `aspect-ratio: 700/356`이 SSR 단계에서는 적용되지 않는다.
- **영향**: 리워드 페이지 CLS가 "나쁨"(> 0.25)이고, 공지 페이지는 "개선 필요"다. 원인 요소는 추정이며 이미지 placeholder 크기가 실제 크기와 맞지 않거나 하이드레이션 뒤 헤더 요소가 삽입되는 것으로 본다.
- **최소 수정**
  - styled-jsx를 Tailwind나 전역 CSS로 옮긴다. 또는 App Router용 styled-jsx 레지스트리를 추가한다.
  - 카드 이미지 영역은 `aspect-ratio`로 높이를 확보하고 placeholder와 실제 크기를 맞춘다.
  - 헤더의 가변 요소는 높이를 미리 잡아 둔다.
- **작업량**: S–M
- **회귀 위험**: 낮음

### PERF-16 [P2] 이미지 파이프라인: CDN 이미지 이중 변환, 캐시 TTL 1시간, `priority` 남용

- **근거**
  - 배너 LCP 요청이 `/_next/image?url=https://cdn.picnic.fan/…banner_en.png?w=238&width=238&h=121…`이었다. CDN 리사이즈 파라미터를 붙인 뒤 **Vercel Image Optimization을 한 번 더** 거친다. 반면 아티스트 이미지는 `OptimizedImage`의 `shouldBypassNextImage` 분기로 CDN에서 바로 받아 경로가 일관되지 않다.
  - `next.config.js:86`의 `minimumCacheTTL: 3600`은 UUID 경로처럼 바뀌지 않는 이미지에는 너무 짧아 변환이 다시 일어난다(비용).
  - `next.config.js:74`는 AVIF를 우선 인코딩해 첫 변환 CPU가 크다.
  - 스피너·스켈레톤 등 9곳(`components/ui/LoadingSpinner.tsx:21`, `GlobalLoadingOverlay.tsx:44`, `components/server/vote/VoteListSkeleton.tsx:149` 등)이 `priority`를 쓴다. 투표 HTML에 로고 preload가 2개 들어가 LCP 자원과 경쟁한다.
- **최소 수정**
  - `cdn.picnic.fan` 이미지는 custom loader(CDN 변환 URL 생성)로 일원화하거나 `unoptimized`로 둔다.
  - 바뀌지 않는 경로는 `minimumCacheTTL`을 30일 이상으로 늘린다.
  - `priority`는 실제 LCP 후보에만 준다.
- **작업량**: S–M
- **회귀 위험**: 낮음

### PERF-17 [P2] 마이페이지 투표 내역이 행 전체를 조회한 뒤 JS에서 집계한다 (picnic-supabase 이관 필요)

- **근거**
  - `lib/data-fetching/server/user-service-vote-history.ts:49`는 `vote_pick.amount` 전체를, `:54`는 `vote_item_id` 전체를 페이지를 넘길 때마다 조회한다.
  - `:72`의 `.in('id', 전체 ID)`는 URL 길이 제한에 걸릴 수 있다.
  - `vote_pick`은 약 78.5만 행이다.
  - 같은 파일의 `select('*', { count: 'exact', head: true })`와 `user-service.ts:24`의 `count: 'exact'`(`view_transaction_all`)도 무거운 사용자에게 비용이 크다.
- **영향**: 투표를 많이 한 사용자일수록 느려진다. PostgREST `max-rows`(Supabase 기본 1000)에 걸리면 합계와 아티스트 수가 **잘린 값**이 될 수 있다. 정확성 위험이며 추정이고 확인이 필요하다.
- **최소 수정**: `SUM(amount)`과 `COUNT(DISTINCT artist_id)`를 계산하는 RPC를 추가한다(**picnic-supabase 이관 필요**). 웹은 RPC 1회로 바꾼다.
- **작업량**: M
- **회귀 위험**: 낮음

### PERF-18 [P2] DB 레벨 개선 (모두 picnic-supabase 이관 필요)

- **근거**: §3.5 advisors
- **영향**
  - `vote_item`의 **동일 인덱스 3개**와 여러 테이블의 PK·unique 중복은 투표 RPC가 `vote_total`을 갱신할 때마다 쓰기를 부풀린다. `vote_total`이 부분 인덱스 컬럼이라 HOT 갱신이 되지 않는다(추정).
  - `user_notifications`와 `qna_*`의 `auth.uid()` initplan은 행마다 다시 평가된다.
  - `user_profiles`의 permissive 정책 14건은 매 조회마다 OR 평가 비용을 더한다.
  - Auth 커넥션이 10개로 고정되어 있다(PERF-06과 연결된다).
- **최소 수정**
  - 중복 인덱스 중 하나만 남긴다.
  - RLS에서 `auth.uid()`를 `(select auth.uid())`로 감싼다.
  - 같은 역할·동작에 걸린 정책을 합친다.
  - Auth 커넥션을 비율 방식으로 할당한다.
  - FK 인덱스는 실제 조인과 삭제 경로를 보고 선별한다.
- **작업량**: M
- **회귀 위험**: 중. RLS를 바꾸면 권한 회귀를 테스트해야 한다.

### PERF-19 [P3] Sentry 샘플링과 서버 설정

- **근거**
  - 클라이언트 `tracesSampleRate`는 0.1이다(env 인라인, §3.6).
  - 서버는 `sentry.server.config.js:21`에 0.1이 고정되어 env로 바꿀 수 없다.
  - 엣지는 `sentry.edge.config.js:21`에 0.05가 고정되어 있고, 미들웨어 번들에 엣지 SDK가 들어간다.
  - 1초 폴링 엔드포인트도 샘플링 대상이다.
- **영향**
  - 트랜잭션 할당량을 쓴다. 메모리 기록에 따르면 Team 플랜이라 키별 rate limit을 걸 수 없다.
  - 서버 OTel 계측은 콜드 스타트와 요청 오버헤드를 늘린다(크기는 추정).
- **최소 수정**
  - 서버와 엣지 샘플링을 env로 바꿀 수 있게 한다.
  - `tracesSampler`로 `/api/vote/*/detail`과 정적 자원을 제외한다.
  - 클라이언트 샘플링은 트래픽에 맞춰 0.02–0.05를 검토한다.
- **작업량**: S
- **회귀 위험**: 낮음. 관측 해상도는 떨어진다.

### PERF-20 [P3] `/media` 148개를 한 번에 렌더한다

- **근거**: `/ko/media` HTML은 313.6KB이고 그중 마크업이 251KB다. `div`가 1,554개, `class` 문자열이 163KB다. 썸네일은 클라이언트에서만 렌더한다. `force-dynamic`이다.
- **영향**: br로 16.8KB라 전송량은 작지만 DOM 파싱과 하이드레이션 비용이 크다.
- **최소 수정**: 페이지네이션이나 가상 스크롤을 쓴다. 공통 클래스는 추출한다. 라우트 삭제는 대상이 아니다(§6).
- **작업량**: S–M
- **회귀 위험**: 낮음

### PERF-21 [P3] 투표 카드마다 1초 타이머가 따로 돈다

- **근거**: `components/client/vote/list/VoteCard.tsx:223`의 `CountdownTimer`가 `setInterval(1000)`을 쓰고(`CountdownTimer.tsx:95`), `VoteTimer.tsx:37`도 같다. 목록 12개 카드가 각자 매초 setState를 한다.
- **영향**: 초당 12번 리렌더가 일어나 INP에 영향을 줄 수 있다(추정).
- **최소 수정**: 공유 ticker 하나를 context나 store로 두고, 화면 밖 카드는 멈춘다.
- **작업량**: S
- **회귀 위험**: 낮음

### PERF-22 [P3] 무효·모순된 config와 구식 실험 옵션

- **근거**
  - `rewards/page.tsx:11`의 `force-dynamic`과 `:14`의 `revalidate=60`이 서로 모순된다.
  - `download/page.tsx:7`의 `revalidate`와 `[lang]/layout.tsx:11`의 `generateStaticParams`는 PERF-01 때문에 무효다.
  - `next.config.js:100`의 `optimisticClientCache`, `:102`의 `scrollRestoration`, `:92`의 `serverActions.enabled`는 현재 버전에서 효과가 확인되지 않는 구식 플래그다.
  - `productionBrowserSourceMaps: true`(`:41`)는 빌드 시간과 메모리 비용이 있다. 다만 디코딩에 필요하다(§6).
- **최소 수정**: 동작하지 않는 선언을 정리한다. PERF-01을 적용한 뒤 캐시 정책을 다시 선언한다.
- **작업량**: S
- **회귀 위험**: 낮음

### PERF-23 [P3] `rewards/[id]` 중복 조회 (추정)

- **근거**: `(main)/rewards/[id]/page.tsx:25`(`generateMetadata`)와 `:85`(page)가 둘 다 `getRewardById`를 호출한다. `utils/api/queries.ts`의 `withRetry` 래퍼에는 `React.cache`가 없다. Next의 fetch memoization이 supabase-js 요청에 적용되는지는 검증하지 못했다.
- **최소 수정**: `cache()`로 감싼다.
- **작업량**: S
- **회귀 위험**: 낮음

### PERF-24 [P2] `/ko/vote` 모바일 첫 페인트 지연과 전체 오버레이 (원인 미확정)

- **근거**
  - Lighthouse 관측값(무쓰로틀)에서 `/ko/vote`의 FCP는 1,410–1,862ms다. 같은 조건에서 다른 라우트는 151–180ms, `/ko/download`는 1,454ms였다.
  - 시뮬레이션 FCP는 `/ko/vote`가 2.8–3.0s, 다른 라우트가 0.9–1.2s다.
  - 필름스트립: 750ms 흰 화면 → 1,500ms 전체 어두운 오버레이 → 2,250ms 콘텐츠.
  - SSR 마크업에는 헤더 텍스트와 로고가 들어 있고, 페인트를 막는 CSS도 확인되지 않았다.
- **영향**: 서비스의 대표 진입 페이지가 첫 화면을 1.4초 이상 흰 화면으로 보여 준다. 저사양 기기에서는 더 길어질 것으로 본다(추정).
- **최소 수정**: Chrome Performance 트레이스로 첫 페인트 이전의 스크립트 평가와 오버레이를 표시하는 주체를 찾는다. 후보는 `GlobalLoadingOverlay`, 다이얼로그 backdrop, 스트리밍 경계 교체 순서다. 원인을 고치기 전에 재측정한다.
- **작업량**: S(조사), 수정은 원인에 따라 다르다.
- **회귀 위험**: –

---

## 5. 우선 개선 Top 10 (효과/비용 순)

| 순위 | ID | 조치 | 기대 효과(근거 또는 추정) | 작업량 | 위험 |
|---|---|---|---|---|---|
| 1 | PERF-03 | 폴링을 가시성에 따라 멈추고 간격을 5초 이상으로 늘린다. 종료된 투표는 멈추고, 응답은 `id, vote_total`로 줄이며, `s-maxage=2` 마이크로캐시를 건다. | 간격 조정만으로 호출이 80% 이상 줄고 숨긴 탭은 0이 된다. 캐시를 걸면 투표 1건당 원본 호출이 시청자 수와 상관없이 0.5 req/s 이하가 된다(추정). 12일간 16.3만 회와 DB 3,364초가 기준이다. | S–M | 낮음–중 |
| 2 | PERF-05a | Sentry `replayIntegration`을 제거한다. | 모든 페이지 JS가 −134KB raw, 약 −38KB br 줄어든다. 현재 수집이 0이라 기능 손실이 없다. | S | 낮음 |
| 3 | PERF-06 | 미들웨어 matcher에서 정적 확장자를 빼고, 쿠키가 있을 때만 `getClaims()`를 호출한다. | 정적 자산 요청마다 −20–27ms. 로그인 사용자의 서버 측 `getUser()` 2회(미들웨어·페이지)가 로컬 JWT 검증으로 바뀐다. 클라이언트 측 2회는 별도로 정리해야 한다. | S–M | 중 |
| 4 | PERF-07 | 투표 목록에서 admin일 때만 사용자를 확인한다. | 로그인 사용자의 직렬 2 RTT가 없어진다. `/vote`가 `cookies()`에서 벗어나 ISR로 갈 수 있다. | S | 낮음 |
| 5 | PERF-09 | `/api/popups`와 `/api/banners`에 `s-maxage=60`을 건다. | 페이지뷰마다 함수 1회와 DB 1회가 없어진다. | S | 낮음 |
| 6 | PERF-14 | `/`, `/:lang`, 언어 없는 경로의 리다이렉트를 `next.config.js`의 `redirects()`로 옮긴다. | 신규 방문자의 진입 함수 호출 2회가 없어진다. 체인 272–408ms 중 약 150–250ms가 줄어든다(추정). | S | 낮음 |
| 7 | PERF-08 | sitemap에 경량 쿼리, `Promise.all`, `revalidate=3600`을 적용한다. | 3.7초가 수백 ms 수준으로 줄고(추정) 크롤러 요청을 CDN이 받는다. | S | 낮음 |
| 8 | PERF-04 | `OptimizedImage`의 priority 경로를 서버에서 렌더하고 opacity 페이드를 없앤다. | 모바일 LCP 8.6–9.9s의 직접 원인을 없앤다. 수치는 다시 측정해야 한다. | M | 중 |
| 9 | PERF-05b, 05c, 05d, 05e | 배럴을 제거하고, 날짜 처리를 Intl로 바꾸고, framer-motion은 `LazyMotion`으로, `splitChunks`는 기본값으로 되돌린다. | 투표 페이지 초기 JS가 약 50–100KB(br) 줄어든다(추정, Lighthouse 미사용 293 KiB 기준). | S–M | 중 |
| 10 | PERF-01, 02 | 레이아웃에서 `headers()`를 없애 `params` 기반으로 바꾸고, 공개 페이지를 ISR로 전환한다. | 공개 HTML이 CDN HIT가 되어 함수 호출과 해외 TTFB가 크게 준다. 구조 과제다. | L | 중–높음 |

**검증 방법**: 메모리 기록상 Preview 배포가 없다. 로컬에서 `next build && next start`를 실행하고 Lighthouse를 돌려 검증한다. 머지 후에는 §7의 명령으로 프로덕션을 다시 측정해 이 보고서의 수치와 비교한다.

---

## 6. 건드리면 안 되는 것

1. **`buildVoteQuery`의 후보 정렬(`vote_total DESC NULLS LAST`)과 `limit(…, { referencedTable: 'vote_item' })`**(`lib/data-fetching/server/vote-service-query.ts`). 부분 인덱스 `vote_item_vote_id_total_active_idx`와 한 쌍이다. #79 이후 anon 29,275회, 평균 25ms로 유지되고 있다. 정렬 방향이나 NULLS 옵션을 바꾸면 안 된다.
2. **`VoteDetailClientOnly`의 `ssr:false`.** PICNIC-WEB-5C(hydration mismatch) 대응책이다. LCP 개선은 정적 히어로를 서버에서 렌더하는 식으로 하고, 이 스위치는 되돌리지 않는다.
3. **`VoteLiteClientLayout`을 `x-pathname` 주입만으로 살리는 수정.** 검증되지 않은 `Suspense`와 `ssr:false` 구조가 투표 경로 전체에 즉시 켜지고, 광고 타이밍도 동시에 바뀐다.
4. **Sentry 앱 키 체인**: `next.config.js`의 `NEXT_PUBLIC_SENTRY_APPLICATION_KEY`, `unstable_sentryWebpackPluginOptions.applicationKey`, `thirdPartyErrorFilterIntegration`과 `hideSourceMaps`, `widenClientFileUpload`, `productionBrowserSourceMaps`. PICNIC-WEB-6R/6S/5S/5V의 필터와 디코딩이 여기에 의존한다. `splitChunks`나 Replay를 정리할 때도 그대로 둔다.
5. **미들웨어의 탈퇴 계정 차단과 인앱 브라우저 리다이렉트.** 보안과 결제 흐름의 방어 계층이다. 최적화로 위치를 옮기더라도 동작은 그대로 유지해야 한다.
6. **`/api/vote/[id]/detail`의 ETag/304 계약.** 클라이언트 폴링이 304 경로를 전제로 동작한다.
7. **`public/locales/*.json`의 위치.** 서버(`lib/i18n/server.ts`의 fs 읽기)와 클라이언트가 모두 쓴다. 번역 이중 로드를 정리할 때도 파일 위치는 유지한다.
8. **`ConsentAwareAdsense`의 동의 게이팅.** 광고 지연을 최적화하더라도 동의 로직을 우회하면 안 된다.
9. **`/[lang]/concert2025`의 `force-static`.** 현재 CDN에 캐시되는 유일한 페이지다.
10. **`images.remotePatterns` 목록.** 항목을 빼면 기존 이미지(api.picnic.fan, S3, YouTube 썸네일)가 깨진다.
11. **스키마, 인덱스, RLS, RPC 변경.** 이 레포에서 하지 않는다. 반드시 picnic-supabase를 거친다.
12. **QNA와 `/media` 라우트.** 삭제 대상이 아니다. 성능 개선은 페이지네이션 같은 방식으로만 한다.

---

## 7. 부록: 재현 명령

```bash
# 라우트 캐시·TTFB (5회 반복 권장)
curl -s -o /dev/null -D - -H 'Accept-Encoding: br' \
  -w '\ncode=%{http_code} ttfb=%{time_starttransfer} size=%{size_download}\n' \
  https://www.picnic.fan/ko/vote | grep -iE 'cache-control|x-vercel-cache|code='

# 리다이렉트 체인
curl -s -o /dev/null -L -w 'redirects=%{num_redirects} total=%{time_total}s final=%{url_effective}\n' https://picnic.fan/

# 미들웨어 오버헤드 비교 (TTFB - connect)
for p in /manifest.json /images/logo.webp; do
  curl -s -o /dev/null -w "$p %{time_starttransfer} %{time_connect}\n" "https://www.picnic.fan$p"; done

# 폴링 응답 크기 / 304 경로
curl -s -o /dev/null -H 'Accept-Encoding: br' -w '%{size_download}\n' https://www.picnic.fan/api/vote/295/detail

# 초기 JS 목록과 크기
curl -s https://www.picnic.fan/ko/vote | grep -o '<script[^>]*src="[^"]*"' | sed -E 's/.*src="([^"]*)".*/\1/' | sort -u

# Lighthouse (레포 밖 디렉터리에서 실행)
npx -y lighthouse@13.5.0 https://www.picnic.fan/ko/vote --only-categories=performance \
  --output=json --output-path=./ko-vote.json --chrome-flags="--headless=new"
```

```sql
-- Supabase (읽기 전용): 폴링 쿼리 누적
select r.rolname, s.calls, round(s.mean_exec_time::numeric,2) mean_ms,
       round(s.total_exec_time::numeric/1000,1) total_s
from pg_stat_statements s join pg_roles r on r.oid = s.userid
where s.query ilike '%artistGroup%' and r.rolname in ('anon','authenticated');
```
