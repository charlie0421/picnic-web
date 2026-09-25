# picnic-web 코드 구조·아키텍처 감사

- 감사일: 2026-09-26
- 범위: Next.js App Router 애플리케이션, Supabase 접근 계층, 미들웨어, 오류·로깅, 타입, 테스트, 스크립트와 의존성
- 방식: 정적 검색과 읽기 전용 명령만 사용했다. 요청에 따라 next build는 실행하지 않았다.
- 제약: 데이터베이스 스키마의 소유 저장소는 picnic-supabase다. 아래의 DDL·RLS 관련 수정 제안은 모두 **picnic-supabase 이관 필요**로 취급한다.

## 요약

가장 급한 문제는 설치된 Next.js 15.5.23이 AVIF Image Optimization 원격 코드 실행 취약점의 영향 범위에 있고, 이 애플리케이션이 AVIF 최적화를 실제로 켜 둔 점이다. 구조상으로는 최상위 언어 레이아웃과 라우트 그룹 레이아웃이 같은 전역 Provider를 중복 마운트하고, 저장소 어디에서도 생성하지 않는 x-pathname 헤더에 핵심 레이아웃·언어·광고 분기가 의존한다. Supabase 클라이언트, 투표 조회, QNA 메시지 쓰기, 오류 처리도 여러 구현으로 갈라져 있어 동일 기능의 인증·필터·반환 계약이 이미 달라졌다.

컴파일과 현재 테스트는 통과했지만 안전망은 실제 위험 영역과 어긋난다. TypeScript는 0건 오류이고 Vitest 2,074건도 통과했으나, 33개 API route 중 직접 route 테스트는 투표·지갑 계열 6개뿐이며 인증·결제·QNA와 middleware 테스트는 없다. Knip은 47개 미사용 파일과 93개 미사용 export를 보고했지만 Next 특수 파일·서비스 워커·컴파일 전용 타입 테스트도 오탐으로 포함하므로 일괄 삭제하면 안 된다.

## 실행 근거

| 명령 | 결과 |
|---|---|
| npx tsc --noEmit --pretty false --incremental false | 성공, 오류 0건 |
| npm run lint | 성공, warning/error 0건. 다만 next lint 폐기 예정 경고와 상위 /Users/charlie.hyun/package-lock.json 때문에 workspace root를 잘못 추론한다는 경고가 출력됨 |
| npx vitest run --reporter=verbose | 122개 파일, 2,074개 테스트 통과. SafeAvatar의 act 경고와 LoadingSpinner mock의 boolean DOM attribute 경고가 반복됨 |
| npx knip --reporter compact | 미사용 파일 47, 미사용 dependency 1, 미사용 export 93, 미사용 exported type 42, duplicate export 22. 프레임워크 엔트리 오탐을 포함하므로 후보 목록으로만 사용 |
| npx depcheck --json | Sentry의 Next config webpack 해석 중 실패(exit 255). 부분 결과에서 jsonwebtoken 미사용을 보고했으나 이 결과만으로 삭제 판정하지 않음 |
| npm audit --json | critical 2, high 6, moderate 24, 합계 32 |
| npm outdated | 41개 패키지가 latest보다 오래됐고 그중 23개는 latest로 이동할 때 major 변경 |

정적 계수의 기준은 생성된 types/supabase.ts와 types/interfaces.ts, 테스트 파일, node_modules, .next를 제외한 TS/TSX다.

| 영역 | TS/TSX 파일 | use client | 비율 |
|---|---:|---:|---:|
| app | 143 | 34 | 24% |
| components | 204 | 119 | 58% |
| lib | 73 | 15 | 21% |
| utils | 55 | 0 | 0% |
| hooks | 28 | 20 | 71% |
| stores | 5 | 0 | 0% |
| contexts | 5 | 4 | 80% |
| config + types | 5 | 0 | 0% |
| **합계** | **518** | **192** | **37%** |

## 발견사항

### STR-001 — 설치된 Next.js가 AVIF 원격 코드 실행 취약점 영향 범위에 있음

- **심각도:** P0 치명
- **근거:** package-lock.json:12571-12574는 실제 설치 버전을 15.5.23으로 고정한다. next.config.js:70-86은 Image Optimization을 운영에서 활성화하고 AVIF를 첫 번째 출력 포맷으로 허용한다. package.json:71의 범위 표기는 15.5.23 설치 자체를 막지 못한다.
- **명령 근거:** npm audit은 GHSA-2xp9-vwfh-vxw4(AVIF Image Optimization unauthenticated RCE)의 영향 범위를 15.5.24 미만으로, 수정 버전을 15.5.24 이상으로 보고했다. Windows-host 전용 RCE(GHSA-p293-qw3h-jr36)도 함께 보고됐지만 Vercel/Linux 배포에는 그 항목의 전제가 그대로 적용되지 않을 수 있다.
- **영향:** 공격 가능성은 공격자가 허용된 원격 이미지 원본에 조작된 AVIF를 놓을 수 있는지에 좌우된다. 그러나 remotePatterns에 업로드성 호스트가 포함되고 AVIF 경로가 실제 활성화돼 있어, 단순한 개발 의존성 경고가 아니라 공개 이미지 최적화 엔드포인트의 프로세스 장악 가능성이다.
- **최소 수정 방향:** lockfile의 Next 15 계열을 최소 15.5.24 이상(현재 wanted 15.5.26)으로 올리고 이미지 최적화 회귀 테스트를 수행한다. Next 16 전환은 별도 작업으로 분리한다.
- **예상 작업량:** S
- **회귀 위험:** 낮음~중간. 패치 업데이트지만 이미지 캐시·Sentry 빌드·Vercel Preview 확인이 필요하다.

### STR-002 — 동일 전역 Provider 스택이 라우트마다 두 번 중첩됨

