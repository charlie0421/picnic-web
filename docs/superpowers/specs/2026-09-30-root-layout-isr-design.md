# 루트 레이아웃 `headers()` 제거와 ISR 전환 — 설계

- 날짜: 2026-09-30
- 근거: 감사 계획 `docs/audit-2026-09-26/plan.md` U-11(PERF-01, STR-012, PERF-22), 결정 #8(rewards/faq/notice ISR 승인), B-R3
- 상태: 구현 완료 (브랜치 `refactor/root-layout-isr`), 교차 리뷰·머지 대기

## 1. 목표와 성공 기준

### 1.1 목표

1. 루트 레이아웃 `app/layout.tsx` 의 `headers()` 호출을 없애, 요청 시점 API 를 쓰지 않는 페이지가 정적/ISR 로 렌더될 수 있게 한다.
2. 결정 #8 에 따라 rewards, faq, notice 를 ISR 로 전환한다.
3. 위 변경으로 **의도치 않게 영구 정적으로 굳는 페이지가 하나도 없게** 한다.

### 1.2 목표가 아닌 것

- 서버 TTFB 개선. 이미 78~144ms 라 목적은 CDN HIT 와 함수 호출·DB 조회 비용 절감이다.
- `/vote/[id]` 의 ISR 전환. 종료 시각·노출 시각 판정·404 캐시 문제가 있어 별도 설계로 미룬다(결정: 현상 유지, 명시적 `force-dynamic`).
- `/vote` 목록 ISR. `searchParams` 를 읽는 구조라 동적으로 남는다.
- middleware 의 `x-locale` 주입 제거. 소비자가 사라지지만 테스트가 있고 무해하므로 후속 정리로 남긴다.

### 1.3 성공 기준

| 기준 | 확인 방법 |
|---|---|
| `/[lang]/rewards`, `/[lang]/faq`, `/[lang]/notice`, `/[lang]/download` 가 ISR 로 프리렌더 | `npx next build` 후 `.next/prerender-manifest.json` 의 `routes`(revalidate 값 포함) |
| 동적으로 남아야 하는 페이지(§4.3 목록)가 매니페스트에 없다 | 같은 파일. 빌드 표의 `●` 는 레이아웃 `generateStaticParams` 때문에 동적 페이지에도 붙으므로 기준으로 쓰지 않는다 |
| 렌더링 모드 계약 테스트 통과 | `npx vitest run __tests__/app/rendering-mode-contract.test.ts` |
| `<html lang>` 이 12개 언어에서 #92 와 동일하게 나온다 (`zh-cn → zh-CN` 등) | 레이아웃 단위 테스트 + `next start` 후 curl |
| `next start` 에서 ISR 페이지 응답에 `Cache-Control: s-maxage=<revalidate>, stale-while-revalidate` | curl -I |
| 머지 후 Production 에서 두 번째 요청부터 `x-vercel-cache: HIT` | curl (Preview 배포가 없으므로 Production 에서만 확인 가능) |
| 로그인, 로그아웃, 인증 콜백, 광고 플레이어, 404 페이지가 깨지지 않는다 | 로컬 스모크 |

## 2. 현재 구조와 문제

- `app/layout.tsx` 가 middleware 가 주입한 `x-locale` 을 `headers()` 로 읽어 `<html lang>` 을 정한다. 이 한 줄이 모든 라우트를 동적 렌더링으로 만든다. `headers()` 의 소비자는 이것뿐이다.
- `app/[lang]/layout.tsx` 는 이미 `params.lang` 으로 언어를 알고 `generateStaticParams`(en/ko/my) 와 `generateMetadata` 를 가진다. `#92` 이후 `headers()` 를 쓰지 않는다.
- rewards 페이지는 `force-dynamic` 과 `revalidate = 60` 을 동시에 내보내 후자가 죽어 있다. faq/notice 는 `force-dynamic` 이고 쿠키 기반 Supabase 클라이언트(`createSupabaseServerClient`, 내부에서 `cookies()`·`headers()`)로 조회한다.
- 루트 `headers()` 를 없애면 다음 두 가지 숨은 문제가 드러난다.
  1. **레이아웃 안의 `useSearchParams()`**: `hooks/useLocaleRouter.ts:31` 이 호출하고, Header·Footer·SubMenu·LanguageSelector·MobilePortalMenu·Pagination 이 이 훅을 쓴다. 정적 프리렌더 시 Suspense 경계 밖의 `useSearchParams` 는 빌드 오류("should be wrapped in a suspense boundary")다. `/login` 은 페이지 자체가 `useSearchParams` 를 직접 쓴다(`app/[lang]/(auth)/login/page.tsx:47`).
  2. **우연히 동적인 페이지**: `/vote/[id]` 는 공개 클라이언트만 쓰고 `revalidate` 가 없어 제거 즉시 첫 렌더가 영구 캐시된다. `/star-candy` 는 try/catch 로 감싼 `cookies()` 덕에, `/notice/[id]`·`/privacy`·`/terms` 는 쿠키 클라이언트 덕에 동적일 뿐이다. 두 sitemap 은 `getNotices` 를 공유한다.
