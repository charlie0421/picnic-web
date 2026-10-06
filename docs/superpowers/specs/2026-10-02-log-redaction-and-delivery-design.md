# 로그 민감정보 가리기와 오류 전달 보장 — 설계

- 날짜: 2026-10-02
- **PR 2 최신 상태(2026-10-07 KST): #121 머지·Production 배포 및 30분 운영 관찰 완료.** 안전한 신호 정규화 구현·검증과 독립 코드 리뷰 APPROVE 뒤 사용자 승인으로 머지했다. 이전 상태 변화 `digest` 누출 반례의 수정·검증은 §10.11·§10.12, 배포 기록은 §6.2 를 따른다.
- 근거: 감사 계획 `docs/audit-2026-09-26/plan.md` U-22(STR-008), B-P4. 이슈 #73(Sentry 페이로드에 중앙 redaction 이 없다), #74(logError 가 Sentry 전달을 보장하지 않는다). 핸드오프 `docs/handoff-2026-10-02.html` §7 의 4순위
- 상태: **초안 5 + 사용자 결정 + PR 1·1b 구현(2026-10-02).** 교차 리뷰(Codex gpt-6-sol/high)가 초안 1~4 를 REQUEST_CHANGES 로 돌려보내 네 번 고쳤고(§10), 초안 5 를 APPROVE 했다(5회차). 사용자가 §9 의 결정 1·2·3·6·8 을 권장대로 확정했다. 결정 5(Sentry Data Scrubber)는 사용자가 직접 확인한다. 결정 7 은 조치가 필요 없다는 것이 확인됐다(§4.6). 결정 4(브라우저 단계)는 PR 5 전에 정한다. PR 1(수집 축소)과 PR 1b(민감 로그 줄 삭제)를 구현하면서 실측으로 드러난 것을 §2·§4·§5.1·§8 에 반영했고 달라진 점을 §10.5 에 모았다. PR 1(#119)과 PR 1b(#118)는 교차 리뷰를 통과했고(§10.6), 2026-10-05 에 머지해 Production 에 배포했다(§6.2). **특히 §2.2: 운영 빌드는 `console.log` 를 지우므로, 초안이 "Vercel 로그로 나간다"고 쓴 `console.log` 줄들은 운영에서 나가지 않는다.** 구현 계획은 `docs/superpowers/plans/2026-10-02-sentry-collection-and-sensitive-log-lines.md` 다. PR 2(계약 함수·경계 함수·전달)의 구현 계획은 `docs/superpowers/plans/2026-10-06-log-safe-error-contract-and-boundary.md` 다. PR 2 를 준비하고 구현하며 잰 결과로 §2.3·§4.2·§4.3·§4.7·§5.1·§5.2·§6.4·§8 을 고쳤다(§10.7). **실측한 route handler 경로에는 `await import` 로 인한 전달의 틈이 없었다.** PR 2 의 교차 리뷰 1차 지적과 수정은 §10.8 에 기록했다. 원 리뷰어 재검증에서 남은 자기 재투척 blocker 의 후속 수정과 검증은 §10.9, 단락 평가 회귀와 후속 검증은 §10.10 에 기록한다.
- 기준: 코드 `9174da8d`(2026-10-02 Production), `@sentry/nextjs` 9.47.1, Next 15.5.26

용어

- **sink**: 값이 서버 프로세스 밖으로 나가 남는 곳. 이 문서가 다루는 sink 는 Sentry(이벤트·transaction·breadcrumb)와 Vercel 런타임 로그(`console.*` 출력), 그리고 HTTP 응답 본문이다.
- **high**: access·refresh·ID 토큰, OAuth code, client secret, 웹훅 서명과 시크릿, API 키, 쿠키, `Authorization` 헤더, 카드 정보, 요청 본문·헤더 통째.
- **medium**: 이메일, 전화번호, 이름, IP, 결제 ID·주문 ID, 사용자 UUID.
- **호출부**: `logError`·`console.*` 를 부르는 애플리케이션 코드.
- **자동 수집**: 호출부가 넘기지 않았는데 Sentry SDK 가 스스로 이벤트에 붙이는 데이터.

## 1. 목표와 성공 기준

### 1.1 목표

이 설계가 닫는 것은 **서버와 edge 에서 나가는 sink** 다. 브라우저에서 나가는 것(브라우저 이벤트의 URL, breadcrumb, Replay)은 방법이 달라 §4.6 의 별도 단계로 둔다. Production 은 지금 Replay 를 받지 않으므로 그때까지의 임시 조치는 필요 없다(§4.6, §9 의 결정 7).

1. 결제·인증 요청을 서버가 처리하는 동안 high 값이 서버·edge 의 어떤 sink 로도 나가지 않게 한다. 이를 위해 결제·인증 라우트는 오류를 경계 안에서 잡아 원본이 밖으로 전파되지 않게 한다(§4.7). 그 밖의 경로에서 난 처리되지 않은 예외는 이 목표의 예외이고 §9 의 결정 8 로 올린다.
2. medium 값은 장애 분석에 필요한 것(사용자 UUID, 결제 ID, 주문 ID)만 이름과 형식이 정해진 필드로 남기고, 나머지(이메일, 이름, 전화번호, IP)는 남기지 않는다(§9 의 결정 2).
3. 서버의 오류가 serverless 에서 응답 직후에 흔적 없이 사라지지 않게 한다(#74). 무엇을 보장하고 무엇을 보장하지 못하는지는 §4.3 에 적는다.
4. 위 세 가지를 mock 이 아니라 실제 Next 요청과 SDK 가 실제로 만든 envelope 으로 검증한다(#73·#74 의 요구).

### 1.2 목표가 아닌 것

- 로그 레벨 정책(#75, #76). 어떤 오류를 `error` 로 보낼지는 다루지 않는다. 같은 호출부를 고치므로 순서를 §6.1 에 적는다.
- 결제 결함 6건의 수정(B-P1~B-P3). 이 설계는 결제 로직을 바꾸지 않고 로그 줄만 바꾼다.
- 브라우저 콘솔에만 남는 `console.*`(사용자 자신의 기기). Sentry 로 이어지는 것은 §4.6 에서 다룬다.
- QNA·프로필 API 의 로그. 조사에서 같은 유형이 나왔지만(§2.4) 결제·인증 뒤의 단계로 둔다.
- Sentry 클라이언트 설정의 서드파티 필터, 소스맵, 릴리스 설정(plan.md §6 의 7번). 건드리지 않는다.

### 1.3 성공 기준

서버·edge (이 설계의 PR 1~4)

| 기준 | 확인 방법 |
|---|---|
| 요청의 쿠키, `Authorization`, 웹훅 서명 헤더, 프록시 IP 헤더, 쿼리스트링이 오류 이벤트, transaction, 자식 span 어디에도 없다 | 실제 Next 서버에 요청을 보내는 envelope 테스트(§5.1). 표본을 강제하고, 종류별 수신 건수를 단언한 뒤 envelope 전체에서 canary 를 찾는다 |
| 서버가 밖으로 부르는 요청(Supabase, PayPal, PortOne)의 URL 쿼리가 span 에 없다 | 같은 테스트. 자식 span 이 실제로 수신됐는지 건수로 확인한다 |
| 결제·인증 라우트의 로그가 남기는 값이 §4.2 의 계약을 통과한 것뿐이다(닫힌 목록의 사건 코드·오류 코드·오류 이름, 형식을 검증한 ID, 숫자) | 계약 함수의 단위 테스트(canary 를 코드·이름·stack 에 넣는 사례 포함), lint 규칙, 위 envelope 테스트와 서버 표준 출력 검사 |
| 결제·인증 라우트에서 던져진 오류가 Next 의 미처리 오류 로그와 `onRequestError` 에 닿지 않는다 | 경계 함수의 테스트와 envelope 테스트: 라우트 안에서 canary 가 든 오류를 던지고 표준 출력과 envelope 에 원본 메시지가 없는지 본다(§4.7, §5.1) |
| 그 밖의 경로의 처리되지 않은 예외 이벤트에 요청 헤더와 URL 쿼리(`contexts.nextjs.request_path` 포함), 값 모양이 알려진 비밀(JWT, `Bearer`)이 없다 | envelope 테스트에 예외를 던지는 요청을 넣는다(§4.7, §5.1) |
| 결제·인증 라우트가 `console.*` 를 직접 부르지 않는다 | lint 규칙(경로 한정 `no-console`) |
| 오류가 나면 가린 로그 한 줄이 응답 전에 서버 표준 출력(Vercel 로그)에 남는다 | 통합 테스트(§5.2) |
| Vercel 요청 컨텍스트 안에서 flush 제한(2초) 안에 transport 가 전송을 끝낸다. 결제·인증 라우트에서는 제한을 넘기면 그 사실이 로그에 남는다. Sentry 가 받아 저장했는지는 이 기준이 아니다 | 지연 transport 테스트(§5.2): 정상, 제한 초과, 요청 컨텍스트 없음 |
| flush 가 응답을 늦추지 않는다 | 같은 테스트에서 응답 시각과 transport 완료 시각을 비교한다 |
| 가린 뒤에도 장애 분석이 된다 | 대표 오류 다섯 가지의 이벤트에 사건 코드·결제 ID·사용자 UUID 가 남는지 fixture 로 확인한다 |

브라우저 (§4.6 의 단계)

| 기준 | 확인 방법 |
|---|---|
| OAuth 콜백 주소의 `code` 같은 쿼리가 브라우저 이벤트, breadcrumb, transaction, Replay 에 없다 | 브라우저 envelope 테스트(Playwright 로 실제 페이지를 열고 DSN 을 로컬 수집기로 돌린다) |

## 2. 현재 상태 — 실측

### 2.1 SDK 가 스스로 붙이는 것

2026-10-02 에 로컬 `next start`(Production 빌드, `NODE_ENV=production`)의 `SENTRY_DSN` 을 로컬 수집기로 돌려 SDK 가 실제로 보내는 envelope 을 받았다. 운영 Sentry 로는 아무것도 가지 않았다. 헤더·쿠키·쿼리·본문에 표식 값(canary)을 넣은 요청을 보냈다.

- 오류 이벤트: `POST /api/payment/portone/webhook` 에 틀린 서명을 보내 `logError('[Webhook] Webhook signature verification failed')` 를 61번 일으켰다. 이벤트 61건이 모두 도착했다.
- transaction: `GET /ko/vote?code=…` 를 40번 보냈고 그 요청에서 transaction 11건이 잡혔다(`tracesSampleRate` 0.1). 웹훅 요청의 transaction 은 없었다. 초안은 "표본에 잡히지 않았다"고 썼지만 원인은 표본이 아니다. SDK 가 401·404·3xx 응답의 transaction 을 버린다(표본을 1 로 강제한 envelope 테스트에서도 0건이었다).

| 넣은 값 | 오류 이벤트(61건) | transaction(11건) |
|---|---|---|
| 쿠키 `sb-…-auth-token=…` | `request.cookies.*`, `request.headers.cookie` 에 원문 | 같음 |
| `Authorization: Bearer …` | `request.headers.authorization` 에 원문 | 같음 |
| 웹훅 서명 `x-portone-signature` | `request.headers.x-portone-signature` 에 원문 | 해당 없음. 서명이 틀린 웹훅은 401 이고 SDK 가 그 transaction 을 버린다 |
| `X-Forwarded-For` 의 IP | `request.headers.x-forwarded-for` 에 원문 | 같음 |
| 쿼리 `?token=…`, `?code=…` | `request.query_string`, `request.url` | `contexts.trace.data.http.target` 11건 전부. `request.query_string`·`request.url`·`contexts.trace.data.next.span_name` 은 5건 |
| 요청 본문(결제 ID, 이메일) | 없음 | 없음 |

- **쿠키에는 Supabase 세션(access·refresh 토큰)이 들어 있다.** 로그인 사용자의 요청에서 서버 오류가 나거나 그 요청이 transaction 표본에 잡히면 세션 쿠키가 Sentry 로 나간다. Production 에도 서버 transaction 이 들어오고 있다(2026-10-02 Sentry 에서 `GET /[lang]/vote` 등 확인).
- 원인은 `requestDataIntegration` 의 기본값이다(`cookies`·`data`·`headers`·`query_string`·`url` 이 모두 `true`, `@sentry/core/build/cjs/integrations/requestdata.js`). `sendDefaultPii` 를 켜지 않아도 붙는다. `sendDefaultPii` 는 `ip` 필드만 가른다.
- 오류 이벤트의 breadcrumb 에는 `console` 범주가 들어 있다. `ConsoleLogTarget` 이 찍은 줄을 SDK 의 Console integration 이 다시 잡은 것이다(#73 의 실패한 접근 1 이 말한 우회로).
- edge 런타임은 `sendDefaultPii` 가 꺼져 있으면 `requestDataIntegration` 을 넣지 않는다(`@sentry/vercel-edge`). Console integration 은 들어간다.

PR 1 의 envelope 테스트(2026-10-02, 표본 1, 요청 15건)에서 더 확인한 것:

- **transaction 에도 breadcrumb 이 실린다.** Next 가 처리되지 않은 오류를 `console.error` 로 찍으면 Console integration 이 그 메시지와 stack 을 breadcrumb 로 잡고, 그 뒤의 transaction 에 붙는다. 예외 메시지에 섞인 값이 오류 이벤트 말고 transaction 으로도 나간다.
- **서버가 밖으로 부르는 요청은 breadcrumb 에도 쿼리를 남긴다**(`breadcrumbs[].data.http.query`). 자식 span 에는 `url.full`·`url.query`·`http.query` 셋에 실린다.
- **transaction 이름에 쿼리가 실리는 경우가 있다.** Next 가 경로를 라우트로 바꾸지 못한 요청은 이름이 `GET <요청 주소 그대로>` 다(로컬에서는 edge 런타임 라우트로 넘어가는 요청이 그랬다).
- 라우트 핸들러에서 던져진 오류는 SDK 의 라우트 래퍼가 먼저 잡아 보낸다(`mechanism.handled=false`). `onRequestError` 의 `captureRequestError` 는 같은 오류를 다시 보내지 않으므로 그 이벤트에는 `contexts.nextjs` 가 없다.
- edge 의 오류 이벤트에는 `request` 가 없다(헤더·쿠키·쿼리가 실리지 않는다). 쿼리는 edge transaction 의 속성으로만 나온다.

**확인하지 못한 것.** Sentry 가 받은 뒤 무엇을 저장하는지는 보지 못했다. 프로젝트의 Data Scrubber 설정이 켜져 있으면 `authorization` 이나 이름에 `token` 이 든 키는 수신 단계에서 가려질 수 있다. 그래도 서명 헤더, `code` 쿼리, IP 는 기본 규칙에 걸리지 않는다. 이 설계는 "프로세스 밖으로 나가지 않는다"를 기준으로 삼고, Sentry 쪽 설정은 두 번째 방어선으로만 본다(§9 의 결정 5).

### 2.2 호출부가 넘기는 것

읽기 전용 조사(2026-10-02, 영역 다섯 개)의 결과다. 아래 줄은 직접 다시 열어 확인했다.

| 위치 | 무엇이 나가나 | 호출 | 운영에서 나가나 | 등급 |
|---|---|---|---|---|
| `app/api/auth/v1/callback/route.ts` 14~15, 42 | 콜백 URL 전체와 쿼리 전부(`code` 포함), 리다이렉트 URL | `console.log` | **나가지 않는다**(아래) | high |
| `app/api/payment/portone/callback/route.ts` 19~20, 37~39 | 콜백 URL 전체, 쿼리 전부, `token`·`pg_token` | `console.log` | **나가지 않는다** | high |
| `app/api/payment/toss/result/route.ts` 25~36 | 같은 유형(URL 전체, 쿼리 전부, `token`·`pg_token`) | `console.log` | **나가지 않는다** | high |
| `lib/supabase/social/callback-handler.ts` 59 | 콜백 파라미터 객체 통째(code, Apple 의 `id_token`·`user`). `NODE_ENV !== 'production'` 일 때만 찍힌다(`lib/supabase/social/service.ts` 25, 65) | `console.log` | 나가지 않는다 | high |
| `app/api/payment/paypal/capture-order/route.ts` 115 | PayPal 캡처 응답 통째(payer 정보가 들어올 수 있다) | `logError` | Sentry, Vercel 로그 | high |
| `app/api/payment/paypal/create-order/route.ts` 150 | PayPal 주문 생성 응답 통째 | `logError` | Sentry, Vercel 로그 | medium~high |
| `app/api/auth/google/route.ts` 164, `kakao/route.ts` 82·111·192 | 공급자의 오류 응답 본문 통째 | `logError` | Sentry, Vercel 로그 | medium |
| `app/api/auth/apple/route.ts` 46 | 정규화한 프로필(id, 이메일, 이름) | `console.log` | **나가지 않는다** | medium |
| `app/api/payment/portone/webhook/route.ts` 105 | 웹훅 요청 본문 통째를 **HTTP 응답**으로 돌려준다(`receivedBody`) | 응답 본문 | 응답 본문 | high |

**운영 빌드는 `console.log` 를 지운다.** 초안 1~5 는 위 `console.log` 줄의 sink 를 "Vercel 로그"로 적었다. 틀린 서술이었다. `next.config.js` 의 `compiler.removeConsole`(`exclude: ['error', 'warn']`)이 `NODE_ENV === 'production'` 인 빌드에서 `console.log`·`info`·`debug` 호출을 지운다. 소스의 줄만 열어 보고 빌드 산출물을 보지 않아서 놓쳤다. PR 1 의 envelope 테스트를 만들다가 테스트 라우트의 `console.log` 가 서버 출력에 나오지 않아 알았다. 근거는 셋이다.

- 로컬 운영 빌드의 산출물: `app/api/payment/portone/callback/route.js` 에 남은 `console` 호출은 `console.warn` 뿐이고 `[Callback] Full URL` 문자열이 없다. `sentry.server.config.js` 의 초기화 `console.log` 도 찍히지 않는다.
- Production 런타임 로그(2026-10-02 기준 최근 24시간): 수준이 `warn` 205건, `error` 171건뿐이고 `info` 는 0건이다.
- 설정은 2025년부터 있었다(커밋 `86e31d8c`).

그래서 **운영에서 서버 로그로 나가는 것은 `console.error`·`console.warn` 과 `logError` 다.** `logError` 의 콘솔 target 은 ERROR·FATAL 을 `console.error` 로, WARN 을 `console.warn` 으로 찍고(`utils/logger-targets.ts` 30~45), 그 줄에는 메시지와 함께 `context`·`error`(name, message, stack)·`user`·`request` 가 통째로 들어간다. 위 표의 `logError` 행은 그대로 유효하다. `console.log` 행은 개발 서버와 `NODE_ENV` 가 production 이 아닌 빌드에서만 찍힌다. 설정 한 줄에 기대고 있는 잠복한 누출이므로 지우는 것은 맞지만(PR 1b) 급하지 않다.

규모: `logError` 호출은 86건(`app/api` 65건). `app/api` 에서 `console.*` 를 직접 부르는 파일은 26개, 77건이다. 그 가운데 운영 빌드에 남는 것은 `console.error`·`console.warn` 54건이고, `console.log`·`info`·`debug` 23건은 빌드가 지운다. 결제·인증 경로(`app/api/payment`, `app/api/auth`, `lib/supabase/social`, `lib/payment`)에서는 남는 것이 22건, 지워지는 것이 39건이다. 조사는 결제 경로에서 high 5건·medium 16건쯤, 인증 경로에서 high 5건·medium 15건 이상을 찾았다. 전체 목록은 구현 계획의 첫 단계에서 표로 다시 만든다(§4.2).

### 2.3 전달

- `logError` 는 `logger.error(...)` 의 Promise 를 기다리지 않는다(`utils/log-error.ts` 72). `SentryLogTarget.write` 는 `captureException` 앞에서 `await import('@sentry/nextjs')` 를 한다(`utils/logger-targets.ts` 75).
- SDK 는 route handler 를 감싸 끝에서 `vercelWaitUntil(flushSafelyWithTimeout())` 를 부른다(`@sentry/nextjs/build/cjs/common/wrapRouteHandlerWithSentry.js` 79, flush 제한 2초). 즉 **핸들러가 끝나기 전에 큐에 들어간 이벤트는 SDK 가 이미 내보낸다.**
- 초안은 여기서 틈을 하나 가정했다. `logError` 가 동기로 돌아오고 `captureException` 은 `await import` 뒤에 불리므로, 그 순서가 SDK 의 flush 호출보다 늦을 수 있다는 것이다. **2026-10-06 에 재 보니 그런 틈은 없다**(§4.3 의 2, §5.2). 서버 번들에서 동적 import 는 마이크로태스크만으로 풀리고, flush 는 처리 중인 이벤트를 1ms 타이머로 처음 확인한다. 타이머는 마이크로태스크가 다 돈 뒤에 온다. 남는 것은 말 그대로 핸들러가 끝난 **뒤에** 남긴 기록이다(§4.3 의 3).

### 2.4 조사에서 나온 범위 밖의 것

- `app/api/user/profile/route.ts`: 280행은 요청마다 사용자 UUID 와 닉네임을 `console.log` 로 찍는다(운영 빌드에서는 지워진다). 91·114행은 `console.warn` 이라 운영에서도 찍힌다(인증되지 않은 요청의 오류 객체, 다른 사용자의 프로필을 요청한 시도).
- `app/api/qna/messages/route.ts`: insert 실패 시 `PostgrestError` 를 통째로 `console.error` 에 넘긴다. `details` 에는 위반한 행의 값이 들어온다(#76 의 실패한 접근 3).
- `middleware.ts` 는 로그를 남기지 않는다. 해당 없음.

## 3. 접근법 선택

| 안 | 요약 | #73·#74 의 실패와의 관계 |
|---|---|---|
| A. 중앙 정제 | 로거 경계와 SDK 훅 전부(`beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb`)에서 키 표로 값을 지운다 | 두 번 실패한 방식의 확장판이다. 키 표를 정확히 만들어도 문자열 안에 섞인 값(오류 메시지 속 이메일, URL 속 code)은 못 잡는다 |
| B. 수집과 호출을 좁힌다 | SDK 가 요청 데이터와 console 을 **수집하지 않게** 끄고, 호출부는 **형식을 검증한 값만 남기는 함수**로 로그를 남긴다. 키 이름으로 값을 지우는 코드가 없다 | 키 이름을 추측하지 않는다. 이벤트 종류마다 훅을 덮을 필요가 줄어든다(수집 자체가 없다) |
| C. B + 탐지 | B 에 더해, envelope 통합 테스트가 canary 값을 찾으면 실패하게 한다. 운영에서는 값 모양(JWT, `Bearer `)만 보는 마지막 가드를 둔다 | #73 의 요구 4(실제 envelope 테스트)를 설계의 중심에 둔다 |

**C 를 권한다.** 이유는 세 가지다.

1. #73 이 남긴 교훈은 "지우는 방식은 빠뜨린 경로가 우회로가 된다"였다. 수집을 끄면 빠뜨릴 경로가 없어진다. 실측한 누출(§2.1)은 전부 자동 수집에서 나왔고 설정 몇 줄로 닫힌다.
2. 호출부의 값은 종류가 정해져 있다(결제 ID, 사용자 UUID, 상태 코드, 오류 코드). 받는 쪽이 형식을 검증해 새 기록을 만들면(§4.2) "무엇을 지울까"가 아니라 "무엇을 남길까"만 정하면 된다.
3. 사람이 다시 `console.log(request.url)` 를 넣는 것은 설계로 막을 수 없다. lint 와 envelope 테스트가 막는다.

비용: 결제·인증 경로의 로그 호출 100여 곳을 고친다. 결제 코드에 손을 대지만 바뀌는 것은 로그 줄뿐이고, #88 의 계약 테스트 17건이 동작 불변을 지킨다.

## 4. 설계

### 4.1 자동 수집을 좁힌다

`sentry.server.config.js`

- `requestDataIntegration({ include: { cookies: false, headers: false, query_string: false, data: false, url: true } })` 를 명시한다. `url` 은 남기되 쿼리를 뗀다(아래).
- 기본 integration 에서 `Console` 을 뺀다(`integrations: (defaults) => […]`). 서버의 console 출력은 Vercel 로그에 이미 있고, breadcrumb 로 다시 실을 이유가 없다.
- URL 과 쿼리는 `beforeSend`·`beforeSendTransaction`·`beforeSendSpan` 세 곳에서 같은 함수로 처리한다. 규칙은 두 가지다.
  1. **URL 을 담는 값은 `?` 와 `#` 뒤를 버린다.** 대상: `event.request.url`, `event.contexts.nextjs.request_path`, transaction 이름, span 의 `description`, 속성 `http.target`·`http.url`·`url.full`·`url`·`next.span_name`. `request_path` 는 처리되지 않은 예외에서 Next 가 `req.url` 을 그대로 넘긴 값이다(`next/dist/server/base-server.js` 의 `instrumentationOnRequestError`, `@sentry/nextjs` 의 `captureRequestError.js` 18~23).
  2. **쿼리만 담는 값은 지운다.** 대상: `event.request.query_string`, 속성 `url.query`·`http.query`·`url.fragment`·`http.fragment`. SDK 는 URL 전체와 별개로 `url.query` 를 만든다(`@sentry/core/build/cjs/utils/url.js` 144~159).
- 이 규칙은 서버가 밖으로 부르는 요청의 span(`http.client`)에도 적용된다. Supabase REST 주소의 쿼리에는 필터 값(사용자 UUID 등)이 들어간다.
- 대상 목록은 추측으로 닫지 않는다. envelope 테스트가 canary 를 넣은 쿼리로 실제 자식 span 까지 받아 남은 경로를 찾는다(§5.1). SDK 를 올리면 같은 테스트를 다시 돌린다.
- 구현(`lib/sentry/scrub.ts`)은 대상 필드를 나열하지 않는다. **이벤트의 모든 문자열**에 규칙 1 을 건다: 공백으로 나눈 토큰에서 `?`·`#` 앞에 `/` 가 있거나 바로 뒤가 `키=` 모양이면 그 뒤를 버린다. transaction 이름, breadcrumb 의 `data.url`, stack frame 의 `filename`, 예외 메시지 속의 URL 이 같은 규칙을 탄다. 규칙 2 의 네 속성은 이벤트의 어디에 있든 키째로 지운다(span, trace, breadcrumb).
- 이벤트의 `request` 는 `url`·`method` 만 남기고 나머지를 버린다. `include` 옵션이 첫 번째 문이고 이것이 두 번째다.
- SDK 가 이벤트에 붙여 두는 내부 자료(`sdkProcessingMetadata`)는 읽지도 고치지도 않는다. 요청 헤더 원문이 들어 있지만 전송 전에 SDK 가 지우고, 같은 요청의 다른 이벤트와 객체를 공유한다.
- 가리다가 실패한 이벤트는 보내지 않는다(`beforeSend` 가 `null`). span 은 버릴 수 없어 설명과 속성을 비운다.
- 지금의 `beforeSend`(개발용 오류와 API 404 걸러내기)는 그대로 둔다.

`sentry.edge.config.js`

- `Console` 을 뺀다. `requestDataIntegration` 은 지금도 들어가지 않는다는 것을 테스트로 고정한다. URL·쿼리 규칙은 서버와 같은 함수를 쓴다.

`instrumentation-client.ts`

- PR 1~4 에서는 바꾸지 않는다. 브라우저는 §4.6 이다.

### 4.2 호출부: 계약을 통과한 값만 남긴다

초안 1 은 "허용 필드만 받는 타입"으로 충분하다고 봤고, 초안 2 는 형식 검증을 더했다. 리뷰가 두 번 지적한 대로 둘 다 부족하다. 형식 검사는 값이 비밀인지 가리지 못한다(`CANARY_BEARER_91c2` 는 코드 형식을 통과한다). `stack` 의 `at …` 줄에도 URL 이 들어올 수 있다(#73 이 지적한 stack frame 우회). 그래서 **문자열은 닫힌 목록에서 고르고, 목록에 없으면 버린다.**

```ts
// 사건 코드는 한 파일에 모은 닫힌 목록이다. 문자열을 조립하지 않는다.
type LogEventCode =
  | 'payment.portone.webhook.signature_invalid'
  | 'payment.paypal.capture.failed'
  | 'auth.google.token_exchange.failed'
  /* … 전수 조사 표에서 만든다 */;

type SafeLogFields = {
  userId?: string;      // UUID 형식만
  paymentId?: string;   // [A-Za-z0-9_-]{1,64} 만
  orderId?: string;     // 같은 형식
  productId?: string;   // 같은 형식
  httpStatus?: number;  // 100~599 정수만
  errorCode?: string;   // 알려진 코드 표에 있는 값만. 없으면 'unknown'
  amount?: number;      // 유한한 수만
  currency?: string;    // [A-Z]{3} 만
};

export function logSafeError(code: LogEventCode, error: unknown, fields?: SafeLogFields): void;
```

- 함수는 넘겨받은 값을 그대로 쓰지 않고 **가린 기록을 새로 만든다.**
- `errorCode` 는 공급자별 알려진 코드 표(OAuth 의 `invalid_grant` 등, PayPal·PortOne 의 오류 코드, Postgres SQLSTATE 와 PostgREST 코드)에 있는 값만 남긴다. 표에 없으면 `'unknown'` 으로 바꾼다. 표는 전수 조사와 sandbox 응답으로 만든다.
- `error` 에서 쓰는 것은 오류 이름 하나다. 알려진 이름 표(`Error`, `TypeError`, `AbortError`, `PostgrestError`, `AuthApiError` 등)에 있으면 그 이름을, 없으면 `'Error'` 를 쓴다. **원본 오류의 `message`, `stack`, `cause`, 그 밖의 속성은 쓰지 않는다.**
- stack 은 호출 지점의 **위치(스크립트 이름·줄·칸)만** 싣는다. 함수 이름은 요청이나 외부 응답의 값에서 올 수 있으므로 엔진이 만든 stack 문자열을 쓰지 않는다. V8 의 구조화된 호출 지점(CallSite)에서 위치를 꺼내고, 스크립트 주소의 쿼리·fragment 를 버린다. 이 API 가 없는 엔진에서는 프레임을 싣지 않는다. 원본 오류가 어디서 났는지는 잃지만, 외부 호출의 실패는 사건 코드와 호출 지점으로 구분된다.
- ID 필드(`userId`, `paymentId` 등)는 형식과 길이만 검증한다. 호출부가 토큰을 ID 자리에 잘못 넘기는 실수는 형식 검사로 막지 못한다. 이것은 전수 조사 표의 리뷰와, 실제 경로에 canary 토큰을 넣는 envelope 테스트(§5.1)가 막는다. 남는 위험으로 §6.4 에 적는다.
- 형식에 맞지 않는 필드는 버리고 버린 필드의 이름만 `droppedFields` 에 남긴다.
- **Console 과 Sentry 두 target 모두 이 가린 기록만 받는다.** 한쪽만 가리면 다른 쪽이 우회로가 된다(#73 의 실패한 접근 1).
- 결제·인증 경로(`app/api/payment/**`, `app/api/auth/**`, `lib/supabase/social/**`, `lib/payment/**`)에서는 `logError` 와 `console.*` 를 lint 로 금지한다.
- 구현 계획의 첫 단계는 이 경로의 로그 호출과 `throw` 문의 전수 조사 표다: 파일, 줄, 지금 넘기는 값, 붙일 사건 코드, 남길 필드. #73 의 요구 1(실제 키 전수 조사)과 #76 의 요구 1(실행으로 확인한 표)에 해당한다. 외부 응답에 무엇이 들어오는지는 sandbox 응답으로 확인하고, sandbox 가 없으면 "통째로 버리고 상태 코드만 남긴다"를 기본으로 한다.
- §2.2 의 `console.log` 가운데 URL·쿼리·토큰을 찍는 줄은 지운다. 남길 정보가 없다. 이 삭제는 계약을 기다리지 않고 먼저 할 수 있다(§6.1 의 PR 1b). 운영 빌드는 이 호출을 이미 지우고 있으므로 운영의 출력은 바뀌지 않는다(§2.2). 전수 조사 표에는 호출의 종류(`console.log` / `console.warn`·`error` / `logError`)를 적어 운영에서 실제로 나가는 것을 가른다.
- §9 의 결정 3 은 호출부를 옮기기 전에 정해져야 한다.
- 구현에서 정한 것(PR 2, 2026-10-06):
  - 사건 코드가 런타임에 목록에 없으면(타입은 `as any` 를 막지 못한다) `log.invalid_event_code` 로 바꿔 남긴다. 로그를 통째로 버리지 않는다.
  - `droppedFields` 에 들어가는 이름은 정해진 필드 이름과 `code`·`fields`·`other` 뿐이다. 호출부가 넘긴 키 이름도 밖에서 온 문자열일 수 있다(외부 응답을 펼쳐 넘기는 경우). 정해지지 않은 키는 값도 이름도 싣지 않고 `other` 하나로만 남긴다.
  - 값이 `undefined`·`null` 인 필드는 버린 것으로 세지 않는다. `fields` 가 객체가 아니거나 읽다가 던지면 읽다 만 값까지 버리고 `fields` 를 적는다.
  - 취소된 Proxy 는 `Array.isArray` 에서도 던지므로 객체 검사부터 예외를 잡는다. 기록을 만들다가 던져도 상수만 든 대체 기록(`errorName: 'Error'`, 빈 필드, `droppedFields: ['fields']`)으로 로그 한 줄을 남긴다.
  - 정해지지 않은 키는 `Reflect.ownKeys` 로 센다. Symbol 키와 열거되지 않는 키도 `other` 로 표시하고 이름과 값은 읽어 싣지 않는다.
  - 가린 기록은 기존 `Logger` 를 거쳐 나간다(`Logger.safeError`). `LogEntry` 하나가 두 target 에 넘어가므로 "두 target 이 같은 기록을 받는다"가 구조로 지켜진다.
  - Sentry 이벤트의 `fingerprint` 에 사건 코드를 더한다(`['{{ default }}', 사건 코드]`). 경계 함수가 잡은 예외는 stack 이 경계 함수가 든 공용 청크의 프레임뿐이라 라우트가 달라도 같다(envelope 테스트의 이벤트에서 확인). Sentry 는 stack 이 있으면 stack 으로 이슈를 묶으므로, 그대로 두면 서로 다른 라우트의 오류가 한 이슈로 묶일 수 있다. 실제로 묶이는지는 Sentry 에서 재지 않았다.
  - 표의 초기값은 조사가 필요 없는 것만 넣었다. 오류 이름: ECMAScript, fetch 의 `AbortError`·`TimeoutError`, 설치된 `@supabase/auth-js`·`postgrest-js` 가 쓰는 이름, 이 저장소가 정의한 오류. 오류 코드: RFC 6749 의 OAuth 코드, 이 저장소의 코드가 이미 비교하는 SQLSTATE·PostgREST 코드. 사건 코드: 계약 함수의 대체 코드 하나와 테스트 라우트용 다섯. PayPal·PortOne·Kakao 의 코드와 운영의 사건 코드는 PR 3·4 의 전수 조사에서 더한다.
  - `Logger.safeError` 는 공개 메서드다. PR 3 의 lint 는 결제·인증 경로에서 `@/utils/logger` 의 직접 import 도 막아야 한다.

### 4.3 전달: 무엇을 보장하고 무엇을 보장하지 못하나

초안 1 은 "정적 import 로 바꾸면 전달이 보장된다"고 썼다. 틀린 표현이다. 정적 import 는 이벤트가 큐에 들어가는 시점을 앞당길 뿐이다. SDK 의 flush 는 2초가 지나면 `false` 를 돌려주고 래퍼는 그 결과를 버린다(`responseEnd.js` 9~16, `client.js` 의 `flush`). `flush` 가 `true` 여도 그 뜻은 "SDK 의 처리가 끝났고 transport 가 전송을 끝냈다"이지 Sentry 가 받아 저장했다는 확인이 아니다. `vercelWaitUntil` 은 Vercel 요청 컨텍스트가 없으면 아무것도 등록하지 않는다(`vercelWaitUntil.js`). 그래서 보장을 셋으로 나눈다.

1. **항상 보장하는 것: 가린 로그 한 줄.** `logSafeError` 는 Console target 에 동기로 쓴다. 응답이 나가기 전에 서버 표준 출력에 남으므로 Vercel 런타임 로그에서 찾을 수 있다(보존 약 하루). Sentry 전송이 실패해도 오류가 흔적 없이 사라지지는 않는다.
2. **최선 노력: transport 의 전송 완료.** Vercel 요청 컨텍스트 안에서 flush 제한(2초) 안에 끝나는 경우다.
   - **`SentryLogTarget` 은 바꾸지 않는다.** 초안은 `await import` 를 정적 import 로 바꿔 이벤트가 큐에 들어가는 시점을 앞당기려 했다. 재 보니 그럴 필요가 없다(§5.2). 핸들러가 기록을 남기고 바로 응답해도 SDK 가 핸들러 끝에서 건 flush 는 그 이벤트의 전송까지 기다린다. 순서가 구조로 정해져 있기 때문이다. (1) **실측한 route handler 번들**에서 `import('@sentry/nextjs')` 는 `Promise.resolve().then(require)` 로 풀린다(SDK 래퍼가 같은 모듈을 정적으로 import 한다). 다른 레이어의 별도 청크 로더가 동기 `require` 라는 것은 빌드 코드로 확인했지만, 그 청크의 첫 동적 import 는 실측하지 않았다. (2) `client.flush` 는 처리 중인 이벤트 수를 1ms 타이머로 처음 확인하고, `captureException` 은 호출 즉시 그 수를 올린다. 타이머는 마이크로태스크가 다 돈 뒤에 온다. 이 순서를 CI 테스트와 실제 서버의 전달 시나리오가 고정한다 — `captureException` 앞에 5ms 타이머를 넣으면 둘 다 실패한다. `captureException` 뒤의 event processor 는 비동기이므로 "큐에 들어갔다"와 "전송됐다"는 여전히 다르다.
   - flush 는 요청당 한 번이면 된다. route handler 는 SDK 의 래퍼가 끝에서 flush 를 `waitUntil` 에 건다(§2.3). 우리가 로그마다 flush 를 또 걸지 않는다. 같은 전역 큐를 중복해서 기다리게 되고, 동시에 처리 중인 다른 요청의 이벤트 때문에 무관한 경고가 난다.
   - SDK 의 래퍼는 flush 결과를 버리므로 제한 초과를 알 수 없다. 제한 초과를 관측해야 하는 곳은 결제·인증 라우트다. 그 라우트는 §4.7 의 경계 함수가 감싸고, 경계 함수가 **오류를 기록한 요청에 한해 요청당 한 번** `after(async () => { if (!(await Sentry.flush(2000))) console.warn('[sentry] flush timeout'); })` 를 건다. flush 를 부르는 곳은 둘이다: SDK 래퍼(요청마다 한 번, 결과를 버린다)와 경계 함수(오류를 기록한 요청에서만 한 번, 결과를 본다). SDK 래퍼의 flush 는 끌 수 없으므로 소유자를 하나로 줄이지 않는다. 같은 큐를 함께 기다릴 뿐 서로를 늦추지 않는다. 이 경고는 "전역 큐가 제한 안에 비워지지 않았다"는 뜻이고 특정 이벤트의 실패를 가리키지 않는다. `after` 는 Next 15.5 의 안정 API 다.
   - 경계 함수가 감싸지 않는 라우트에서는 제한 초과를 관측하지 않는다. 성공 기준(§1.3)의 "제한을 넘기면 로그에 남는다"는 결제·인증 라우트에 한한다.
   - `Sentry.flush(2000)` 의 2초는 처리 대기와 전송 대기에 각각 적용된다(`client.flush`). 실측에서는 제한 초과 때 약 2.0초에 끝났다. 오류를 기록한 요청은 응답 뒤에 인스턴스를 그만큼 더 붙잡는다.
   - SDK 가 초기화되지 않았으면(DSN 없음) 경계 함수는 flush 하지 않는다. 그때 `Sentry.flush` 는 `false` 를 주는데 제한 초과가 아니다. flush 가 던지면 고정된 한 줄(`[sentry] flush failed`)만 남기고 `after` 콜백 밖으로 내보내지 않는다 — 내보내면 Next 가 그 오류 객체를 통째로 찍는다.
   - `log-safe-error.ts` 도 `log-error.ts` 처럼 브라우저 번들에 들어간다(`lib/supabase/social/**`). `after` 와 `AsyncLocalStorage` 는 서버 전용 파일 `utils/with-safe-errors.ts` 에만 둔다(런타임 분기가 아니라 파일 분리). 경계 함수가 '이 요청에서 기록이 있었는가'를 알도록 `logSafeError` 는 등록된 함수 하나를 부르고, 경계 함수는 요청마다 `AsyncLocalStorage` 에 둔 표시를 켠다 — 동시에 처리 중인 다른 요청의 기록을 세지 않는다. 브라우저에는 등록하는 코드가 없다.
3. **보장하지 못하는 것.** flush 제한 안에 전송이 끝나지 않는 경우, Vercel 요청 컨텍스트 밖(빌드 중 프리렌더, 로컬 스크립트)에서 난 오류의 전송, 그리고 Sentry 쪽의 수신·저장. 이 경우의 기록은 1번의 로그 한 줄이다. 핸들러가 끝난 **뒤에** 남긴 기록(기다리지 않은 Promise 가 나중에 실패하는 경우)도 여기에 든다. 그 요청의 flush 는 이미 끝났다(CI 테스트가 고정한다). 스트리밍 응답을 반환한 뒤 스트림에서 난 오류도 경계의 `try/catch` 가 잡지 못한다. 현재 결제·인증 라우트는 스트리밍하지 않는다.

`waitUntil` 에 로거의 Promise 만 거는 방식(#74 에서 철회)은 쓰지 않는다. `logError` 의 동기 시그니처는 그대로 둔다.

### 4.4 응답 본문

`app/api/payment/portone/webhook/route.ts` 105 의 `receivedBody` 를 지운다. 400 응답은 `{ error: 'Missing paymentId' }` 만 준다. 결제 계약 테스트(#88)가 이 응답 모양을 고정하고 있으면 테스트를 같이 고친다.

### 4.5 마지막 가드

운영에서 값 모양으로만 보는 가드를 `beforeSend`·`beforeSendTransaction` 끝에 둔다: JWT 모양(`eyJ…\.…\.…`)과 `Bearer ` 뒤의 토큰이 이벤트 문자열에 있으면 그 값을 고정 문자열로 바꾸고 태그 `redaction.tripwire=1` 을 붙인다. 정제 수단이 아니라 **경보**다. 이 태그가 달린 이벤트가 생기면 §4.1·§4.2 에 구멍이 있다는 뜻이다. 넣을지는 §9 의 결정 6 이다.

구현에서 정한 것:

- 처리되지 않은 예외의 메시지에서 걸려도 태그를 붙인다. 그 경우는 §4.1·§4.2 의 구멍이 아니라 결정 8 의 예외지만, Next 가 원본 메시지를 이미 Vercel 로그에 찍었다는 뜻이므로 알아야 한다.
- span 에서 걸리면(`beforeSendSpan`) span 의 `data` 에 `redaction.tripwire=1` 을 남기고, `beforeSendTransaction` 이 그것을 이벤트 태그로 올린다.
- JWT 는 base64url 세 덩어리가 각각 10자 이상일 때, `Bearer` 토큰은 16자 이상이고 숫자가 하나 이상 있을 때만 잡는다(`Bearer token is missing` 같은 문장을 건드리지 않는다).
- envelope 테스트는 **기대하지 않은 곳의 태그를 실패로 본다.** 토큰 모양 canary 가 새더라도 가드가 먼저 가리면 canary 검색으로는 보이지 않기 때문이다. 이 검사가 구현의 결함 하나를 잡았다(§10.5).

### 4.6 브라우저 (별도 단계)

브라우저에서는 "수집을 끈다"가 통하지 않는다. 주소 자체가 이벤트의 `request.url`, navigation breadcrumb, pageload transaction 에 들어간다. OAuth 콜백 페이지(`/auth/callback/{provider}?code=…`)가 대표적이다.

Replay 는 **지금 Production 에서 꺼져 있다.** 코드의 기본값은 오류 세션 표본율 1.0 이지만(`instrumentation-client.ts` 11: `NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE` 가 없을 때) Production 에는 이 환경변수가 들어 있고, 2026-10-02 에 배포된 클라이언트 번들을 내려받아 확인한 값은 `tracesSampleRate` 0.1, `replaysSessionSampleRate` 0, `replaysOnErrorSampleRate` 0 이다. 두 표본율이 모두 0 이면 Replay integration 자체가 등록되지 않는다(`instrumentation-client.ts` 의 지연 등록 조건). 초안 1~5 는 코드 기본값만 보고 "지금 1.0 이다"라고 썼다. 틀린 서술이었다. 환경변수를 지우거나 값을 올리면 Replay 가 다시 켜지므로, 그 전에 아래의 브라우저 단계가 끝나 있어야 한다. `maskAllText` 로 화면의 글자는 가려지지만 URL 정책은 검증된 적이 없다(#73 의 5번).

- 방법은 서버와 같은 URL·쿼리 함수를 클라이언트의 `beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb` 와 Replay 의 `beforeAddRecordingEvent` 에 거는 것이다. 이것은 #73 이 경고한 "모든 이벤트 종류를 덮어야 한다"에 해당하므로, **브라우저 envelope 테스트가 먼저 있어야 한다**(Playwright 로 실제 페이지를 열고 DSN 을 로컬 수집기로 돌려 Replay 를 포함한 envelope 을 받는다).
- 이 단계 전까지 Replay 는 지금처럼 꺼 둔다. Production 환경변수 `NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE`·`NEXT_PUBLIC_SENTRY_SESSION_SAMPLE_RATE` 를 0 보다 크게 바꾸지 않는다(§9 의 결정 7).
- 클라이언트의 서드파티 필터와 그 밖의 설정은 건드리지 않는다.

### 4.7 처리되지 않은 예외

라우트가 오류를 잡지 않으면 두 가지가 일어난다. Next 가 **원본 오류를 서버 표준 출력에 찍고**(`next/dist/server/route-modules/route-module.js` 의 `onRequestError`: Production 에서는 `_log.error(err)`), 이어서 `instrumentation.ts` 34 의 `onRequestError` 가 `Sentry.captureRequestError` 를 부른다. SDK 는 요청 헤더 전체를 `normalizedRequest` 에 넣고 원본 오류를 그대로 `captureException` 에 넘긴다(`captureRequestError.js` 9~33). 표준 출력에 찍히는 쪽은 Sentry 의 훅으로 가릴 수 없다.

결제·인증 라우트: **경계에서 잡는다**

- 결제·인증의 route handler 를 경계 함수로 감싼다: `export const POST = withSafeErrors('payment.portone.webhook.unhandled', handler)`.
- 경계 함수는 핸들러가 던진 모든 오류를 잡아 `logSafeError(사건 코드, error)` 로 기록하고 고정된 500 응답을 돌려준다. 원본 오류는 Next 로 전파되지 않으므로 미처리 오류 로그와 `onRequestError` 에 닿지 않는다.
- 응답 본문에는 오류 메시지를 넣지 않는다. 지금 일부 라우트는 `details: error.message` 를 응답에 넣는다(`app/api/payment/portone/webhook/route.ts` 의 500 응답). 전수 조사 표에 응답 본문도 넣는다.
- 결제 웹훅은 상태 코드에 의미가 있다(PortOne 은 5xx 에서 다시 보낸다). 경계 함수가 돌려주는 코드는 지금 그 라우트의 미처리 오류와 같은 500 으로 두고, 계약 테스트(#88)가 이를 고정한다.
- 인증 경로의 클라이언트 쪽 코드와 서버 컴포넌트는 route handler 가 아니라 이 방법이 닿지 않는다. 전수 조사에서 따로 표시한다.
- 구현에서 정한 것(PR 2):
  - `redirect()`·`notFound()` 와 Next 의 동적 렌더링 신호는 필요한 값만 검증해 **새 신호로 정규화**한다(2026-10-06 사용자 승인). 원본 객체 동일성은 보장하지 않으며 message·stack·cause·임의 메타데이터와 getter·Proxy 를 전달하지 않는다. Next 가 요구하는 순서와 시점에만 원본을 읽고, 읽기 예외는 내부 표식으로 바꿔 신호와 구분한다. redirect 의 URL·종류·허용된 상태 코드와 접근 fallback 상태를 검증·재구성하고 나머지 신호는 고정 식별값만 싣는다. 안전하게 만들 수 없는 신호는 가린 로그와 고정 500 으로 처리한다. 현재 값이 신호가 아닐 때만 `cause` 를 읽는다. 사슬은 최대 10개 연결까지 따라가며 읽기 예외·순환에서 멈춘다. 실제 Next·React 신호와 리다이렉트 응답·요청 쿠키의 보존을 테스트한다(§10.11·§10.12).
  - 고정 응답은 500, 본문 `{ "error": "Internal server error" }` 다.
  - 경계가 겹치면 바깥 경계가 flush 를 한 번 건다.
  - `after` 를 쓸 수 없으면(요청 범위 밖 — 테스트가 핸들러를 직접 부를 때) flush 없이 응답만 돌려준다.

그 밖의 경로: **남기되 좁힌다** (§9 의 결정 8)

- 처리되지 않은 예외는 버그이고 메시지가 있어야 고칠 수 있다. 원본 메시지를 남긴다. 이것은 "high 값이 어떤 sink 로도 나가지 않는다"의 예외다. 메시지에 값이 섞이면 Vercel 로그와 Sentry 에 남는다.
- Sentry 로 가는 쪽은 좁힌다. 헤더·쿠키·쿼리는 §4.1 이 닫고(`contexts.nextjs.request_path` 포함), `beforeSend` 에서 `exception.values[].value` 에 값 모양 규칙을 적용한다(URL 의 `?`·`#` 뒤 제거, JWT 모양과 `Bearer` 토큰 치환, 이메일 치환). 모양이 알려진 값만 잡는다. 불투명한 OAuth code, 서명, API 키는 못 잡는다.
- 메시지는 8,192자에서 자른다. Sentry 가 메시지에 두는 상한과 같고, 이메일 치환의 실행 시간을 묶는다. 가리는 코드는 입력 길이에 선형이다(예외 메시지와 요청 경로는 외부 입력이다).
- 실측(§2.1): 라우트 핸들러의 오류는 SDK 의 라우트 래퍼가 먼저 잡으므로 그 이벤트에는 `contexts.nextjs.request_path` 가 없고, 쿼리는 `request.url`·`request.query_string` 으로 실린다. `request_path` 는 래퍼가 잡지 못해 `onRequestError` 까지 올라간 오류에만 붙는다. 규칙은 둘 다 덮는다.
- `stacktrace.frames` 의 `filename`·`abs_path` 는 URL 규칙을 지난다. `vars` 는 서버 SDK 가 기본으로 붙이지 않는다는 것을 envelope 테스트로 고정한다.

테스트용 라우트

- envelope 테스트에는 "메시지에 canary 가 든 오류를 던지는 요청"이 필요하다: 경계 함수로 감싼 것 하나, 감싸지 않은 것 하나.
- 이 라우트는 **별도 테스트 빌드에만** 넣는다. 런타임 환경변수로는 이미 빌드된 라우트를 뺄 수 없다.
- 방법(구현하면서 바꿨다): 라우트의 원본을 `scripts/envelope-test/routes/` 에 두고, 실행기가 테스트 빌드를 만드는 동안만 `app/api/envelope-test/` 로 복사했다가 지운다. 저장소의 `app/` 에는 테스트용 라우트가 없으므로 보통 빌드에 들어갈 길이 없다. 산출물은 `ENVELOPE_TEST=1` 일 때 `.next-envtest` 에 따로 둔다(`next.config.js`). Vercel 빌드에서 `ENVELOPE_TEST=1` 이면 빌드가 실패한다. 라우트는 런타임에서도 `ENVELOPE_TEST` 를 확인해 아니면 404 를 준다.
- 초안의 방법(`pageExtensions` 에 `envtest.ts` 를 더하고 `route.envtest.ts` 로 두기)은 쓰지 못했다. Next 15.5 는 확장자가 두 겹인 **edge** 라우트에 client reference manifest 를 만들지 않아 빌드가 "Collecting page data" 에서 실패한다(`flight-manifest-plugin` 이 이름이 정확히 `/route` 로 끝나는 entry 에만 manifest 를 만든다. 페이지는 `page.xxx` 를 처리한다). node 라우트는 빌드됐다.
- edge 의 이벤트를 받기 위한 테스트 라우트를 하나 둔다(`export const runtime = 'edge'`). middleware 와 같은 edge SDK 설정을 타고, middleware 에는 테스트 코드를 넣을 수 없기 때문이다.
- 운영 산출물에 이 라우트가 없다는 것을 검사한다: 보통 빌드의 라우트 목록(`.next/app-path-routes-manifest.json`)에 테스트 경로가 없어야 한다는 단언을 `postbuild` 의 렌더링 모드 검사 옆에 둔다(`scripts/verify-no-test-routes.js`). 실행기가 중간에 죽어 복사본이 남은 채로 빌드하면 여기서 걸리고, 단위 테스트도 `app/api/envelope-test` 가 없는지 본다.

## 5. 테스트

### 5.1 envelope 테스트 (누출)

초안 1 은 핸들러를 직접 불러 검사한다고 썼다. 그러면 Next 의 계측(route handler 래퍼는 빌드 때 loader 가 끼워 넣는다, `routeHandlerWrapperTemplate.js`)을 건너뛰고, 오늘 실측에서 쿼리가 나온 transaction 경로를 검사하지 못한다. 그래서 **실제 Next 서버에 실제 요청을 보낸다.**

- 방법: Production 빌드를 `next start` 로 띄우고 `SENTRY_DSN` 을 로컬 수집기로 돌린다(§2.1 의 방법을 스크립트로 만든다: `npm run test:envelope`).
- 표본을 강제한다. `sentry.server.config.js` 가 `SENTRY_TRACES_SAMPLE_RATE` 가 있으면 그 값을 쓰게 하고(없으면 지금처럼 0.1), 테스트는 1 로 준다.
- 보내는 요청(PR 1 의 구현, 종류마다 3번): 페이지 `GET /ko/vote?code=<canary>`(서버가 Supabase 를 불러 자식 span 이 생긴다), PortOne 웹훅(서명 실패 → `logError`), 테스트 라우트 셋 — 밖으로 요청을 보낸 뒤 `logError` 를 부르는 것(`handled`), 메시지에 canary 가 든 오류를 던지는 것(`throw`), 같은 것을 edge 런타임에서 하는 것(`edge-throw`). 헤더·쿠키·쿼리·본문에 canary 를 넣는다. 경계 함수로 감싼 테스트 요청과 PayPal·OAuth 경로의 요청은 PR 2~4 가 이 시나리오에 더한다. 이 테스트는 `ENVELOPE_TEST=1` 로 만든 별도 빌드에서 돈다(§4.7).
- **수신 건수를 먼저 단언한다**: `logError` 의 오류 이벤트(웹훅 3건, 테스트 라우트 3건), 처리되지 않은 예외의 이벤트(node 3건, edge 3건, `mechanism.handled` 가 `false`), transaction(페이지, 밖으로 부르는 요청, 예외를 던진 요청, edge 라우트, middleware — 각 3건 이상), 자식 span(`http.client`) 1건 이상. 아무것도 받지 못한 테스트가 통과하는 일을 막는다. 웹훅의 transaction 은 기대하지 않는다(401 응답의 transaction 은 SDK 가 버린다).
- canary 는 세 묶음으로 나눈다. **묶음 A**: 일반 요청과 처리된 오류의 요청에 넣는 값(쿠키, `Authorization`, 서명, IP, 쿼리, 본문, 밖으로 부르는 요청의 쿼리). **묶음 B**: 감싸지 않은 테스트 요청에만 넣는 값(메시지 표식, 요청 쿼리, 메시지 속의 URL 쿼리·JWT 모양·Bearer 토큰·이메일). **묶음 C**: 테스트 라우트가 `console.warn` 으로 찍는 값(`console.log` 는 운영 빌드가 지운다).
- 무누출 검사: 묶음 A 는 envelope 전체(envelope 헤더, 항목 헤더, event, transaction, span, breadcrumb, 객체의 키)와 서버 출력 어디에도 없어야 한다. 묶음 C 는 envelope 에 없어야 하고 서버 출력에는 있어야 한다(출력 캡처가 살아 있다는 증거이자 console breadcrumb 이 사라졌다는 증거다).
- 허용 노출 검사(결정 8 의 예외를 정확히 고정한다): 묶음 B 의 메시지 표식은 envelope 의 `exception.values[].value` 와 서버 출력의 Next 미처리 오류 줄에만 있고 그 밖의 위치에는 없어야 한다. 묶음 B 의 나머지 값은 envelope 어디에도 없어야 하고(메시지에서도 가려져야 한다), 서버 출력에서는 Next 의 미처리 오류 줄에만 있어야 한다. 결정 8 이 "받아들이지 않는다"로 바뀌면 이 검사를 무누출 검사로 바꾼다.
- tripwire 검사: 처리되지 않은 예외의 이벤트에는 `redaction.tripwire=1` 태그가 있어야 하고(메시지의 JWT·Bearer 가 가려졌다), **그 밖의 이벤트와 transaction 에는 없어야 한다**(§4.5).
- 그 밖의 단언: `contexts.nextjs.request_path` 가 있으면 쿼리가 없다. stack frame 에 `vars` 가 없다.
- 수정 전에 실패하는 것을 먼저 봤다(2026-10-02). 건수 아홉 종류가 모두 맞는 상태에서 **실패 70건**: 쿠키·`Authorization`·서명·IP 가 `request.headers.*`·`request.cookies.*` 에, 쿼리가 `request.url`·`request.query_string`·`contexts.trace.data.http.target`·`next.span_name`·transaction 이름에, 밖으로 부르는 요청의 쿼리가 `spans[].data.url.full`·`url.query`·`http.query` 와 `breadcrumbs[].data.http.query` 에, console 줄과 Next 가 찍은 미처리 오류(메시지, stack)가 `breadcrumbs[]` 에 있었다. 수정 뒤 **실패 0건**, 건수는 같다(오류 이벤트 12건, 기대한 transaction 18건 이상).
- 로컬 실행의 차이: DSN 은 `127.0.0.1`, 가짜 외부 서버는 `localhost` 로 부른다(SDK 는 DSN 의 호스트 문자열이 든 주소로 가는 요청에 span 을 만들지 않는다). edge 는 SDK 가 `SENTRY_TRACES_SAMPLE_RATE` 를 스스로 읽어 표본이 켜지므로 운영에는 없는 edge transaction 이 온다. edge SDK 가 수집기로 보내는 요청이 node 쪽 transaction 으로 잡힌다(운영에서는 `ignoreOutgoingRequests` 가 `sentry.io` 를 거른다). 셋 다 검사 대상에 넣었다.
- 빌드가 Supabase 조회에 의존하므로 이 테스트는 CI 에 넣지 못한다. PR 1~4 의 머지 전 필수 확인으로 두고 결과를 PR 본문에 적는다. Sentry SDK 를 올릴 때도 돌린다.
- 판정 로직(`scripts/envelope-test/analyze.js`)과 가리는 함수, 옵션 객체는 단위 테스트로 CI 에 둔다(`requestDataIntegration` 의 `include` 를 실제 SDK 에 넣었을 때의 결과, 실제 SDK 의 기본 목록에서 `Console` 이 빠지는지, 훅 세 개가 같은 함수를 쓰는지, URL·쿼리 함수의 입력·출력 표). 이것만으로는 누출이 없다고 말할 수 없다.
- **PR 2 가 더한 것 (2026-10-06).** 경계 함수로 감싼 요청 둘: 이름·메시지·stack·cause 에 canary 가 든 오류를 던지는 것(`boundary-throw`)과, 같은 오류와 필드를 `logSafeError` 로 남기는 것(`boundary-handled`). 판정에는 가린 기록의 모양(예외의 type, fingerprint, `contexts.log` 의 키와 값 전부)과 서버 출력의 가린 로그 줄 수를 더했다. 경계 없이, 지금의 호출부처럼 `logError` 에 오류 객체와 값을 넘긴 모습으로 먼저 돌렸다 — **실패 20건**: 오류의 이름이 예외의 `type` 과 span 의 `error.type` 으로, `cause` 가 이어진 예외의 값으로, 필드 값이 `contexts.log` 로 나갔고, 서버 출력에는 메시지·URL 쿼리·stack 의 주소·JWT·Bearer 가 그대로 찍혔다(Next 의 미처리 오류 줄과 `logError` 의 콘솔 줄). JWT·Bearer 는 Sentry 쪽에서 가려졌지만 tripwire 태그가 붙었다. 경계 함수와 계약 함수로 바꾼 뒤 **실패 0건**이다.

- **PR 2 교차 리뷰 뒤 추가한 것 (2026-10-06).** `cause` getter 가 canary 메시지를 가진 예외를 던지는 `boundary-hostile` 요청을 3번 더해 당시 총 **24건**이었다. 수정 전에는 getter 의 메시지가 Sentry 이벤트와 Next 미처리 오류 줄에 실려 **실패 4건**, 경계 수정 뒤 **0건**이었다. 가린 이벤트와 콘솔 줄이 각각 3건인지도 단언한다. 취소된 Proxy, 동적 함수 이름, Symbol 키의 반례는 단위 테스트로 검증한다.
- **PR 2 후속 회귀 검증.** 자기 재투척 오류 `boundary-self-throw` 와 읽기 실패 속성을 가진 정상 신호 `boundary-redirect` 를 각 3번 더해 총 **30건**이다. 앞의 오류는 가린 이벤트·로그·고정 JSON 500, 뒤의 신호는 오류 이벤트 없이 307·정확한 Location·빈 본문이어야 한다. 응답 본문과 Location 에도 canary 가 없어야 한다(§10.9·§10.10).

### 5.2 전달 테스트

전달은 두 곳에서 잰다.

**실제 서버** — `npm run test:envelope` 의 전달 시나리오(`scripts/envelope-test/delivery.js`). Production 빌드를 `next start` 로 띄우고, 로컬 수집기가 오류 이벤트에 답하는 시간을 조절한다(그 밖의 envelope 에는 바로 답한다 — §10.7). 로컬에는 Vercel 요청 컨텍스트가 없으므로 테스트 라우트가 같은 자리(`Symbol.for('@vercel/request-context')`)에 기록만 하는 `waitUntil` 을 달아, SDK 의 래퍼가 건 flush 의 등록 시각과 끝난 시각을 남긴다. `after()` 는 Next 의 것을 그대로 쓴다.

- 사례 1(정상): 수집기가 300ms 뒤에 답한다. 핸들러가 `logError`·`logSafeError` 를 부르고 바로 응답한다. `waitUntil` 에 걸린 flush 는 전송이 끝난 뒤에 끝난다. 서버가 뜬 뒤의 첫 요청에서도 그렇다. 응답은 전송 완료보다 앞선다. SDK 래퍼의 flush 는 요청마다 한 번이다.
- 사례 2(제한 초과): 수집기가 2600ms 뒤에 답한다. 경계 함수로 감싼 라우트는 오류를 기록한 요청마다 `[sentry] flush timeout` 을 정확히 한 줄 남긴다 — 세 번 기록해도 한 줄, 기록이 없으면 0줄. 감싸지 않은 라우트는 0줄이다(한계를 고정한다). 응답은 1초 안에 온다.
- 사례 3(요청 컨텍스트 없음): 가짜 컨텍스트를 뗀 요청. `waitUntil` 에 걸린 것이 없고 가린 로그 한 줄은 남는다.
- 판정(`evaluateDelivery`)은 순수 함수이고 단위 테스트가 CI 에서 돈다. 시나리오 자체는 누출 테스트와 같은 이유로 CI 에 넣지 못한다(§5.1).

**CI** — `__tests__/utils/log-safe-error-delivery.test.ts`. 실제 SDK(`NodeClient`)에 손으로 푸는 transport 를 붙이고 SDK 의 `wrapRouteHandlerWithSentry` 로 감싼다. 사례 1 을 `logSafeError` 와 `logError` 로, 그리고 "핸들러가 끝난 뒤에 남긴 기록은 기다리지 않는다"를 고정한다. `after` 는 대역이다(Next 의 요청 범위 밖에서는 돌지 않는다). 측정하기 전에 래퍼를 한 번 돌려 둔다 — 처음 도는 코드는 느려서 그 사이에 늦은 기록이 flush 를 따라잡아, 틈이 있어도 가려진다.

"가린 로그 한 줄이 응답 전에 남는다"는 단위 테스트가 본다. `logSafeError` 가 돌아왔을 때 `console.error` 가 이미 불려 있고(`await` 없이 단언), 경계 함수는 응답을 만들기 전에 그 줄을 찍는다. envelope 테스트는 그 줄이 요청마다 한 줄씩 서버 출력에 있는지 센다.

**결과 (2026-10-06).** 초안은 "수정 전 코드(`await import`)에서 사례 1 이 실패하는지 먼저 본다. 실패하지 않으면 '틈' 가설이 틀린 것"이라고 했다. 실패하지 않았다(§4.3 의 2). 반대로 `captureException` 앞에 5ms 타이머를 넣으면 실제 서버의 시나리오가 7건(사례 1 의 다섯 단계 전부와 사례 2 의 제한 초과 줄 둘), CI 테스트가 2건 실패한다. 테스트가 틈을 잡는다는 뜻이다.

| 사례 | 실측 |
|---|---|
| 1 정상 | flush 가 전송 완료 뒤 0~2ms 에 끝난다. 응답 4~20ms(서버의 첫 요청은 약 350ms — 라우트를 처음 올린다). 기록이 없는 요청의 flush 는 1ms |
| 2 제한 초과 | flush 가 약 2.0초에 끝난다(전송 완료보다 약 0.6초 앞). 제한 초과 줄은 경계가 오류를 기록한 요청에 한 줄씩. 응답 5~17ms |
| 3 컨텍스트 없음 | `waitUntil` 등록 0건, 로그 한 줄 |

### 5.3 그 밖

- 계약 함수의 단위 테스트: 형식에 맞지 않는 필드는 버려지고 이름만 `droppedFields` 에 남는다. canary 를 `errorCode`, 오류의 `name`·`message`·`stack`(`at https://…?code=<canary>` 줄 포함), `cause` 에 넣어도 기록에 나오지 않는다. Console 과 Sentry 두 target 이 받은 기록이 같다. 입력·출력 표로 고정한다.
- lint 규칙 테스트: 결제·인증 경로의 `console.*` 와 `logError` 호출이 오류가 된다.
- 결제 계약 테스트 17건과 `it.fails` 6건은 그대로 통과해야 한다.
- fixture 테스트: 대표 오류 다섯 가지의 이벤트에 결제 ID·사용자 UUID·오류 코드가 남는다.

## 6. 배포와 운영

### 6.1 PR 구성과 순서

| PR | 내용 | 이 PR 로 닫히는 sink | 아직 남는 것 |
|---|---|---|---|
| 1 | envelope 테스트 스크립트, 서버·edge 설정의 수집 축소와 URL·쿼리 규칙(§4.1), 처리되지 않은 예외의 메시지 규칙(§4.7) | SDK 가 스스로 붙이던 쿠키·헤더·IP·쿼리(오류 이벤트, transaction, span), 서버의 console breadcrumb, 예외 메시지 속의 URL 쿼리와 모양이 알려진 비밀 | 호출부가 넘기는 값, URL 을 찍는 `console.log`, 웹훅 응답 본문, 예외 메시지 속의 그 밖의 값, 브라우저 |
| 1b | 바로 지울 수 있는 줄: URL·쿼리·토큰을 찍는 `console.log`(`auth/v1/callback`, `payment/portone/callback`, `payment/toss/result`), 웹훅 응답의 `receivedBody`(§4.4), OAuth 콜백 프록시 catch 가 넘기던 오류 객체(교차 리뷰에서 더함, §10.6) | 웹훅 본문 에코(운영), OAuth 프록시 예외 로그의 주소(사이트 주소 설정이 잘못됐을 때). `console.log` 줄은 운영 빌드가 이미 지우고 있어 운영의 출력은 바뀌지 않는다 — 개발·비운영 빌드에서 찍히던 것과 `removeConsole` 설정에 기대던 잠복 누출을 없앤다(§2.2) | 호출부가 넘기는 값(PayPal 응답 통째 등), 브라우저 |
| 2 | 가린 기록을 만드는 계약 함수(§4.2), 경계 함수(§4.7), 전달(§4.3)과 전달 테스트 | (호출부를 옮길 준비) | 위와 같음 |
| 3 | 인증 경로의 호출부를 계약 함수로 옮기고 route handler 를 경계 함수로 감싼다. lint 규칙을 켠다 | 인증 경로의 호출부 값과 미처리 오류(Sentry, Vercel 로그, 응답 본문) | 결제 경로의 호출부 값, 브라우저 |
| 4 | 결제 경로의 호출부와 경계 함수 | 결제 경로의 호출부 값과 미처리 오류 | 브라우저, 그 밖의 경로의 미처리 예외 메시지(결정 8) |
| 5 | 브라우저(§4.6): 브라우저 envelope 테스트, 클라이언트 훅과 Replay | 브라우저 이벤트·breadcrumb·Replay 의 URL 쿼리 | QNA·프로필 API 등 2단계 |

- 모든 PR 은 고위험(개인정보·인증·결제)으로 분류해 다른 공급자의 교차 리뷰를 받는다.
- PR 1 은 §9 의 결정 1·3·6·8 이, PR 1b 는 결정 1 이 정해지면 시작할 수 있다. 가장 급한 것은 PR 1 이다(세션 쿠키가 든 요청 헤더가 Sentry 로 나간다). PR 1b 가운데 운영에서 실제로 나가던 것은 웹훅의 본문 에코뿐이다(§2.2).
- PR 4 는 결제 결함 수정(B-P1~B-P3)과 같은 파일을 건드리므로 순서를 맞춘다.
- 로그 레벨 정책(#75·#76)은 PR 3·4 와 같은 호출부를 다시 고친다. PR 3·4 뒤에 하거나 같은 PR 에서 사건 코드별로 정한다. 지금 Sentry 로 가는 것은 ERROR·FATAL 뿐이다(`utils/logger-targets.ts` 59). 레벨 정책이 Sentry 로 가는 범위를 넓히는 쪽으로 바뀐다면 가리기가 먼저 끝나 있어야 한다.

### 6.2 머지 전후 확인

- Preview 배포가 없다. 머지 전 검증은 로컬 `next start` + 로컬 수집기다(§5.1 의 스크립트). 머지 뒤에는 Sentry 에서 새 릴리스의 서버 이벤트와 transaction 을 열어 `request` 에 헤더·쿠키·쿼리가 없는지 본다.
- 이미 Sentry 에 들어가 있는 과거 이벤트는 이 변경으로 지워지지 않는다. 보존 기간과 삭제 여부는 §9 의 결정 5 다.
- **PR 1·1b 의 결과 (2026-10-05).** #118(`9ee8cfc3`)과 #119(`c78c692e`)를 차례로 배포했다. 콜백 세 라우트의 응답 12건(상태 코드, `Location`)은 머지 전과 같고, 5xx 와 Sentry 신규 이슈는 없다. 새 릴리스의 span 에서 Supabase 호출의 `url.full`·`http.url` 이 쿼리 없이 들어오고 `http.query`·`url.query` 가 사라진 것을 이전 릴리스와 나란히 확인했다. 이벤트의 `request` 블록(헤더·쿠키)은 새 릴리스에 오류 이벤트가 아직 없어 Production 에서는 보지 못했다 — 근거는 로컬 envelope 테스트다. 자세한 것은 계획의 "머지와 Production 확인".
- **PR 2 의 결과 (2026-10-06~07 KST).** 사용자 승인 뒤 [#121](https://github.com/charlie0421/picnic-web/pull/121)을 main `9f1b6130` 으로 머지했다. main CI 성공, Production `dpl_DeCeFUZ9fpWiFpdHwFBusWQFR6Jn` READY 및 `www.picnic.fan` 연결, `/ko/vote` 200, 테스트 전용 경로 12개 404 를 확인했다. 2026-10-06 23:46:28~2026-10-07 00:16:28 KST 의 30분 관찰에서 Vercel 5xx 와 Sentry 신규 이슈는 모두 0건이었다(31회 조회 모두 성공). 호출부는 아직 이관하지 않았으므로 새 경계 함수의 운영 전달 보장을 확인한 것은 아니다. 상세 구간·조회 조건·결과는 PR 2 계획서의 "머지와 Production 확인"을 따른다.

### 6.3 롤백

Vercel Instant Rollback. 설정과 로그 줄만 바꾸므로 데이터에 남는 것이 없다.

### 6.4 리스크

| 리스크 | 완화 |
|---|---|
| 요청 헤더를 빼서 장애 분석 정보가 준다(User-Agent, Referer) | 필요한 헤더만 허용 목록으로 다시 넣는다. `utils/logger-utils.ts` 의 `SAFE_REQUEST_HEADERS` 가 이미 그 방식이다 |
| Console breadcrumb 을 빼서 오류 직전의 맥락이 준다 | 서버의 console 출력은 Vercel 로그에 있다. 요청 ID 로 잇는다 |
| `logSafeError` 의 필드가 부족해 호출부가 우회한다 | 필드 추가는 이 파일을 고치는 PR 로만 한다. lint 가 우회를 막는다 |
| URL 모양 속성을 하나 놓친다 | envelope 테스트가 canary 로 잡는다. 새 SDK 버전에서 속성이 늘어도 같은 테스트가 잡는다 |
| 호출부가 토큰을 ID 필드에 잘못 넘긴다(형식 검사를 통과한다) | 전수 조사 표의 리뷰, 실제 경로에 canary 토큰을 넣는 envelope 테스트 |
| 예외 메시지에 모양이 알려지지 않은 값이 섞인다 | 결제·인증 경로의 `throw` 문 lint, 전수 조사. 완전히 막지는 못한다 |
| `SENTRY_TRACES_SAMPLE_RATE` 가 운영 환경변수로 잘못 들어가 표본이 바뀐다 | 0 과 1 사이의 수만 받고, 운영 환경변수 목록에 없음을 배포 확인 항목에 넣는다 |
| `unstable_rethrow` 는 이름대로 안정 API 가 아니다 | 실제 Next 오류(`redirect()`, `notFound()`, `DynamicServerError`)로 도는 단위 테스트가 Next 를 올릴 때 달라진 동작을 드러낸다 |
| 경계 함수가 잡은 예외는 원본 메시지와 stack 을 잃는다. 원인을 사건 코드(라우트)와 오류 이름만으로 좁혀야 한다 | 결정 3 에서 받아들였다. 부족하면 라우트 안의 단계마다 사건 코드를 나눠 `logSafeError` 를 부른다 |

## 7. 범위 밖·후속

- QNA·프로필 API 의 로그(§2.4), 그 밖의 `app/api` 의 `console.*`.
- 로그 레벨 정책(#75, #76).
- 요청·상관관계 ID 도입(감사 STR-008 의 제안).
- Vercel 런타임 로그의 보존 기간과 접근 권한 확인.

## 8. 확인한 사실과 남은 가정

확인한 사실

| 사실 | 근거 |
|---|---|
| 서버 오류 이벤트와 transaction 에 쿠키·`Authorization`·서명 헤더·IP·쿼리가 원문으로 실린다 | 2026-10-02 로컬 envelope 실측(§2.1). 이벤트 61건, transaction 11건 |
| `requestDataIntegration` 의 기본값이 쿠키·헤더·쿼리를 포함한다 | `@sentry/core` 9.47.1 `integrations/requestdata.js` |
| SDK 가 route handler 끝에서 flush 를 `waitUntil` 에 건다 | `@sentry/nextjs` 9.47.1 `common/wrapRouteHandlerWithSentry.js` 79 |
| edge 는 `sendDefaultPii` 가 꺼져 있으면 요청 데이터를 붙이지 않는다 | `@sentry/vercel-edge` 의 기본 integration 목록 |
| §2.2 의 호출부 아홉 곳 | 2026-10-02 파일을 열어 확인 |
| Production 에 서버 transaction 이 들어온다 | 2026-10-02 Sentry 조회(`span.op:http.server`) |
| 처리되지 않은 예외는 `captureRequestError` 가 요청 헤더 전체와 원본 오류를 SDK 에 넘긴다 | `@sentry/nextjs` 9.47.1 `common/captureRequestError.js` |
| SDK 가 `url.query`·`url.fragment`·`url.full` 속성을 만든다 | `@sentry/core` 9.47.1 `utils/url.js` 144~159 |
| `flush(timeout)` 은 제한을 넘기면 `false` 를 주고, `vercelWaitUntil` 은 요청 컨텍스트가 있을 때만 등록한다 | `@sentry/core` 9.47.1 `client.js`, `utils/vercelWaitUntil.js` |
| Replay 오류 표본율은 환경변수 `NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE`(없으면 1.0)로 정한다. Production 의 실제 값은 세션 0, 오류 0 이다 | `instrumentation-client.ts` 10~11. 2026-10-02 Production 클라이언트 번들(`tracesSampleRate` 0.1, `replaysSessionSampleRate` 0, `replaysOnErrorSampleRate` 0) |
| Next 는 처리되지 않은 오류를 원본 그대로 서버 표준 출력에 찍고, `onRequestError` 에 `req.url`(쿼리 포함)을 `path` 로 넘긴다 | Next 15.5.26 `server/route-modules/route-module.js` 의 `onRequestError`, `server/base-server.js` 의 `instrumentationOnRequestError`. envelope 테스트의 서버 출력에서 원본 메시지를 확인했다 |
| 운영 빌드는 `console.log`·`info`·`debug` 호출을 지운다. 운영의 서버 로그로 나가는 것은 `console.error`·`console.warn` 과 `logError` 다 | `next.config.js` 의 `compiler.removeConsole`, 로컬 운영 빌드의 산출물, Production 런타임 로그 24시간의 수준 분포(`warn` 205, `error` 171, `info` 0) — §2.2 |
| 라우트 핸들러의 오류는 SDK 의 라우트 래퍼가 잡는다. 그 이벤트에는 `contexts.nextjs` 가 없다 | 2026-10-02 envelope 테스트(처리되지 않은 예외 6건) |
| SDK 는 401·404·3xx 응답의 transaction 을 버린다 | 같은 테스트: 표본 1 에서 웹훅(401) transaction 0건 |
| transaction 에도 breadcrumb 이 실리고, transaction 이름에 쿼리가 실리는 경우가 있다 | 같은 테스트의 수정 전 실패 목록(§5.1) |
| PR 1 의 변경 뒤 서버·edge 의 오류 이벤트, transaction, span, breadcrumb 에 요청의 쿠키·헤더·IP·쿼리가 없다 | 같은 테스트: 수정 전 실패 70건 → 수정 뒤 0건, 건수 동일 |
| 보통 빌드에는 테스트용 라우트가 없다 | `npm run build` 의 postbuild 검사(`[test-routes] 통과`) |
| Next 15.5 는 확장자가 두 겹인 edge 라우트를 빌드하지 못한다 | `route.envtest.ts` + `pageExtensions` 로 만든 빌드가 `route_client-reference-manifest.js` 없음으로 실패 |
| 핸들러가 기록을 남기고 바로 응답해도 SDK 가 핸들러 끝에 건 flush 가 그 이벤트의 전송을 기다린다. `await import` 로 인한 틈은 없다 | 2026-10-06 전달 시나리오(실제 `next start`, 서버의 첫 요청 포함): flush 가 전송 완료 뒤 0~2ms 에 끝난다. 실측 범위는 route handler 의 `Promise.resolve().then(require)` 경로다. 별도 청크의 첫 import 는 실측하지 않았고, 그 로더가 동기 `require` 인 것은 코드로만 확인했다. `@sentry/core` 9.47.1 `client.js`: `captureException` 이 `_numProcessing` 을 즉시 올리고(138~159, 775~787) `flush` 는 그 수를 1ms 타이머로 처음 본다(541~559) |
| 경계 함수의 `after` 콜백 안의 flush 가 로컬 `next start` 에서 응답 뒤에 끝까지 돈다 | 같은 시나리오: 수집기가 2600ms 뒤에 답할 때 `[sentry] flush timeout` 이 경계가 오류를 기록한 요청마다 한 줄 |
| `after()` 는 요청 범위 밖에서 던진다. DSN 이 없으면 `Sentry.init` 을 부르지 않고 그때 `Sentry.flush()` 는 `false` 다 | Next 15.5.26 `server/after/after.js`, `sentry.server.config.js`, `@sentry/core` 9.47.1 `exports.js` 의 `flush` |
| 오류를 그대로 넘기면 이름이 예외의 `type` 과 span 의 `error.type` 으로, `cause` 가 이어진 예외로 나간다 | 2026-10-06 envelope 테스트의 수정 전 실패 20건(§5.1) |
| 경계 함수가 잡은 예외의 이벤트는 프레임이 경계 함수가 든 공용 청크의 것뿐이다 | 같은 테스트의 이벤트(최상위 프레임이 라우트의 청크가 아니다) |
| 함수 이름은 요청 값에서 올 수 있고 줄바꿈으로 위치처럼 생긴 stack 줄도 만들 수 있다 | PR #121 교차 리뷰와 `log-safe-error.test.ts` 의 computed 메서드·동적 클래스·줄바꿈 반례. 위치만으로 만든 stack 에서는 노출되지 않는다 |
| `cause` getter 가 던지거나 순환하는 오류를 `unstable_rethrow` 에 바로 넘기면 경계가 뚫릴 수 있다 | `with-safe-errors.test.ts` 의 악성 입력 6건, 실제 서버 `boundary-hostile` 수정 전 실패 4건 → 수정 뒤 0건 |
| 취소된 Proxy 는 `Array.isArray` 에서 던지고, Symbol·비열거 키는 `Object.keys` 에 잡히지 않는다 | `log-safe-error.test.ts` 의 취소된 Proxy 3건, 대체 기록 1건, Symbol·비열거 키 1건 |

남은 가정

| 가정 | 확인 방법 |
|---|---|
| 브라우저 이벤트와 Replay 에 OAuth 쿼리가 실제로 실린다 | 브라우저 envelope 테스트(§4.6). 아직 재지 않았다 |
| `after()` 안의 flush 가 Vercel 에서 응답 뒤에 실제로 끝까지 돈다 | PR 3 배포 뒤(경계로 감싼 운영 라우트가 처음 생긴다) Vercel 로그에서 `[sentry] flush timeout` 유무와 Sentry 도착을 대조한다. 로컬 `next start` 에서는 끝까지 돈다(위 표) |
| 가린 기록의 이벤트가 Sentry 에서 사건 코드별 이슈로 갈린다(fingerprint) | PR 3 배포 뒤 Sentry 의 이슈 목록 |
| Sentry 프로젝트의 Data Scrubber 가 켜져 있다 | Sentry 설정 화면(Security & Privacy) |
| Vercel 의 route handler 가 모두 SDK 래퍼로 감싸인다 | 빌드 결과에서 래퍼 적용 여부 확인 |
| 외부 응답(PayPal, Google, Kakao)의 오류 본문에 개인정보가 들어올 수 있다 | sandbox 응답 수집 |

## 9. 결정 사항

2026-10-02 에 사용자가 정했다. 마지막 열이 결과다.

| # | 질문 | 권장 | 언제까지 | 결정 |
|---|---|---|---|---|
| 1 | 접근법은 C(수집과 호출을 좁히고 envelope 테스트로 지킨다)로 가도 되는가 | C | PR 1 전 | **C 로 확정** |
| 2 | 사용자 UUID·결제 ID·주문 ID 는 로그에 남기는가. 이메일·이름·전화번호·IP 는 남기지 않는가 | UUID 와 ID 는 남기고 나머지는 남기지 않는다 | PR 2 전 | **권장대로 확정** |
| 3 | `logSafeError` 가 원본 오류의 `message`·`stack` 을 싣는가. 처리되지 않은 예외의 메시지는 어떻게 하나 | 싣지 않는다. 사건 코드, 알려진 오류 이름, 호출 지점의 stack 만 남긴다(§4.2). 처리되지 않은 예외는 메시지를 남기되 값 모양 규칙을 적용한다(§4.7) | PR 1 전(§4.7), PR 2 전(§4.2) | **권장대로 확정** |
| 4 | 브라우저 단계(PR 5)를 이 설계에 이어서 바로 할 것인가 | 한다. PR 1~4 와 따로 리뷰한다 | PR 5 전 | 미정(PR 5 전에 정한다) |
| 5 | Sentry 의 Data Scrubber 설정을 확인하고, 이미 들어간 서버 이벤트(쿠키가 실렸을 수 있다)를 지울 것인가 | 설정을 확인하고 켠다. 과거 이벤트는 보존 기간과 건수를 본 뒤 정한다 | 지금 | **사용자가 직접 확인한다.** 결과는 아직 받지 못했다 |
| 6 | §4.5 의 값 모양 가드를 넣는가 | 넣는다. 정제가 아니라 경보로 | PR 1 전 | **넣는다** |
| 7 | 브라우저 단계가 끝날 때까지 Replay 를 어떻게 둘 것인가 | 꺼 둔다 | 지금 | **"내린다"로 정했고, 확인해 보니 이미 내려가 있다.** 질문의 전제("지금 오류 세션 표본율 1.0")가 틀렸다. Production 번들의 값은 세션 0, 오류 0 이다(§4.6). 환경변수를 바꾸지 않았고 재배포도 하지 않았다. 남는 규칙은 "브라우저 단계가 끝나기 전에 이 값을 올리지 않는다"다 |
| 8 | 결제·인증 라우트 밖에서 난 처리되지 않은 예외는 원본 메시지를 Vercel 로그와 Sentry 에 남기는 것을 받아들이는가(Sentry 쪽은 값 모양 규칙만 적용). 받아들이지 않으면 모든 route handler 와 페이지에 경계가 필요하다 | 받아들인다. 결제·인증 라우트만 경계로 막는다(§4.7) | PR 1 전 | **받아들인다** |

결정과 별개로 알릴 것: §2.1 은 지금 Production 에서 일어나고 있는 일이다. PR 1 과 PR 1b 는 위 결정으로 시작할 수 있게 됐다.

## 10. 초안 1 에서 달라진 것

초안 1 을 Codex(`gpt-6-sol`, high, 읽기 전용)가 리뷰해 REQUEST_CHANGES 로 돌려보냈다. 지적 일곱 건과 처리다. SDK 소스 인용은 다시 열어 확인했다.

| 심각도 | 지적 | 처리 |
|---|---|---|
| blocker | 누출 테스트가 실측에서 쿼리가 나온 transaction 경로를 검사하지 않는다. 핸들러를 직접 부르면 Next 의 계측을 건너뛴다. 표본이 10% 다 | §5.1 을 실제 Next 서버 요청으로 바꾸고 표본 강제와 종류별 수신 건수 단언을 넣었다 |
| blocker | "허용 필드 밖의 값은 실을 방법이 없다"는 성립하지 않는다. `message`·`errorCode`·`step` 은 임의 문자열이고 로거가 오류의 `message`·`stack` 을 복사한다 | §4.2 를 런타임 계약으로 바꿨다(닫힌 사건 코드, 형식 검증, 오류는 `name` 과 프레임만, 두 target 모두 가린 기록만) |
| blocker | 정적 import 는 전송 완료를 보장하지 않는다. flush 는 2초 뒤 `false` 를 줄 수 있고 요청 컨텍스트가 없으면 `waitUntil` 이 걸리지 않는다 | §4.3 을 "항상 남는 로그 한 줄 + 최선 노력의 Sentry 도착 + 보장하지 못하는 것"으로 다시 썼다. §5.2 에 제한 초과와 컨텍스트 없음 사례를 넣었다 |
| major | SDK 가 `url.query` 를 따로 만든다. 자식 span 이 실측에 없어 빠질 수 있다 | §4.1 에 "쿼리만 담는 값은 지운다" 규칙과 밖으로 부르는 요청의 span 을 넣었다. §5.1 이 자식 span 수신을 단언한다 |
| major | Replay 와 브라우저 URL 을 미뤄 둔 채 "어떤 sink 로도"를 성공 기준으로 썼다 | 목표를 서버·edge 로 한정하고 §4.6 과 브라우저 성공 기준, 결정 7(Replay 임시 조치)을 넣었다 |
| major | PR 1 의 범위가 결정 4 와 어긋나고, PR 1 뒤에도 남는 sink 가 적혀 있지 않다 | §6.1 표에 PR 별로 닫히는 sink 와 남는 것을 적었다. 바로 지울 수 있는 줄을 PR 1b 로 뺐다 |
| minor | 로그 레벨 순서의 근거가 반대다. 지금은 ERROR·FATAL 만 Sentry 로 간다 | §6.1 의 근거를 고쳤다 |

### 10.1 초안 2 에서 달라진 것

초안 2 의 재검증도 REQUEST_CHANGES 였다. 초안 1 의 지적 가운데 넷은 해소, 둘은 부분 해소, 하나는 미해소로 판정됐고 새 지적이 나왔다.

| 심각도 | 지적 | 처리 |
|---|---|---|
| blocker | 형식 검사는 비밀값을 가리지 못한다(`CANARY_BEARER_91c2` 가 `errorCode` 형식을 통과한다). `stack` 의 `at …` 줄에 URL 이 남는다 | §4.2: `errorCode` 와 오류 이름을 알려진 표에서 고르고 없으면 버린다. 원본 `stack` 을 쓰지 않고 호출 지점의 stack 을 쓴다. canary 를 이 입력들에 넣는 테스트를 §5.3 에 넣었다. ID 필드의 남는 위험을 §6.4 에 적었다 |
| blocker(신규) | `onRequestError` 경로가 안전 로거를 거치지 않는다. 원본 오류 메시지에 섞인 값을 URL 규칙이 처리하지 못한다 | §4.7 을 새로 썼다(메시지에 값 모양 규칙, `throw` 문 lint, envelope 테스트에 예외 요청). 한계를 §6.4 에 적었다 |
| major | `flush()` 의 성공은 transport 완료이지 Sentry 수신이 아니다. 로그마다 거는 flush 가 SDK 래퍼의 flush 와 겹쳐 무관한 경고를 낸다 | §4.3 과 §1.3 의 표현을 "transport 의 전송 완료"로 고쳤다. flush 는 요청당 한 번, 래퍼가 없는 경로에서만 건다. 경고의 뜻을 적었다 |
| (부분 해소) | Replay 임시 조치가 결정에만 있고 실행 단계가 없다 | §6.1 표에 0단계(환경변수 변경과 재배포)를 넣었다 |

### 10.2 초안 3 에서 달라진 것

초안 3 의 재검증도 REQUEST_CHANGES 였다. 2차 지적 가운데 셋(닫힌 목록과 원본 stack 제외, transport 완료의 뜻과 중복 flush, Replay 실행 단계)은 해소로 판정됐다.

| 심각도 | 지적 | 처리 |
|---|---|---|
| blocker | 처리되지 않은 예외에서 요청 쿼리가 `contexts.nextjs.request_path` 로 남는다 | §4.1 의 대상 목록에 넣었고 §5.1 이 그 필드를 단언한다 |
| blocker | 값 모양 치환은 불투명한 code·서명·API 키를 못 막는다. Next 가 원본 오류를 Production 로그에 찍으므로 `beforeSend` 로는 가릴 수 없다. 목표와 충돌한다 | §4.7: 결제·인증 라우트는 경계 함수로 오류를 잡아 원본이 전파되지 않게 한다. 그 밖의 경로는 목표의 예외로 두고 결정 8 로 올렸다 |
| major | route handler 에서 추가 flush 를 하지 않으면 제한 초과 로그를 만들 수 없다 | §4.3: 경계 함수가 오류를 기록한 요청에 한해 요청당 한 번 flush 를 걸어 결과를 본다. 성공 기준을 결제·인증 라우트로 한정했다 |
| major | 테스트용 라우트를 런타임 환경변수로 뺄 수 없다 | §4.7: 별도 테스트 빌드(`pageExtensions`)에만 넣고 운영 산출물에 없다는 검사를 둔다 |

### 10.3 초안 4 에서 달라진 것

초안 4 의 재검증은 blocker 둘을 해소(하나는 결정 8 을 조건으로)로 판정하고 major 둘을 남겼다. 둘 다 테스트 기준의 모순이다.

| 심각도 | 지적 | 처리 |
|---|---|---|
| major | §4.3 은 SDK 래퍼와 경계 함수가 각각 flush 를 부르게 했는데 §5.2 는 "요청당 한 번"을 단언한다 | flush 를 부르는 곳이 둘이라는 것과 이유를 §4.3 에 적고, §5.2 의 기대 횟수를 고쳤다(경계 함수 0 또는 1번, SDK 래퍼 1번) |
| major | 감싸지 않은 테스트 요청의 원본이 표준 출력에 남는 것을 허용해 놓고 표준 출력 전체에서 canary 를 찾으면 실패하게 했다 | §5.1 의 canary 를 두 묶음으로 나누고 무누출 검사와 허용 노출 검사를 분리했다 |

### 10.4 초안 5 뒤에 달라진 것 (사용자 결정, 2026-10-02)

리뷰가 아니라 사용자 결정과 사실 확인으로 바뀐 부분이다.

| 항목 | 바뀐 것 |
|---|---|
| §9 | 결정 1·2·3·6·8 을 권장대로 확정했다. 결정 5 는 사용자가 직접 확인한다. 결정 4 는 PR 5 전에 정한다 |
| 결정 7 과 §4.6 | "지금 Replay 오류 표본율이 1.0 이다"는 코드 기본값만 본 서술이었다. Production 에는 환경변수가 들어 있고 배포된 번들의 값은 세션 0, 오류 0 이다. 조치가 필요 없어 §6.1 의 0단계를 지웠다. 환경변수는 바꾸지 않았다 |
| §6.1 | 0단계가 빠져 순서는 1 → 1b → 2 → 3 → 4 → 5 다 |

### 10.5 PR 1·1b 를 구현하면서 달라진 것 (2026-10-02)

리뷰가 아니라 구현과 실측으로 바뀐 부분이다. 구현 계획은 `docs/superpowers/plans/2026-10-02-sentry-collection-and-sensitive-log-lines.md` 다.

| 항목 | 초안 | 실제 |
|---|---|---|
| §2.2 의 `console.log` 줄 | Vercel 로그로 나간다 | **운영에서는 나가지 않는다.** 운영 빌드가 `console.log` 를 지운다. 소스의 줄만 확인하고 빌드 산출물을 보지 않은 것이 원인이다. PR 1b 의 로그 줄 삭제는 운영의 출력을 바꾸지 않는다 |
| §2.1 의 웹훅 transaction | 표본에 잡히지 않았다 | SDK 가 401 응답의 transaction 을 버린다 |
| §4.7 의 `contexts.nextjs.request_path` | 처리되지 않은 예외의 이벤트에 있다 | 라우트 핸들러의 오류에는 없다(SDK 의 라우트 래퍼가 먼저 잡는다). 규칙은 그대로 두고, envelope 테스트는 "있으면 쿼리가 없다"로 본다 |
| §4.7 의 테스트용 라우트 | `pageExtensions` 로 가른다 | 원본을 `scripts/` 에 두고 테스트 빌드 동안만 `app/` 에 복사한다. 두 겹 확장자의 edge 라우트를 Next 가 빌드하지 못한다 |
| §4.1 의 URL 규칙 | 대상 필드를 나열 | 이벤트의 모든 문자열에 건다. `request` 는 `url`·`method` 만 남긴다 |
| §4.5 의 tripwire | 이벤트 문자열에서 JWT·Bearer 를 바꾸고 태그 | 같다. 예외 메시지도 세고, span 의 표식을 이벤트 태그로 올린다. envelope 테스트가 기대하지 않은 태그를 실패로 본다 |
| §5.1 의 canary | 두 묶음 | 세 묶음(C: `console.warn` 으로 찍는 값) |
| §5.1 의 요청 | 페이지, 웹훅, PayPal, OAuth 프록시, 테스트 요청 둘 | 페이지, 웹훅, 테스트 라우트 셋(처리된 오류, node 예외, edge 예외). 나머지는 PR 2~4 |

구현 중에 envelope 테스트가 잡은 결함 하나: 가리는 순회가 이벤트에 붙어 있는 SDK 내부 자료(`sdkProcessingMetadata.normalizedRequest`)까지 들어가 `Authorization` 헤더를 토큰으로 보고 태그를 붙였다. 그 객체는 같은 요청의 이벤트들이 공유하므로 먼저 처리된 이벤트만 태그가 붙었다. "기대하지 않은 tripwire" 검사가 이벤트 5건·transaction 13건으로 잡았고, 내부 자료를 건너뛰게 고쳤다(§4.1).

### 10.6 PR 1·1b 의 교차 리뷰에서 드러난 것 (2026-10-05)

Codex `gpt-6-sol`/high 의 읽기 전용 리뷰다. 설계에 영향을 주는 것만 적는다.

| 대상 | 지적 | 설계에 반영한 것 |
|---|---|---|
| PR 1 (#119) | envelope 헤더의 `trace`(DSC)는 `beforeSend` 뒤에 `sdkProcessingMetadata.dynamicSamplingContext` 에서 나간다. 들어온 baggage 의 `sentry-transaction` 이 DSC 가 되면 쿼리가 실릴 수 있다 | §4.1 의 대상에 DSC 를 더한다. 추적이 공유하는 원본은 두고 이벤트에 가린 사본을 둔다. 9.47.1 의 Next 서버는 span 안의 이벤트에서 DSC 를 자기 루트 span 으로 다시 만들어 envelope 테스트로는 재현되지 않았다. 활성 span 이 없을 때 scope 의 DSC 를 쓰는 경로의 방어다 |
| PR 1 (#119) | JWT 의 payload 가 `{}` 면 둘째 덩어리가 `e30`(3자)이다. 숫자 없는 Bearer 토큰도 있다 | §4.5 의 모양 규칙: JWT 세 덩어리 최소 길이 10·2·0, Bearer 는 16자 이상이면 토큰 |
| PR 1 (#119) | `callback?SECRET` 처럼 `/` 가 없는 값 | URL 이나 요청 이름 하나를 담는 키(`url`, `url.full`, `http.url`, `http.target`, `request_path`, `transaction`)는 `/` 없이도 첫 `?`·`#` 뒤를 버린다 |
| PR 1b (#118) | 리다이렉트가 실패하면 그 오류 메시지에 주소 전체(OAuth code 포함)가 들어가고, `logError` 가 `console.error` 로 찍는다(운영 빌드도 남긴다) | §4.2 의 근거가 하나 늘었다: 원본 오류의 `message` 에도 요청 값이 들어온다. PR 1b 는 그 한 곳만 오류 이름으로 바꿨고, 나머지 호출부는 PR 3·4 의 계약 함수가 맡는다 |

판정: PR 1(#119)은 1차 REQUEST_CHANGES(blocker 1, major 2, minor 1) → 재검증 REQUEST_CHANGES(DSC·상대 URL 부분 해소) → 두 번째 확인 **APPROVE**(`228c1e01`). PR 1b(#118)는 1차 REQUEST_CHANGES(major 1) → 재검증 **APPROVE**(`0f356c62`).

### 10.7 PR 2 를 준비하고 구현하면서 달라진 것 (2026-10-06)

리뷰가 아니라 측정과 구현으로 바뀐 부분이다. 구현 계획은 `docs/superpowers/plans/2026-10-06-log-safe-error-contract-and-boundary.md` 다.

| 항목 | 초안 | 실제 |
|---|---|---|
| §2.3·§4.3 의 "틈" | `await import` 때문에 이벤트가 flush 보다 늦게 큐에 들어갈 수 있다 | **없다.** §5.2 가 정한 대로 수정 전 코드로 먼저 쟀고 사례 1 이 실패하지 않았다. 순서가 구조로 정해져 있다(§4.3 의 2) |
| §4.3 의 2 `SentryLogTarget` | 정적 import 로 바꾼다 | 바꾸지 않는다 |
| §4.2 Sentry 이슈 묶음 | 언급 없음 | fingerprint 에 사건 코드를 더한다 |
| §4.2 `droppedFields` | 버린 필드의 이름 | 정해진 필드 이름과 `code`·`fields`·`other` 만 |
| §4.2 표의 초기값 | 전수 조사와 sandbox 응답 | 조사가 필요 없는 것만. 나머지는 PR 3·4 |
| §4.7 경계 함수 | 모든 오류를 잡는다 | Next 의 제어 흐름(`redirect()`·`notFound()`·동적 렌더링 신호)은 올려보낸다. SDK 가 초기화되지 않았으면 flush 하지 않는다 |
| §5.2 전달 테스트 | 실제 SDK 에 지연 transport | 실제 서버의 전달 시나리오와 CI 의 실제 SDK 테스트 둘 |
| 테스트 환경 | 언급 없음 | 서버 전용 코드는 `// @vitest-environment node` 로 시험한다. 공용 setup 의 `window` 사용부를 가드로 감쌌다 |

구현 중에 "실패를 먼저 본다"가 잡은 것 하나: 전달 시나리오의 수집기가 모든 envelope 에 늦게 답하면, `captureException` 앞에 5ms 지연을 넣은 실행에서 다섯 단계 가운데 넷만 실패했다(하나는 0ms 로 겹쳤다). SDK 가 flush 할 때 보내는 `client_report` 의 응답을 flush 가 기다려, 틈이 있어도 이벤트의 전송 완료와 몇 ms 차이로만 갈렸기 때문이다. 수집기가 오류 이벤트에만 늦게 답하게 하자 차이가 약 300ms 로 벌어졌고 같은 지연에서 일곱 건이 실패한다.


### 10.8 PR 2 의 교차 리뷰에서 드러난 것 (2026-10-06)

Codex `gpt-6-sol`/high 의 읽기 전용 리뷰다. 1차 판정은 **REQUEST_CHANGES**(blocker 1, major 2, minor 1). 수정 커밋은 `8025927b` 이다. 문서 반영 `db57eed3` 을 원 리뷰어가 재검증한 결과도 **REQUEST_CHANGES** 다. 아래 세 건은 해소됐고, 경계의 blocker 는 부분 해소다.

| 심각도 | 지적 | 설계에 반영한 것 |
|---|---|---|
| blocker | `unstable_rethrow` 가 `cause` 를 읽다가 난 예외를 그대로 올려보내거나 순환으로 안전한 기록을 막는다 | §4.7: 경계가 사슬을 직접 탐색하고 각 값 자체가 다시 던져질 때만 Next 신호로 취급한다. 실제 서버의 `boundary-hostile` 반례가 수정 전 실패 4건 → 수정 뒤 0건 |
| major | 취소된 `fields` Proxy 가 `Array.isArray` 에서 던져 기록이 사라진다 | §4.2: 객체 검사부터 예외를 잡고 기록 생성 실패에는 상수만 든 대체 기록을 남긴다 |
| major | 호출 지점의 stack 에 동적으로 붙은 함수 이름이 실린다 | §4.2: CallSite 에서 위치만 꺼내고 함수 이름은 제외한다. API 가 없으면 프레임을 싣지 않는다 |
| minor | Symbol·비열거 키가 `droppedFields` 에 반영되지 않는다 | §4.2: `Reflect.ownKeys` 로 정해지지 않은 키를 센다 |

재검증에 전달할 범위와 한계: 전달을 실측한 것은 route handler 번들이다. 별도 청크의 첫 동적 import 는 측정하지 않았다. 핸들러가 스트리밍 응답을 반환한 뒤의 오류도 경계가 잡지 못한다(§4.3). Production 의 `after()` 완료와 사건 코드별 이슈 묶음은 PR 3 배포 뒤 확인한다.


**원 리뷰어 재검증 결과.** `utils/with-safe-errors.ts:83` 의 `isNextControlFlow` 에 blocker 가 남았다. `cause` getter 가 원본 `Error` 자신을 던지면 `unstable_rethrow` 도 그 원본을 던지고, `thrown === value` 가 참이 되어 Next 신호로 오인한다. 취소된 Proxy·함수명 stack·Symbol 키는 해소 판정이다.

조정자도 현재 경계 소스를 메모리에서 CommonJS 로 변환해 설치된 Next 의 `unstable_rethrow` 와 함께 재현했다. Sentry·`after`·로그 target 은 네트워크나 출력을 만들지 않는 대역으로 교체했다. 결과는 `{"responseStatus":null,"safeLogCalls":0,"escapedOriginal":true}` 다. 이 재검증 시점에는 새 반례의 실제 Next 서버 재현과 수정을 아직 하지 않았다(후속 결과는 §10.9). 기존 누출 24건·전달 11단계와 전체 3,387건은 이 입력을 포함하지 않아 통과한다.

다음 수정의 요구사항: `cause` 재귀 중 던져진 값의 동일성으로 신호를 판별하지 않는다. 현재 값 자체가 실제 Next 신호인지 안전하게 판별하고 `cause` 탐색은 별도로 수행한다. 자기 자신을 던지는 getter 회귀 테스트와 실제 서버 누출 검증을 추가한 뒤 기존 Next 제어 흐름 보존을 다시 확인해야 한다. **APPROVE 가 아니므로 머지 승인 단계로 넘어가지 않았다.**


### 10.9 자기 자신을 던지는 입력의 경계 수정 (2026-10-06)

첫 수정(`5470d15b`)은 원본 대신 판정용 속성 세 개만 담은 새 객체를 실제 Next 판별 함수에 전달했다. 원본의 getter·Proxy 가 자기 자신을 던져도 신호로 오인하지 않는다. `cause` 탐색과 신호 판별을 분리하며, 기존 로그·flush 계약은 유지한다. 뒤이은 단락 평가 수정은 §10.10 에 기록한다.

추가 반례 8건은 수정 전 모두 경계 밖으로 나갔고, 수정 뒤 경계 테스트 51건 전부 통과했다. 실제 Next 빌드에서 자기 재투척 요청은 수정 전 일반 텍스트 500을 반환하고 원본 canary 를 출력한 뒤 프로세스가 종료 코드 7로 끝났다. 가린 이벤트는 0건이었다. 새 `boundary-self-throw` 라우트를 더하고 기존 getter 오류 라우트도 유지했다. 실서버 판정에는 경계 응답의 상태·고정 JSON·canary 부재를 추가했다.

타입 검사·lint 와 KST·UTC 전체 테스트(각 204파일, 3,417건 통과·6 expected fail·1 skipped)가 통과했다. 수정 후 새 빌드의 실서버 누출 요청 27건과 전달 요청 11건도 통과했다. 자기 재투척 오류의 가린 이벤트·로그가 각각 3건이며 경계 네 종류의 고정 응답도 각 3/3 일치했다. 원 리뷰어는 `5470d15b` 에서 자기 재투척 blocker 를 해소로 판정했지만, 정상 redirect 신호의 불필요한 속성을 읽어 500 으로 바꾸는 major 회귀를 지적했다. 최종 판정은 REQUEST_CHANGES 이며, Next 판정의 단락 평가를 보존하는 후속 수정이 필요하다. 상세 재현과 실행 기록은 PR 2 계획서의 후속 수정 절을 따른다.

### 10.10 Next 제어 흐름의 단락 평가 보존 (2026-10-06)

속성 세 개를 먼저 모으는 방식은 Next 가 이미 신호로 판정한 뒤의 속성까지 읽었다. message getter 가 던지는 실제 redirect 신호는 Next 에서는 전파되지만 경계에서는 500 이 됐다. 원 리뷰어가 major 로 지적했고 조정자도 재현했다.

§4.7 을 Next 의 판정 순서대로 필요한 속성만 대신 읽는 Proxy 로 바꿨다. 원본에서 난 읽기 예외는 내부 표식으로 바꿔 신호와 구분하고, 같은 속성을 반복해서 읽지 않는다. 현재 값이 신호가 아닐 때만 cause 를 탐색한다. 원본 오류를 판별 함수에 직접 넘기지 않는 누출 방어와 사슬의 깊이·순환 제한은 유지한다.

단위 테스트는 수정 전 29건 실패/68건 통과 → 수정 뒤 97건 전부 통과했다. 판정기·라우트 61건, 타입 검사·lint, KST·UTC 전체 테스트(각 204파일, 3,476건 통과·6 expected fail·1 skipped)도 통과했다. 새 테스트 라우트의 실제 서버 RED 는 리다이렉트 3건 모두 500, 불필요한 오류 이벤트 3건 등 5종의 실패를 확인했다. 새 빌드 GREEN 은 누출 요청 30건·전달 요청 11건 모두 통과했다. redirect 3건은 307·정확한 Location·빈 본문이며 오류 이벤트는 0건이었다. 기존 경계 응답과 canary 비노출도 유지했다. 원 리뷰어는 이 단락 평가 회귀를 해소로 판정했지만 §10.11 의 새 blocker 를 확인했다. 상세 실행 기록은 PR 2 계획서를 따른다.

### 10.11 원본 재투척과 상태가 바뀌는 getter 의 충돌 (2026-10-06)

`67ae0212` 의 재검토는 REQUEST_CHANGES(blocker 1건)다. `digest` getter 가 처음에만 유효한 redirect 문자열을 반환하면 경계는 신호로 보고 원본을 내보내지만, 뒤에서 다시 읽는 Sentry·Next 는 일반 오류로 볼 수 있다. 캐시를 제거해도 두 번까지만 유효한 값을 주는 반례가 남는다. 원 리뷰어와 조정자가 근거를 한 차례 교환해 캐시 제거만으로 충분하지 않음을 확인했다.

조정자는 실제 Next 검증 빌드의 테스트 fixture getter 만 바꿔 1회 요청했고, HTTP 500·빈 본문과 함께 서버 출력 및 Sentry envelope 에 canary 가 있는 것을 확인했다. 가린 이벤트는 0건이었다. 경계 구현·추적 소스는 유지했고 fixture 는 원복했다. 이는 실서버 누출 재현이며 새 수정의 검증 결과가 아니다. 자세한 방법과 메모리 비교 결과는 PR 2 계획서에 기록했다.

`67ae0212` 의 원본 재투척 구현은 §4.7 의 비노출 목표를 충족하지 못했다. 임의 getter·Proxy 까지 원본 동일성을 보장하면서 이후 재판정의 안정성을 보장할 수는 없다. 후속 권고는 제어 신호의 필요한 값만 검증해 새 신호/응답을 만들고 원본 객체를 전달하지 않는 방식이다. 정상 Next 동작·redirect 응답·쿠키·동적 신호를 검증해야 하며, 원본 message·stack·cause·임의 메타데이터의 복사는 허용하지 않는다. 사용자는 2026-10-06 "진행"으로 안전한 신호 정규화 계약을 승인했다. 구현·검증 및 독립 리뷰를 진행한다. 단위 3,476건과 envelope 30건·전달 11건의 녹색 결과를 이 새 blocker 의 해결로 해석하지 않는다.

### 10.12 안전한 새 신호 계약의 구현·검증 (2026-10-06)

§10.11 의 권고를 사용자가 승인해 §4.7 의 계약을 바꿨다. 원본 오류를 내보내지 않으면서 Next 가 필요한 제어 흐름 정보를 보존한다. 수정 전 단위 테스트는 경계 86건 실패/41건 통과, 판정기·라우트 72건 통과였다. 새 실제 서버 fixture 는 상태가 바뀌는 digest 를 1회·2회씩 읽는 사례를 각 3회 요청했다. 6건 모두 500 이고 Location·Set-Cookie 가 없었으며 서버 출력과 Sentry envelope 에 canary 가 남아 총 9종 실패했다. 전달 시나리오 11건은 통과했다. 실제 React postpone 과 Next 동적 메시지의 두 표식을 보존하는 테스트 4건도 수정 전에 실패했다. 구현은 원본을 경계 안에서만 판정하고 필요한 값으로 새 Error 를 만든다. 메시지·stack 은 정해 둔 값만, redirect 및 접근 fallback digest 는 필요한 값만 재구성한다. 동적 postpone 의 두 표식은 원본 속성을 더 읽지 않고 상수로 넣는다. 안전하게 만들 수 없으면 가린 로그·고정 500 으로 처리한다.

수정 후 관련 테스트 203/203, 타입 검사·lint, KST·UTC 각각 전체 204파일·3,521건 통과(6 expected fail·1 skipped)다. 새 빌드 실서버는 누출 요청 36건·전달 11건 모두 통과했다. 상태 변화 redirect 6건 모두 307·정확한 Location·빈 본문·요청 저장소의 Set-Cookie 를 보존하고 오류 이벤트 0건, stdout·envelope·응답의 canary 누출도 없다. 다른 신호 계열과 invalid Location 은 단위 테스트 검증 범위다. 코드 `df3129b5` 의 GitHub CI 도 통과했고 원 리뷰어 Codex `gpt-6-sol/high` 의 독립 코드 리뷰는 **APPROVE, 차단 지적 없음**이다. 리뷰어는 테스트를 재실행하지 않았고 코드·검증 결과를 읽었다. Orca 완료 통신은 샌드박스 EPERM 으로 차단되어 worker_done 수락을 주장하지 않는다. 최종 판정·턴 종료를 확인한 뒤 worker-abandon 정산을 수락받았으며 상세는 계획서에 기록했다. 운영 Vercel·Sentry 저장 결과는 미확인이고 머지·배포 전이다.