- **심각도:** P1 높음
- **근거:** app/[lang]/layout.tsx:93-96이 모든 언어 경로를 ClientLayout으로 감싼다. app/[lang]/ClientLayout.tsx:56-76은 Navigation, Loading, Language, Auth, Notification, Dialog Provider와 전역 overlay·notification·Analytics를 마운트한다. 그 안의 (main) 레이아웃은 app/[lang]/(main)/layout.tsx:9-15에서 다시 MainLayoutClient를 마운트하고, components/layouts/MainLayoutClient.tsx:93-127이 사실상 같은 Provider 스택과 overlay·notification·Analytics를 다시 만든다. (mypage)도 app/[lang]/(mypage)/layout.tsx:23-26에서 ClientLayout을 한 번 더 마운트하며, app/[lang]/(mypage)/layout.tsx:21은 반환값을 쓰지 않는 getServerUser() 호출도 수행한다.
- **영향:** main/mypage 경로의 React 트리에는 AuthProvider와 전역 상태 Provider가 최소 두 인스턴스 존재한다. 인증 listener, 로딩 UI, notification UI와 Analytics 코드가 중복 마운트될 수 있고, 소비자는 가장 가까운 내부 context만 보므로 외부 인스턴스는 비용만 내거나 서로 다른 상태를 갖는다. mypage는 여기에 불필요한 서버 인증 조회도 추가된다. React DevTools와 Supabase 요청 로그로 main 또는 mypage 한 페이지에서 재현 가능하다.
- **최소 수정 방향:** 전역 Provider의 소유자를 app/[lang]/layout.tsx 한 곳으로 정하고, 라우트 그룹 레이아웃에는 Header/Footer 등 구조 UI만 남긴다. 반대로 그룹별 Provider가 필요하면 최상위 ClientLayout을 얇은 언어 shell로 줄인다.
- **예상 작업량:** M
- **회귀 위험:** 높음. 인증 갱신, popup, loading overlay, 알림과 분석 이벤트를 Preview에서 경로군별로 확인해야 한다.

### STR-003 — 생성되지 않는 경로 헤더가 언어·레이아웃·광고 분기의 단일 입력임

- **심각도:** P1 높음
- **근거:** app/layout.tsx:41-66은 x-pathname/x-url로 html 언어, download 광고 제외, vote 광고 지연을 계산하고 헤더가 없으면 언어를 ko로 둔다. app/[lang]/layout.tsx:74-95는 같은 헤더로 open-in-browser shell과 VoteLiteClientLayout을 선택한다. components/server/banner/BannerListFetcher.tsx:57-71도 헤더가 없으면 배너 링크 언어를 ko로 만든다. 반면 middleware.ts:82-84는 요청 헤더를 그대로 전달할 뿐 두 헤더를 설정하지 않는다. 기존 조사 docs/policy-sync-2026-08.md:45-65도 이 분기를 dead code로 판정하고 VoteLite를 갑자기 활성화할 때의 회귀를 경고한다.
- **영향:** 저장소 내부 동작만 기준으로 25개 localized page 모두 최상위 html lang이 ko로 내려가고, download 광고 제외·vote 광고 지연·VoteLite·open-in-browser 우회가 실행되지 않는다. 배너 링크도 ko로 변환된다. 또한 두 layout의 headers() 호출은 정적 렌더링 가능 경로를 요청 의존 경로로 만든다. 외부 프록시가 헤더를 주입하는지는 이 저장소에서 확인할 수 없으므로 그 부분은 **추측**이며, 클라이언트가 임의 헤더를 보낼 수 있는 환경이면 신뢰 경계 문제도 생긴다.
- **최소 수정 방향:** params와 명시적 route group/layout으로 분기를 표현해 헤더 의존을 제거하는 안을 우선 검토한다. middleware 주입을 선택할 경우 신뢰되지 않은 기존 헤더를 덮어쓰고, VoteLite를 feature flag로 제한해 Preview에서 검증한다.
- **예상 작업량:** M~L
- **회귀 위험:** 높음. 기존 문서가 경고하듯 헤더만 켜면 전 vote 경로의 provider/layout이 동시에 바뀐다.

### STR-004 — middleware가 거의 모든 인증 페이지 요청에 Supabase 호출을 최대 2회 추가하고 오류를 숨김

- **심각도:** P1 높음
- **근거:** middleware.ts:152-167은 auth.getUser() 뒤 로그인 경로가 아니면 user_profiles.deleted_at을 추가 조회한다. middleware.ts:214-219의 matcher는 API와 정적 자원을 제외한 거의 모든 페이지 경로를 포괄한다. 쿠키 set/delete 오류는 middleware.ts:120-147에서, 프로필·인증 오류는 middleware.ts:202-208에서 모두 무시된다. middleware.ts:24-80의 선호 언어 계산 함수는 정의돼 있지만 실제 middleware 흐름에서 호출되지 않는다.
- **영향:** 인증 사용자의 페이지 navigation마다 Auth 검증 네트워크 왕복과 프로필 조회가 들어가므로 Supabase 지연이 전체 페이지 TTFB로 증폭된다. 프로필 조회 장애 시 탈퇴 계정 차단은 fail-open이고, 관측 로그가 없어 발생 빈도도 알 수 없다. middleware 직접 테스트는 0건이다.
- **최소 수정 방향:** middleware는 세션 쿠키 갱신과 명시적 redirect만 담당하게 줄이고, 탈퇴 검사는 인증이 필요한 server layout/service에서 한 번 수행하거나 검증 가능한 claim/cache로 옮긴다. 실패 카운터와 구조화 로그를 추가한다. claim·RLS·DB 변경은 **picnic-supabase 이관 필요**다.
- **예상 작업량:** M
- **회귀 위험:** 높음. 탈퇴 계정 차단과 OAuth callback을 별도 테스트해야 한다.