- 루트 `app/page.tsx` 는 `next.config.js` 의 `/ → /en/vote` 리다이렉트가 먼저 잡아 죽은 코드다. `/vote`, `/mypage`, `/concert2025` 스텁은 살아 있다.
- 사실 확인: `faqs`, `notices`, `reward` 테이블은 RLS 가 꺼져 있고 `banner` 는 anon 읽기 정책이 있어 공개 anon 키로 읽힌다. Vercel 빌드 환경에 `SUPABASE_URL`/`SUPABASE_ANON_KEY` 가 있어 빌드 시 프리렌더가 가능하다.

## 3. 접근법 선택

| 안 | 요약 | 판단 |
|---|---|---|
| **A. pass-through 루트 + `[lang]` 이 `<html>` 소유** | `app/layout.tsx` 는 children 만 반환. `[lang]/layout.tsx` 가 `<html lang>`·`<body>` 를 렌더. `[lang]` 밖 페이지는 `app/(bare)/` 그룹의 최소 레이아웃 아래로 이동 | **채택**. next-intl 이 문서화한 공식 패턴. `app/[lang]` 을 옮기지 않아 `@/app/[lang]/...` import 가 안전 |
| B. 루트 유지, `<html lang="ko">` 고정 + 클라이언트 동기화 | 변경 최소 | 기각. en/my 초기 HTML 이 `ko` 로 나가 #92 이전으로 퇴행 |
| C. `app/(site)/[lang]` 로 완전 이동한 다중 루트 | 정석 | 기각. 결과가 A 와 같은데 import 대량 변경과 충돌 위험만 큼 |

A 의 알려진 단점: `[lang]` 안팎을 오갈 때 전체 새로고침이 일어난다. `[lang]` 밖은 인증 콜백과 광고 플레이어뿐이라 사용자 경험에 영향이 없다.

## 4. 설계

### 4.1 레이아웃 구조

```
app/
  layout.tsx                 # pass-through: children 만 반환. headers() 없음. metadata 없음
  not-found.tsx              # 자체 <html lang><body> 렌더 (루트가 pass-through 이므로 필수). 인라인 스타일만 쓰므로 CSS import 없음
  global-error.tsx           # 변경 없음 (이미 자체 <html> 렌더)
  sitemap.ts                 # revalidate 명시 (§4.3)
  open-in-browser/route.ts   # 변경 없음 (route handler 는 레이아웃 불필요)
  [lang]/
    layout.tsx               # <html lang={getLanguageTag(lang) ?? 'ko'}><head preconnect/><body className={inter}>
                             #   AdSense · <div className="bg-white"><ClientLayout>…</ClientLayout></div> · CookieConsentBanner
                             # generateMetadata 에 'google-adsense-account' 추가, viewport 유지, globals.css 유지
    ...                      # 그 외 변경 없음 (페이지별 렌더링 모드는 §4.3)
  (bare)/
    layout.tsx               # 서버 컴포넌트. <html lang="ko"><body className={inter}>{children}</body></html>
                             # globals.css import, metadata: title 'Picnic' + google-adsense-account, viewport
    auth/                    # 기존 app/auth 를 그대로 이동 (layout.tsx·callback/**·loading/) — URL 불변
    ads/shortform/player/    # 기존 app/ads 를 그대로 이동 — URL 불변
```

삭제:
- `app/page.tsx`, `app/vote/page.tsx`, `app/vote/[id]/page.tsx`, `app/mypage/page.tsx`, `app/concert2025/page.tsx` → `next.config.js` `redirects()` 로 대체(§4.2).
- `app/404.tsx` — App Router 에서 라우트가 아닌 죽은 파일.