### STR-005 — Supabase 서버 클라이언트 factory가 세 구현·두 환경변수 계약으로 분리됨

- **심각도:** P1 높음
- **근거:** lib/supabase/server.ts:26-80은 Database generic, NEXT_PUBLIC 환경변수, host별 cookie domain 정제를 사용하는 주 factory다. utils/supabase-server-client.ts:23-90은 generic 없이 SUPABASE_URL/SUPABASE_ANON_KEY를 쓰고 request scope 오류 시 빈 cookie store를 반환하며 React cache로 감싼다. 같은 파일 utils/supabase-server-client.ts:94-138에는 NEXT_PUBLIC 키를 쓰는 세 번째 server action factory가 있다. lib/supabase/server.ts:99-108에는 세 deprecated alias도 남아 있다.
- **영향:** 호출 위치에 따라 타입 안전성, Preview cookie domain, 누락 환경변수의 실패 방식, 세션 쓰기 동작이 달라진다. 현재 두 번째 factory는 lib/data-fetching/server/fetchers.ts:8, components/server/star-candy/StarCandyProductsFetcher.tsx:4, app/api/vote/results/route.ts:2에서 사용돼 실제 경로다.
- **최소 수정 방향:** typed factory 한 곳을 기준으로 createRequestClient, createAnonClient, createServiceRoleClient처럼 권한을 이름에 드러낸다. 먼저 위 3개 호출부를 이동하고 deprecated alias를 단계적으로 제거한다. service role client는 전역 cache 대상으로 만들지 않는다.
- **예상 작업량:** M
- **회귀 위험:** 중간~높음. Preview cookie와 server action 세션 쓰기를 확인해야 한다.

### STR-006 — 투표 목록의 쿼리·정렬·변환 계약이 네 계층에 중복됨

- **심각도:** P1 높음
- **근거:** 첫 페이지 SSR은 app/[lang]/(main)/vote/page.tsx:84-96에서 server getVotes를 쓰고, 다음 페이지는 components/client/vote/list/VoteListCSR.tsx:35-53에서 /api/votes를 호출한다. 서버 계약은 lib/data-fetching/server/vote-service.ts:21-84, 클라이언트 직접 조회 계약은 lib/data-fetching/client/vote-service.client.ts:10-170, API 계약은 app/api/votes/route.ts:12-178에 각각 select·필터·정렬·변환을 보유한다. 구형 utils/api/queries-vote.ts:5-90도 다른 fallback과 camelCase 변환을 유지한다. lib/vote/vote-order.ts:11-17만 일부 정렬 조건을 공유한다.
- **영향:** 같은 화면에서 SSR 1페이지와 API 2페이지 이후의 item 정렬, admin 처리, empty/error 반환이 달라질 수 있다. 실제로 서버 서비스는 조회 실패를 빈 배열로 바꾸지만 app/api/votes는 500을 반환하고, 구형 helper는 FALLBACK_VOTES를 반환한다.
- **최소 수정 방향:** select/query 조건과 normalize를 순수 공유 모듈로 추출하고 server-only factory와 route adapter만 분리한다. status×area×page 조합에 대해 SSR 서비스와 API 응답 동등성 테스트를 추가한다.
- **예상 작업량:** L
- **회귀 위험:** 높음. 투표 노출 순서와 admin 가드에 직접 영향한다.

### STR-007 — QNA 메시지 쓰기가 action/API 두 구현으로 갈라져 탈퇴 계정 가드가 다름

- **심각도:** P1 높음
- **근거:** app/actions/qna.ts:154-220의 createQnaMessageAction은 인증 뒤 app/actions/qna.ts:170-174에서 탈퇴 사용자를 막고 메시지·첨부를 기록한다. 현재 UI는 app/[lang]/(mypage)/mypage/qna/[thread_id]/useQnaForm.ts:158에서 app/api/qna/messages를 호출한다. 이 API는 app/api/qna/messages/route.ts:22-39에서 인증만 확인한 뒤 insert하며 탈퇴 검사가 없고, app/api/qna/messages/route.ts:46-96에 별도 첨부 구현을 갖는다. repository 검색상 createQnaMessageAction 호출부는 0건이다.
- **영향:** 탈퇴 계정의 기존 세션이 유효한 상태에서 API를 직접 호출하면 애플리케이션 계층의 차단을 통과한다. DB RLS가 최종 차단할 가능성은 있으나 스키마는 별도 저장소라 이 감사에서는 확인하지 못했으며, 이 부분은 **추측**이다. 첨부 이름·복수 파일 처리도 두 경로가 다르다.
- **최소 수정 방향:** QNA와 /media는 삭제 대상이 아니다. active API와 필요한 server action이 공유하는 mutation service에 인증·탈퇴·첨부 검증을 모으고, 미사용 message action은 호출 계약 확인 뒤 제거한다. 영구적 RLS 보강은 **picnic-supabase 이관 필요**다.
- **예상 작업량:** M
- **회귀 위험:** 중간~높음. 신규 문의 작성과 기존 thread 답변·다중 첨부를 모두 테스트해야 한다.

### STR-008 — 결제·OAuth 오류 데이터가 중앙 redaction 없이 Sentry로 전달될 수 있음

- **심각도:** P1 높음
- **근거:** utils/log-error.ts:10-15는 serverless에서 비동기 이벤트가 유실될 수 있고 중앙 redaction이 없음을 코드 주석으로 명시한다. utils/logger-targets.ts:74-91은 entry.user, entry.context, entry.request를 그대로 Sentry captureException에 전달한다. app/api/payment/paypal/capture-order/route.ts:107-110은 PayPal capture 응답 전체를, app/api/payment/paypal/capture-order/route.ts:157-160은 두 user id와 order id를, app/api/auth/google/route.ts:162-186은 OAuth 오류 body를 logError에 넘긴다.
- **영향:** 외부 공급자 오류 payload나 결제 식별자가 Sentry event에 포함될 수 있고, 응답 직후 인스턴스 종료 시 중요한 오류가 반대로 유실될 수도 있다. 별도로 생성 타입을 제외한 production TS/TSX에서 raw console 호출은 529줄·167파일이라 로그 수준·필드 계약도 일관되지 않다.
- **최소 수정 방향:** 허용 필드 기반 redaction을 logger 경계에 두고 token, cookie, authorization, provider payload, user id를 기본 제거·해시한다. 결제·OAuth route부터 await 가능한 flush 경로와 request/correlation id를 도입하고 raw console을 단계적으로 교체한다.
- **예상 작업량:** M
- **회귀 위험:** 중간. 과도한 redaction으로 장애 분석 정보가 사라지지 않게 fixture 테스트가 필요하다.

### STR-009 — 스키마 소유권 규칙과 저장소 내용이 충돌함

- **심각도:** P1 높음
- **근거:** AGENTS.md:3-6은 모든 migration/DDL이 picnic-supabase 소유이며 이 저장소에 migration을 추가하지 말라고 명시한다. 그러나 supabase/migrations/20251022090000_create_board_user_bookmark.sql:1-34는 테이블, RLS policy, index를 생성한다. supabase/functions/voting-v2/index.ts는 실제로 0 byte인 빈 Edge Function 엔트리다.
- **영향:** 이 저장소에서 실수로 db push를 수행하면 소유 저장소의 migration history와 분기할 수 있고, 빈 function은 배포 가능한 기능으로 오인된다. 현재 SQL이 이미 picnic-supabase에 반영됐는지는 이 감사에서 확인하지 않았다.
- **최소 수정 방향:** **picnic-supabase 이관 필요.** 소유 저장소의 migration history와 production 반영 여부를 먼저 대조한 뒤, 원본을 그 저장소로 이관하고 여기의 stale migration/function tree를 제거하거나 명시적 README placeholder로 바꾼다. 이 저장소에서 DDL을 실행하지 않는다.
- **예상 작업량:** M
- **회귀 위험:** 높음. history 확인 없이 파일만 옮기거나 재실행하면 데이터베이스 상태가 어긋난다.

### STR-010 — 실행·개발 lifecycle이 원격 스키마를 읽어 추적 파일을 덮어쓰고 실패를 숨김

- **심각도:** P1 높음
- **근거:** package.json:17-29의 predev, prenext-dev, prestart, 포트별 predev가 gen:types를 실행하고 대부분 || true로 실패를 삼킨다. gen:types는 production project id에서 types/supabase.ts를 덮어쓴 뒤 scripts/generate-interfaces.ts를 실행한다. scripts/generate-interfaces.ts:34-40,88-176은 생성 TS를 정규식으로 파싱해 두 번째 추적 파일 types/interfaces.ts를 덮어쓴다.
- **영향:** npm start나 개발 서버 시작이 네트워크·Supabase 로그인 상태에 의존하고 작업 트리를 예기치 않게 변경한다. 실패 시 명령은 계속 실행돼 오래된 타입으로 개발하게 된다. 11,801줄 types/supabase.ts와 2,560줄 types/interfaces.ts라는 두 모델이 동시에 존재해 drift 표면도 크다.
- **최소 수정 방향:** 자동 pre* hook에서 생성을 제거하고 명시적 schema:types:sync와 CI drift check로 바꾼다. 원격 schema 생성의 소유 절차는 **picnic-supabase 이관 필요**이며, 웹 저장소는 검증된 생성 artifact 하나만 소비하도록 한다.
- **예상 작업량:** M
- **회귀 위험:** 낮음~중간. CI credential과 개발 onboarding 문서를 함께 바꿔야 한다.

### STR-011 — 고위험 route가 coverage/CI 안전망 밖에 있음

- **심각도:** P1 높음
- **근거:** vitest.config.ts:15-75는 coverage 대상을 일부 utils·components로 whitelist하고 middleware와 app/api를 포함하지 않는다. 임계치는 vitest.config.ts:84-89에 있지만 whitelist 내부에만 적용된다. package.json:44-47에는 test 계열만 있고 typecheck/ci 스크립트가 없다. 저장소에 .github/workflows 디렉터리도 없다.
- **명령 근거:** app/api에는 route.ts가 33개(인증 10, 결제 7, QNA 2)지만 __tests__/api의 직접 route 테스트는 6개이며 모두 vote/wallet 계열이다. 인증·결제·QNA route와 middleware 직접 테스트는 0개다.
- **영향:** 결제 idempotency, OAuth redirect, 탈퇴 계정, 쿠키 갱신 같은 고위험 회귀가 전체 2,074개 테스트와 80% threshold를 모두 통과해도 검출되지 않는다. 현재 테스트의 양이 실제 보호 범위를 과대 표시한다.
- **최소 수정 방향:** typecheck + lint + vitest를 묶은 CI를 추가하고, middleware 및 auth/payment/QNA route의 Request/Response 계약 테스트를 우선한다. coverage include를 위험 기반으로 넓히되 한 번에 전체 저장소 80%를 강제하지 않는다.
- **예상 작업량:** M~L
- **회귀 위험:** 낮음. 다만 외부 공급자 mock이 실제 계약과 어긋나지 않도록 fixture를 관리해야 한다.

### STR-012 — force-dynamic, revalidate, Metadata helper가 서로 모순됨