루트 레이아웃이 pass-through 가 되면 Next 는 `<html>`/`<body>` 를 만들어 주지 않으므로, 모든 렌더 경로가 `[lang]/layout.tsx`, `(bare)/layout.tsx`, `not-found.tsx`, `global-error.tsx` 중 하나로 `<html>` 을 공급한다. 이 네 파일이 `<html>` 을 소유하는 전체 목록이다.

`<html lang>` 값: `getLanguageTag(params.lang) ?? 'ko'` (기존 루트 레이아웃과 같은 매핑, `zh-cn → zh-CN`). `(bare)` 와 `not-found` 의 서버 HTML 은 `ko` 고정이다. `not-found.tsx` 는 이미 클라이언트에서 경로 언어를 감지하므로 감지 후 `document.documentElement.lang` 을 갱신한다. `(bare)` 레이아웃에는 AdSense·쿠키 배너를 두지 않는다(인증 콜백·광고 플레이어는 콘텐츠 페이지가 아니다).

### 4.2 리다이렉트 스텁 대체

`next.config.js` `redirects()` 에 추가 (기존 `/ → /en/vote`, `/:lang → /:lang/vote` 와 같은 방식, `permanent: false`):

| source | destination |
|---|---|
| `/vote` | `/${DEFAULT_LANGUAGE}/vote` |
| `/vote/:id` | `/${DEFAULT_LANGUAGE}/vote/:id` |
| `/mypage` | `/${DEFAULT_LANGUAGE}/mypage` |
| `/concert2025` | `/${DEFAULT_LANGUAGE}/concert2025` |

`next.config.js` 는 CJS 라 TS 설정을 import 할 수 없으므로 기존 `/ → /en/vote` 처럼 `/en/...` 을 직접 쓰고, 테스트가 `DEFAULT_LANGUAGE`(`en`)와의 일치를 검증한다. 리다이렉트는 middleware 보다 먼저 적용되므로 함수 호출 없이 엣지에서 끝난다.

### 4.3 페이지별 렌더링 모드 (명시 원칙)

원칙: **우연에 기대는 페이지를 0개로 만든다.** 모드가 전이적 쿠키 사용에만 달린 페이지는 세그먼트 설정을 명시한다.

| 라우트 | 변경 | 결과 |
|---|---|---|
| `/[lang]/rewards` | `force-dynamic` 제거, `revalidate = 60` 유지, `createISRMetadata` 제거(메타데이터에 `revalidate` 를 넣는 것은 효과가 없음) | ISR 60s |
| `/[lang]/rewards/[id]` | `force-dynamic` → `revalidate = 300` + `generateStaticParams() → []` | ISR 300s, 온디맨드 생성 |
| `/[lang]/faq` | `force-dynamic` → `revalidate = 300`; `getFaqs`/`getFaqCategories` 를 공개 클라이언트로 전환 | ISR 300s |
| `/[lang]/notice` | `force-dynamic` → `revalidate = 300`; `getNotices` 를 공개 클라이언트로 전환 | ISR 300s |
| `/[lang]/notice/[id]` | `revalidate = 300` + `generateStaticParams() → []` 추가; `getNoticeById` 를 공개 클라이언트로 전환 | ISR 300s, 온디맨드 생성 |
| `/[lang]/download` | 변경 없음 (`revalidate = 3600` 이 이제 효력) | ISR 3600s |
| `/[lang]/concert2025` | 변경 없음 | 정적(force-static, 86400) |
| `/[lang]` (redirect) | 변경 없음 | 정적 리다이렉트 |
| `/[lang]/vote/[id]` | **`export const dynamic = 'force-dynamic'` 명시** | 동적 (현상 유지) |
| `/[lang]/star-candy` | `force-dynamic` 명시 | 동적 (현상 유지, try/catch 의존 제거) |
| `/[lang]/privacy`, `/[lang]/terms` | `force-dynamic` 명시 | 동적 (현상 유지) |
| `/[lang]/vote` | `revalidate = 60` 제거(죽은 설정) | 동적 (searchParams) |
| `/[lang]/media`, `/[lang]/mypage/**`, `/[lang]/open-in-browser`, auth | 변경 없음 | 동적 |
| `app/sitemap.ts` | `revalidate = 3600` 명시 | ISR 3600s (notice 공개 전환으로 정적화되는 것을 막고, 투표 목록 갱신 보장) |
| `app/[lang]/sitemap.ts` | `revalidate = 3600` 명시 | 동적(빌드 확인: 동적 세그먼트라 요청마다 렌더). export 는 향후 프리빌드 시 굳지 않게 하는 방어선 |