- **심각도:** P2 중간
- **근거:** app/[lang]/(main)/rewards/page.tsx:11-14는 dynamic=force-dynamic과 revalidate=60을 동시에 선언한다. 같은 파일 app/[lang]/(main)/rewards/page.tsx:26-44는 createISRMetadata 결과를 Metadata에 spread한다. helper는 app/[lang]/utils/rendering-utils.ts:27-35에서 단순히 { revalidate }를 반환하지만 revalidate는 Metadata 필드가 아니어서 route ISR을 설정하지 않는다. 미사용 문서성 상수 app/[lang]/constants/rendering-strategies.ts:28-79는 notice/faq를 static으로, rewards를 client→ISR 대상으로 기록하는 반면 실제 notice와 faq는 app/[lang]/(mypage)/notice/page.tsx:8 및 app/[lang]/(mypage)/faq/page.tsx:7에서 force-dynamic이다.
- **영향:** 개발자는 ISR이 작동한다고 오해할 수 있지만 rewards 목록은 요청마다 동적 렌더링된다. 문서·상수·실행 코드 세 군데가 서로 다른 전략을 말해 캐시 장애나 불필요한 DB 부하를 만들기 쉽다.
- **최소 수정 방향:** route별 전략을 실행 코드의 segment config와 data access로만 표현하고, Metadata helper의 revalidate를 제거한다. 인증·cookie·실시간성 요구를 확인한 뒤 rewards/faq/notice를 각각 force-dynamic 또는 ISR 하나로 정한다.
- **예상 작업량:** M
- **회귀 위험:** 중간~높음. 개인정보/권한 응답이 shared cache에 섞이지 않는지 확인해야 한다.

### STR-013 — client 경계가 넓고 server 명명 폴더 안에도 client component가 섞임

- **심각도:** P2 중간
- **근거:** 정적 계수에서 use client는 518개 중 192개(37%), components에서는 204개 중 119개(58%)다. components/server/ErrorBoundary.tsx:1, components/server/ErrorState.tsx:1, components/server/NotFoundState.tsx:1, components/server/mypage/MyPageAccountMenu.tsx:1도 client directive를 가진다. 순수 표시 컴포넌트인 components/ui/LoadingSpinner.tsx:1-35에도 client directive가 있지만 hook·event handler·browser API가 없다.
- **영향:** 폴더명이 실행 경계를 보장하지 않아 server-only 의존성을 잘못 가져오기 쉽고, 표시 전용 컴포넌트까지 client graph로 전파된다. 과거 측정 docs/vote-page-unused-js-plan.md:9-27은 vote 페이지에서 미사용 JS 384 KiB를 기록했다. 이는 2025년의 **과거 기준값**이며 이번 감사에서는 build 금지 때문에 현재 번들 수치를 재측정하지 않았다.
- **최소 수정 방향:** server/client를 폴더명보다 import boundary와 lint 규칙으로 강제한다. LoadingSpinner·skeleton·presenter부터 directive를 제거하고, login/QNA new 같은 page-level client는 server shell + 상호작용 island로 분리한다.
- **예상 작업량:** M~L
- **회귀 위험:** 중간. context/hook의 간접 사용을 확인하며 작은 묶음으로 진행해야 한다.

### STR-014 — 확인 가능한 죽은 파일·중복 구현이 누적됨

- **심각도:** P2 중간
- **근거:** Knip은 미사용 파일 47개, 미사용 export 93개, exported type 42개, duplicate export 22개를 보고했다. 다음은 프레임워크 엔트리가 아닌 파일 중 repository import/use 검색으로 사용처 0건을 확인했거나 활성 구현과 내용 중복을 직접 확인한 후보이다.

| 후보 | 근거 | 중복/상태 |
|---|---|---|
| app/404.tsx | app/404.tsx:1-8 | App Router 특수 파일은 app/not-found.tsx:1-15이며 이 파일은 route가 아님 |
| app/constants/locales.ts | app/constants/locales.ts:1-4 | 3개 언어만 가진 stale 상수, canonical은 config/settings.ts:1-17의 12개 언어 |
| app/constants/static-pages.ts | app/constants/static-pages.ts:1-25 | 존재하지 않는 about/contact/register/photoframe/artists/events를 포함, localized 상수와 중복 |
| app/[lang]/constants/rendering-strategies.ts | app/[lang]/constants/rendering-strategies.ts:1-103 | import 0건인 문서성 코드, 실제 설정과 불일치 |
| app/[lang]/types/supabase.ts | app/[lang]/types/supabase.ts:1-34 | 생성 Database 타입과 별개의 부분 타입, import 0건 |
| app/[lang]/ClientLayout-minimal.tsx | app/[lang]/ClientLayout-minimal.tsx:1-22 | debug/minimal 대안, import 0건 |
| app/[lang]/Footer.tsx | app/[lang]/Footer.tsx:1-46 | components/layouts/Footer가 활성 구현 |
| components/client/common/LoadingSpinner.tsx | components/client/common/LoadingSpinner.tsx:1-33 | components/ui/LoadingSpinner.tsx:1-35와 사실상 동일 |
| components/layouts/ProfileImageContainer.tsx | components/layouts/ProfileImageContainer.tsx:1-29 | components/ui/ProfileImageContainer.tsx:1-107이 활성·확장 구현 |
| hooks/useBannerCarousel.ts | hooks/useBannerCarousel.ts:1-111 | components/client/banner/useBannerCarousel.ts:10-64에 활성 구현 |
| app/actions/auth.ts | app/actions/auth.ts:1-24 | exported action의 호출부 0건 |
| app/[lang]/(mypage)/notice/NoticePageClient.tsx | app/[lang]/(mypage)/notice/NoticePageClient.tsx:1-58 | 현재 notice page는 server rendering, import 0건 |
| app/[lang]/utils/lang.ts | app/[lang]/utils/lang.ts:1-27 | import 0건 |
| components/debug/EnvChecker.tsx | components/debug/EnvChecker.tsx:1-55 | import 0건 |
| styles/globals.css | styles/globals.css:1-95 | 실제 import는 app/[lang]/globals.css, import 0건 |
| supabase/functions/voting-v2/index.ts | supabase/functions/voting-v2/index.ts (0 byte) | 빈 엔트리 |

- **영향:** 검색 결과·자동 완성·Knip 보고서의 신뢰도가 낮아지고, 수정자가 오래된 구현을 고를 위험이 있다. 두 LoadingSpinner처럼 동일 UI 수정이 한쪽에만 적용될 수 있다.
- **최소 수정 방향:** 위 수동 확인 목록부터 작은 삭제 PR로 처리하고, 각 묶음에서 tsc/lint/test와 route smoke test를 수행한다. Knip의 47개를 일괄 삭제하지 않는다.
- **예상 작업량:** M
- **회귀 위험:** 중간. 동적 import, Next 특수 파일, 외부 스크립트 참조는 정적 검색에서 놓칠 수 있다.

### STR-015 — 타입 검사는 통과하지만 strict 설정과 생성 타입 구조가 안전성을 약화시킴

- **심각도:** P2 중간
- **근거:** tsconfig.json:9-11은 allowJs, skipLibCheck, strict를 함께 켜지만 tsconfig.json:33에서 noImplicitAny를 다시 끈다. tsconfig.json:44-50은 모든 테스트를 타입 검사에서 제외하고, tsconfig.json:40-42에는 단일 page와 존재하지 않는 .bak 경로가 중복 include돼 있다. 생성 파일을 제외한 production 코드에서 명시적 any 문법은 최소 267줄·120파일이다. production @ts-ignore는 0건이고, 실제 @ts-expect-error 6건은 모두 의도적인 lib/supabase/typed-rpc.type-test.ts:24-41에 있다. hooks/useDebounce.ts:50-68은 조건부 hook 호출을 deprecated로 표시하고 rules-of-hooks를 두 줄 억제하며, 실제 호출은 components/client/vote/detail/useVoteDetail.ts:86-88에 남아 있다.
- **영향:** tsc 0 오류가 테스트 코드나 암시적 any 안전성을 뜻하지 않는다. useDebounce는 현재 값 인자로 고정돼 우연히 hook 순서가 안정적이지만, 함수/값 타입이 render 사이 바뀌면 hook 순서가 바뀌는 API다. 대형 생성 타입 두 벌은 cast/alias를 늘린다.
- **최소 수정 방향:** useVoteDetail을 useDebouncedValue로 바꾸고 deprecated overload를 제거한 뒤, 영역별로 noImplicitAny를 켤 수 있게 any 수를 줄인다. 테스트용 별도 tsconfig를 추가하고 생성 타입은 한 모델로 통합한다.
- **예상 작업량:** M~L
- **회귀 위험:** 중간. noImplicitAny를 전역으로 한 번에 켜면 변경량이 과도하다.

### STR-016 — 전역 lint 예외와 중복 개발 스크립트가 검증·실행 계약을 흐림

- **심각도:** P2 중간
- **근거:** .eslintrc.json:4-5는 react-hooks/exhaustive-deps와 @next/next/no-img-element를 전역 off로 둔다. package.json:28은 Next 16에서 제거되는 next lint를 사용한다. package.json:9-27에는 manager 기반 dev 5종, next-dev, dev:legacy와 각각의 pre-hook이 중복되고, package.json:16의 legacy 명령은 선택한 포트의 PID를 kill -9한다. 실제 npm run lint 출력은 성공했지만 명령 폐기 예정과 잘못된 workspace root 경고를 함께 냈다.
- **영향:** effect dependency 누락과 원시 img 사용이 모든 파일에서 무조건 허용되고, Next 16 업그레이드 시 lint 자체가 중단된다. 현재 hooks/useDebounce.ts:64-68처럼 local 예외가 필요한 지점과 전역 정책을 구별할 수 없다. 오래된 dev entry를 실행하면 같은 포트를 쓰는 무관한 프로세스까지 강제 종료할 수 있다.
- **최소 수정 방향:** ESLint CLI flat config로 이동하고 두 규칙을 warning부터 복원한다. 필요한 예외는 사유가 적힌 line-level disable로 제한한다. dev-server-manager를 단일 진입점으로 두고 실제 문서·자동화 사용처가 없는 legacy/port alias를 정리한다. repository root 추론은 lockfile 배치 또는 outputFileTracingRoot 명시를 검토한다.
- **예상 작업량:** M
- **회귀 위험:** 낮음~중간. 기존 경고가 대량 발생할 수 있어 baseline 방식이 적합하다.

### STR-017 — 의존성 보안·버전·분류 부채가 섞여 있음

- **심각도:** P2 중간
- **근거:** package.json:66-67은 실제 인증 코드가 쓰는 jose와 repository import 0건인 jsonwebtoken을 동시에 둔다. package.json:54의 @iamtraction/google-translate는 scripts/auto-translate.ts:10과 scripts/fill-placeholders.ts:9에서만 쓰이지만 runtime dependency다. package.json:5-6은 Node 24를 요구하면서 package.json:91은 @types/node 20이다. package-lock.json:14781-14792의 Supabase CLI 1.226.4는 취약 tar를 포함하고, package-lock.json:15747-15760의 Vitest 4.1.10은 path traversal advisory의 수정 전 버전이다.
- **명령 근거:** npm outdated는 41개 outdated와 23개 major latest를, npm audit은 Next 포함 32개 취약점을 보고했다. Supabase CLI 수정 제안은 2.118.0 major, Vitest 수정은 4.1.11 patch다.
- **영향:** runtime bundle·install surface가 불필요하게 커지고, 도구 체인의 취약점과 타입 런타임 불일치가 누적된다. 모든 latest를 한 번에 올리면 React 19·Next 16·Supabase CLI 2 전환이 결합돼 회귀 원인 분리가 어렵다.
- **최소 수정 방향:** 1) Next patch, 2) Vitest patch, 3) jsonwebtoken 제거와 script-only 패키지 devDependency 이동, 4) @types/node 정렬, 5) Supabase CLI major, 6) Next/React major 순으로 분리한다.
- **예상 작업량:** M~L
- **회귀 위험:** 중간~높음. 단계별 lockfile PR과 테스트가 필요하다.