공개 클라이언트 전환 규칙: `createPublicSupabaseServerClient()` 를 쓴다(`SUPABASE_URL`/`SUPABASE_ANON_KEY`, 쿠키 없음). 조회 대상 테이블은 RLS 가 꺼져 있거나 anon 읽기 정책이 있음을 확인했다(§2). 이 세 서비스는 개인화 데이터를 다루지 않는다.

`notFound()` 와 온디맨드 ISR: `rewards/[id]`, `notice/[id]` 에서 없는 id 는 404 가 캐시되지만 `revalidate` 주기(300s) 후 재생성되므로 일시적 DB 오류가 영구 404 로 남지 않는다.

### 4.4 `useSearchParams` 제거

- `hooks/useLocaleRouter.ts`: `useSearchParams()` 훅 호출을 없애고, 로케일 전환 함수 안에서 `window.location.search` 를 그 시점에 읽어 쿼리를 보존한다(유일한 사용처 `:144`). 훅의 반환 타입과 다른 동작은 바뀌지 않는다.
- `/[lang]/login`: `useSearchParams` 를 쓰는 `LoginContentInner` 는 이미 Suspense 안에 있다. Suspense 밖의 `LanguageSelector` 가 `useLocaleRouter` 를 쓰는 것이 유일한 문제였고 위 훅 수정으로 해결된다. 파일 변경 없음.
- `/[lang]/mypage/qna/new`: 페이지 컴포넌트가 `useSearchParams` 를 직접 쓰므로 본문을 `NewQnaForm` 으로 내리고 default export 가 `<Suspense fallback={null}>` 으로 감싼다.
- 나머지 `useSearchParams` 직접 사용은 이미 동적인 페이지 안에 있거나 Suspense 안에 있어 손대지 않는다. 최종 확인은 `next build` 가 한다.

### 4.5 middleware

변경하지 않는다. `x-locale` 주석만 "레이아웃이 더 이상 읽지 않음"으로 고친다. Vercel 에서 middleware 는 CDN 캐시 조회 전에 실행되므로 ISR 페이지도 middleware 비용은 남지만 함수 렌더와 DB 조회는 건너뛴다. 이는 예상된 동작이다.

### 4.6 데이터 흐름 (변경 후)

```
요청 /ko/rewards
  → next.config redirects (해당 없음)
  → middleware (x-locale 주입, 로그인 시 getClaims)
  → Vercel 캐시: HIT 이면 캐시 HTML 반환 (60s 내)
  → MISS/stale: [lang]/layout (params.lang) → rewards/page → getRewards(공개 클라이언트) → HTML 생성·캐시
```

빌드 시: `generateStaticParams`(en/ko/my) 로 rewards/faq/notice/download 가 3개 언어로 프리렌더된다. 이때 Supabase 조회가 빌드 환경에서 일어난다. 실패하면 각 서비스의 기존 폴백(빈 목록, `FALLBACK_NOTICES`)이 캐시되고 `revalidate` 주기 후 복구된다. 나머지 언어는 첫 요청 때 온디맨드 생성된다.

### 4.7 오류 처리

- 빌드 시 Supabase 접근 실패: 위 폴백 + ISR 재생성. 빌드는 실패하지 않는다(서비스가 예외를 삼킨다).
- 렌더 오류: `[lang]/error.tsx`, `global-error.tsx` 는 변경 없음. `global-error` 는 자체 `<html>` 을 렌더하므로 pass-through 루트와 호환된다.
- 알 수 없는 로케일 세그먼트(`/xx/foo`): `app/not-found.tsx` 가 자체 `<html>` 로 렌더한다. 이 경로는 현재도 루트 not-found 가 처리하며 뼈대만 바뀐다.

## 5. 테스트