### STR-018 — 오류 UI 체계가 여러 갈래이고 한 체계는 production tree에 마운트되지 않음

- **심각도:** P2 중간
- **근거:** contexts/ErrorContext.tsx:16-32는 ErrorProvider를 정의하지만 production TS/TSX 검색에서 Provider mount는 0건이고 테스트에서만 사용한다. components/common/GlobalErrorDisplay.tsx:20-199는 이 context를 소비하지만 production import는 components/common/index.ts:15의 re-export뿐이다. 실제 app/[lang]/ClientLayout.tsx:56-76의 Provider 목록에도 ErrorProvider가 없다. 동시에 utils/error.ts, lib/supabase/error.ts, components/common/ErrorBoundary.tsx, components/server/ErrorBoundary.tsx가 별도 모델을 갖는다.
- **영향:** ErrorProvider/GlobalErrorDisplay를 쓴다고 생각한 코드가 추가되면 provider 밖 예외가 나거나 UI가 표시되지 않는다. 에러 분류, 사용자 메시지, Sentry 보고 경로가 구현마다 달라 장애 처리 일관성이 떨어진다.
- **최소 수정 방향:** 실제 사용 중인 route error.tsx와 boundary를 기준으로 하나의 Error envelope/reporting 계약을 정한다. ErrorContext 체계를 채택해 root에 마운트하거나, 현재 사용처 0건임을 확인한 뒤 관련 dead subsystem을 제거한다.
- **예상 작업량:** M
- **회귀 위험:** 중간. error boundary는 의도적으로 server/client 역할이 다를 수 있어 단순 병합하면 안 된다.

### STR-019 — sitemap 생성기가 세 경로로 겹치고 runtime filesystem scan에 의존함

- **심각도:** P2 중간
- **근거:** app/sitemap.ts:1-10은 app/[lang]/sitemap.ts의 builder를 가져와 root sitemap을 만든다. app/[lang]/sitemap.ts:226-231도 별도 localized metadata route에서 모든 언어 sitemap을 다시 반환한다. app/[lang]/sitemap.ts:83-134는 runtime에 process.cwd()/app/[lang]을 fs.readdirSync로 훑고, app/[lang]/sitemap.ts:163-215는 vote/reward/notice DB를 차례로 조회한다. 동시에 package.json:30은 build 후 next-sitemap을 실행하고 next-sitemap.config.js:1-20은 public sitemap/robots 생성을 설정한다.
- **영향:** root metadata route, 언어별 metadata route, postbuild static generator가 같은 책임을 갖는다. **추측:** Vercel output tracing이나 postbuild 시점에 따라 source tree scan 또는 public 산출물이 배포 결과에 포함되지 않을 수 있고, /{lang}/sitemap.xml이 모든 언어 URL을 중복 제공한다. DB 한 곳의 지연도 sitemap 응답에 더해진다.
- **최소 수정 방향:** App Router metadata route 또는 next-sitemap 중 하나를 소유자로 정한다. App Router를 유지하면 명시적 route manifest와 병렬·timeout 처리된 데이터 source를 사용하고 localized route가 정말 필요한지 제거 여부를 결정한다.
- **예상 작업량:** M
- **회귀 위험:** 중간. Search Console, robots, 기존 sitemap URL을 함께 확인해야 한다.

### STR-020 — Webpack splitChunks 전체 교체는 Next 기본 chunk 정책을 잃을 가능성이 있음

- **심각도:** P2 중간
- **근거:** next.config.js:107-119는 production에서 config.optimization.splitChunks를 cacheGroups 병합 없이 새 객체로 교체한다. 기존 성능 문서 docs/vote-page-unused-js-plan.md:9-38은 과거 vote 화면에서 미사용 JS 384 KiB와 route-level 분리 필요성을 기록한다.
- **영향:** **추측:** Next가 주입한 framework/vendor cache group이 사라져 공통 chunk 중복, 캐시 적중률 저하, 초기 chunk 수 증가가 생길 수 있다. 이번 감사에서는 next build 금지 때문에 현재 chunk graph로 확인하지 못했다.
- **최소 수정 방향:** 설정을 우선 제거한 Preview와 현재 설정 Preview의 route별 JS bytes·chunk 재사용률·LCP를 비교한다. 커스텀이 필요하면 기존 splitChunks와 cacheGroups를 보존해 필요한 필드만 병합한다.
- **예상 작업량:** M
- **회귀 위험:** 중간. bundle 결과를 측정하지 않고 설정만 삭제하지 않는다.

### STR-021 — 테스트는 통과하지만 비동기·DOM prop 경고가 신뢰도를 낮춤

- **심각도:** P3 낮음
- **근거:** __tests__/components/ui/SafeAvatar.test.tsx:23-68은 비동기 image fallback 상태 갱신 뒤 충분한 act/waitFor 없이 즉시 단언하는 구간을 포함한다. __tests__/components/ui/LoadingSpinner.test.tsx:5-8의 next/image mock은 priority 같은 Next 전용 boolean prop을 그대로 img에 전달한다.
- **영향:** 전체 테스트는 통과하지만 stderr 경고가 반복돼 새 warning을 놓치기 쉽고, React 19 전환 시 act 관련 실패로 바뀔 수 있다.
- **최소 수정 방향:** SafeAvatar의 비동기 전이를 user event + waitFor로 기다리고, image mock에서 priority/fill 등 Next 전용 prop을 제거한 뒤 DOM에 전달한다. CI에서 예상치 못한 console warning을 점진적으로 실패 처리한다.
- **예상 작업량:** S
- **회귀 위험:** 낮음.

### STR-022 — app/components/lib/utils/hooks/config/types의 소유 규칙이 코드로 강제되지 않음

- **심각도:** P2 중간
- **근거:** Supabase server infrastructure가 lib/supabase/server.ts:26-108과 utils/supabase-server-client.ts:23-141에 나뉘고, 동일 cn helper가 lib/utils.ts:1-3과 components/utils/cn.ts:1-8에 있다. banner hook도 hooks/useBannerCarousel.ts:1-111과 components/client/banner/useBannerCarousel.ts:10-64에 두 벌이다. 언어 설정은 config/settings.ts:1-17과 app/constants/locales.ts:1-4에, Supabase 타입은 types/supabase.ts:1과 app/[lang]/types/supabase.ts:1-34에 중복된다.
- **영향:** 새 코드를 둘 위치와 어떤 구현이 canonical인지 import path만으로 판단할 수 없다. 그 결과 infrastructure가 utils로, private component hook이 root hooks로, route 문서가 실행 상수로 퍼지고 오래된 구현도 살아남는다.
- **최소 수정 방향:** app은 route 조립, components는 UI, lib는 domain/infrastructure, utils는 상태 없는 순수 함수, hooks는 공유 client hook, config는 단일 전역 설정, types는 canonical 생성 타입+도메인 타입으로 역할을 문서화한다. no-restricted-imports 또는 dependency-cruiser류 경계 규칙을 작은 단위로 추가하고 private hook은 소비 컴포넌트 옆에 둔다.
- **예상 작업량:** M
- **회귀 위험:** 낮음~중간. 우선 re-export shim을 두고 import를 단계적으로 옮긴다.

## 감사 한계

- 운영 Vercel 환경변수, proxy/header 주입, Supabase RLS와 실제 query plan, Sentry redaction 설정, access log는 확인하지 못했다.
- build는 .next를 덮어쓰므로 요청대로 실행하지 않았다. 따라서 bundle size, route static/dynamic 판정의 build output, output tracing, sitemap 배포 결과는 추정이 포함된다.
- Knip/depcheck는 Next metadata route, service worker, config entry를 완전히 이해하지 못한다. 도구 결과는 수동 참조 검색과 파일 내용이 일치한 항목에만 정리 후보로 반영했다.

## 우선 개선 Top 10

효과 대비 비용과 선행 관계 순이다.

1. **Next 15.5.24+ 패치** — S, P0 제거. AVIF 경로를 포함한 Preview smoke test.
2. **중복 Provider 소유권 단일화** — M, 인증 listener·전역 UI·Analytics 중복 비용 제거.
3. **gen:types를 predev/prestart에서 분리** — M, 작업 트리 변이와 stale type의 조용한 허용 제거.
4. **x-pathname 분기 제거 또는 안전한 주입 결정** — M~L, locale·광고·VoteLite의 현재 오동작 해소.
5. **Supabase server factory 통합** — M, 타입·cookie·환경변수 계약 통일.
6. **middleware의 profile hot-path 조회 축소와 관측 추가** — M, 모든 인증 페이지의 latency와 fail-open 위험 감소.
7. **결제/OAuth 로그 redaction 우선 적용** — M, 민감 정보 노출과 로그 유실 위험 축소.
8. **고위험 route/middleware 테스트 + CI 추가** — M, 이후 구조 변경의 안전망 확보.
9. **투표 query/normalize 계약 통합** — L, SSR/API pagination drift 제거.
10. **수동 확인된 dead/duplicate 파일을 작은 묶음으로 정리** — M, 탐색성과 자동 분석 신뢰도 회복.

## 건드리면 안 되는 것

- **QNA와 /media를 삭제하지 않는다.** QNA는 active page/API가 있고 /media도 실제 route다. STR-007은 공통 mutation·guard 통합 제안이지 기능 삭제 제안이 아니다.
- **next.config.js:186-211의 goong-hap/community/pic/novel 및 mypage posts/comments redirect를 트래픽·SEO 확인 없이 지우지 않는다.** 삭제된 서비스의 호환 URL 경계다.
- **app/page.tsx:1-6, app/vote/page.tsx:1-7, app/vote/[id]/page.tsx:1-8, app/mypage/page.tsx:1-7, app/concert2025/page.tsx:1-7의 비언어 경로 redirect stub을 dead route로 분류하지 않는다.**
- **VoteLiteClientLayout을 x-pathname 헤더 추가만으로 즉시 활성화하지 않는다.** docs/policy-sync-2026-08.md:57-65가 대규모 회귀 표면을 이미 기록했고, 현재 중복 Provider 문제와 함께 검증해야 한다.
- **Knip이 unused로 표시한 Next 특수 파일과 외부 엔트리를 일괄 삭제하지 않는다.** app/[lang]/robots.ts, next-sitemap.config.js, public/firebase-messaging-sw.js 같은 파일은 일반 import graph 밖에서 소비된다.
- **lib/supabase/typed-rpc.type-test.ts:1-41을 unused 파일로 삭제하지 않는다.** @ts-expect-error로 RPC 타입의 실패 조건을 검증하는 compile-time 테스트다.
- **Supabase migration·RLS·Edge Function을 이 저장소에서 새로 만들거나 직접 적용하지 않는다.** 모든 DB 변경은 **picnic-supabase 이관 필요**이며 history 대조가 먼저다.
- **next.config.js:215-225의 supabase-proxy rewrite를 repository 참조 0건만으로 삭제하지 않는다.** 외부 앱·캐시·운영 URL 사용 여부는 access log로 확인해야 한다.
- **Webpack splitChunks를 측정 없이 바꾸지 않는다.** STR-020은 추측을 포함하므로 두 Preview의 bundle/Lighthouse 비교가 선행돼야 한다.