| 테스트 | 내용 |
|---|---|
| `__tests__/app/lang-layout-html.test.tsx` (기존 `root-layout-lang.test.tsx` 대체) | `[lang]/layout.tsx` 가 `params.lang` 으로 `<html lang>` 을 정한다(12개 언어 매핑), AdSense 옵션(`delayUntilIdle=false`, `idleTimeout=1200`)이 유지된다, 프로덕션에서만 광고·배너를 렌더한다 |
| `__tests__/app/root-layout-passthrough.test.tsx` | 루트 레이아웃이 `next/headers` 를 import 하지 않고 children 을 그대로 반환한다 |
| `__tests__/app/rendering-mode-contract.test.ts` | §4.3 표를 소스 정적 분석으로 검증: 각 페이지의 `dynamic`/`revalidate` export 가 표와 일치, `app/[lang]` 아래 `page.tsx` 중 표에 없는 파일이 없다(새 페이지가 추가되면 표에 명시하도록 강제) |
| `__tests__/hooks/useLocaleRouter.test.tsx` | `useSearchParams` 를 쓰지 않는다, 로케일 전환 시 현재 쿼리를 보존한다 |
| `__tests__/lib/public-client-services.test.ts` | `getFaqs`, `getFaqCategories`, `getNotices`, `getNoticeById` 가 `next/headers` 를 호출하지 않는다(모듈 mock 으로 호출 시 실패) |
| `__tests__/next-config-redirects.test.ts` (기존 확장) | `/vote`, `/mypage`, `/concert2025` 리다이렉트가 `DEFAULT_LANGUAGE` 로 간다 |
| 기존 `__tests__/middleware/*` | 변경 없이 통과해야 한다 |

수동 검증(구현 계획에 그대로 옮긴다):
1. `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npx next build` (절대 `npm run build` 아님).
2. 빌드 라우트 표를 캡처해 §1.3 기준과 대조한다.
3. `npx next start` 후 curl: `/ko/rewards`, `/en/faq`, `/my/notice` 의 `Cache-Control`; `/zh-cn/vote` 의 `<html lang="zh-CN">`; `/vote` → 302 `/ko/vote`(`DEFAULT_LANGUAGE`); `/xx/nope` 가 404 와 `<html>` 을 포함; `/auth/loading`, `/ads/shortform/player` 가 200.
4. 브라우저 스모크(로컬): 로그인 페이지 렌더·`returnTo` 동작, 언어 전환 시 쿼리 보존, 마이페이지 진입.
5. 머지 후 Production: `x-vercel-cache` 가 두 번째 요청에서 HIT, Sentry 신규 이슈 없음, 로그인/로그아웃.

## 6. 리스크와 완화

| 리스크 | 완화 |
|---|---|
| 정적 프리렌더에서 Suspense 밖 `useSearchParams` 로 빌드 실패 | §4.4 + `next build` 를 PR 게이트로. 남은 사용처는 빌드 오류 메시지가 파일을 지목한다 |
| 어떤 페이지가 몰래 영구 정적화 | §4.3 명시 원칙 + 계약 테스트가 목록에 없는 페이지를 거부 |
| 빌드 시 Supabase 조회 실패로 폴백이 캐시 | ISR 주기 후 자동 복구. 배포 직후 스모크로 확인 |
| `(bare)` 이동으로 auth 콜백 경로 깨짐 | URL 은 그룹 폴더의 영향을 받지 않는다. 이동 후 라우트 표와 curl 로 확인 |
| `[lang]` 밖 페이지에 globals.css 미적용 | `(bare)/layout.tsx` 와 `not-found.tsx` 가 직접 import |
| Preview 배포가 없어 머지 전 실환경 확인 불가 | 로컬 `next start` 검증을 전부 수행하고, 머지 직후 Production 스모크 |
| 회귀 등급: 높음(레이아웃 재구성) | 고위험 아님(인증·결제·권한·마이그레이션 아님)이나 Frontier 반대 공급자 리뷰를 받는다 |

## 7. 범위 밖·후속

- 지원하지 않는 언어 세그먼트(`/xx/rewards`, 접두어 없는 `/login`·`/download`)는 지금처럼 `[lang]` 이 받아 200 으로 렌더한다(`<html lang>` 은 `ko` 폴백). 동작을 바꾸지 않되, ISR 전환 뒤에는 임의 문자열마다 캐시 항목이 생길 수 있으므로 "미지원 언어 404 + 접두어 없는 경로 리다이렉트" 를 후속 과제로 둔다.

- `/vote/[id]` ISR (종료·노출 시각, 404 캐시, 폴링과의 관계 별도 설계).
- middleware `x-locale` 주입 제거와 관련 테스트 정리.
- `/privacy`, `/terms` 의 ISR 전환(정책 문서라 후보지만 결정 #8 범위 밖).
- `createISRMetadata`, `revalidateTagHelper` 등 `rendering-utils.ts` 의 미사용 헬퍼 정리.
