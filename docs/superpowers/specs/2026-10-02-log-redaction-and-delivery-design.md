# 로그 민감정보 가리기와 오류 전달 보장 — 설계 (초안)

- 날짜: 2026-10-02
- 근거: 감사 계획 `docs/audit-2026-09-26/plan.md` U-22(STR-008), B-P4. 이슈 #73(Sentry 페이로드에 중앙 redaction 이 없다), #74(logError 가 Sentry 전달을 보장하지 않는다). 핸드오프 `docs/handoff-2026-10-02.html` §7 의 4순위
- 상태: **초안 2. 사용자 검토 전.** 초안 1 을 교차 리뷰(Codex gpt-6-sol/high)가 REQUEST_CHANGES 로 돌려보내 고쳤다(§10). §9 의 결정 일곱 개가 정해져야 구현 계획을 쓸 수 있다. 구현은 시작하지 않았다
- 기준: 코드 `9174da8d`(2026-10-02 Production), `@sentry/nextjs` 9.47.1, Next 15.5.26

용어

- **sink**: 값이 서버 프로세스 밖으로 나가 남는 곳. 이 문서가 다루는 sink 는 Sentry(이벤트·transaction·breadcrumb)와 Vercel 런타임 로그(`console.*` 출력), 그리고 HTTP 응답 본문이다.
- **high**: access·refresh·ID 토큰, OAuth code, client secret, 웹훅 서명과 시크릿, API 키, 쿠키, `Authorization` 헤더, 카드 정보, 요청 본문·헤더 통째.
- **medium**: 이메일, 전화번호, 이름, IP, 결제 ID·주문 ID, 사용자 UUID.
- **호출부**: `logError`·`console.*` 를 부르는 애플리케이션 코드.
- **자동 수집**: 호출부가 넘기지 않았는데 Sentry SDK 가 스스로 이벤트에 붙이는 데이터.

## 1. 목표와 성공 기준

### 1.1 목표

이 설계가 닫는 것은 **서버와 edge 에서 나가는 sink** 다. 브라우저에서 나가는 것(브라우저 이벤트의 URL, breadcrumb, Replay)은 방법이 달라 §4.6 의 별도 단계로 두고, 그때까지의 임시 조치를 §9 의 결정 7 로 올린다.

1. 결제·인증 요청을 서버가 처리하는 동안 high 값이 서버·edge 의 어떤 sink 로도 나가지 않게 한다.
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
| 결제·인증 라우트의 로그가 남기는 값이 §4.2 의 계약을 통과한 것뿐이다(고정된 사건 코드, 형식을 검증한 ID, 숫자) | 계약 함수의 단위 테스트, lint 규칙, 위 envelope 테스트와 서버 표준 출력 검사 |
| 결제·인증 라우트가 `console.*` 를 직접 부르지 않는다 | lint 규칙(경로 한정 `no-console`) |
| 오류가 나면 가린 로그 한 줄이 응답 전에 서버 표준 출력(Vercel 로그)에 남는다 | 통합 테스트(§5.2) |
| Vercel 요청 컨텍스트 안에서 transport 가 flush 제한(2초) 안에 끝나면 이벤트가 Sentry 에 도착한다. 제한을 넘기면 그 사실이 로그에 남는다 | 지연 transport 테스트(§5.2): 정상, 제한 초과, 요청 컨텍스트 없음 |
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
- transaction: `GET /ko/vote?code=…` 를 40번 보냈고 그 요청에서 transaction 11건이 잡혔다(`tracesSampleRate` 0.1). 웹훅 요청은 표본에 잡히지 않았다.

| 넣은 값 | 오류 이벤트(61건) | transaction(11건) |
|---|---|---|
| 쿠키 `sb-…-auth-token=…` | `request.cookies.*`, `request.headers.cookie` 에 원문 | 같음 |
| `Authorization: Bearer …` | `request.headers.authorization` 에 원문 | 같음 |
| 웹훅 서명 `x-portone-signature` | `request.headers.x-portone-signature` 에 원문 | 관측하지 못함(웹훅 요청이 표본에 없었다). 헤더 전체가 실리므로 같을 것으로 본다 |
| `X-Forwarded-For` 의 IP | `request.headers.x-forwarded-for` 에 원문 | 같음 |
| 쿼리 `?token=…`, `?code=…` | `request.query_string`, `request.url` | `contexts.trace.data.http.target` 11건 전부. `request.query_string`·`request.url`·`contexts.trace.data.next.span_name` 은 5건 |
| 요청 본문(결제 ID, 이메일) | 없음 | 없음 |

- **쿠키에는 Supabase 세션(access·refresh 토큰)이 들어 있다.** 로그인 사용자의 요청에서 서버 오류가 나거나 그 요청이 transaction 표본에 잡히면 세션 쿠키가 Sentry 로 나간다. Production 에도 서버 transaction 이 들어오고 있다(2026-10-02 Sentry 에서 `GET /[lang]/vote` 등 확인).
- 원인은 `requestDataIntegration` 의 기본값이다(`cookies`·`data`·`headers`·`query_string`·`url` 이 모두 `true`, `@sentry/core/build/cjs/integrations/requestdata.js`). `sendDefaultPii` 를 켜지 않아도 붙는다. `sendDefaultPii` 는 `ip` 필드만 가른다.
- 오류 이벤트의 breadcrumb 에는 `console` 범주가 들어 있다. `ConsoleLogTarget` 이 찍은 줄을 SDK 의 Console integration 이 다시 잡은 것이다(#73 의 실패한 접근 1 이 말한 우회로).
- edge 런타임은 `sendDefaultPii` 가 꺼져 있으면 `requestDataIntegration` 을 넣지 않는다(`@sentry/vercel-edge`). Console integration 은 들어간다.

**확인하지 못한 것.** Sentry 가 받은 뒤 무엇을 저장하는지는 보지 못했다. 프로젝트의 Data Scrubber 설정이 켜져 있으면 `authorization` 이나 이름에 `token` 이 든 키는 수신 단계에서 가려질 수 있다. 그래도 서명 헤더, `code` 쿼리, IP 는 기본 규칙에 걸리지 않는다. 이 설계는 "프로세스 밖으로 나가지 않는다"를 기준으로 삼고, Sentry 쪽 설정은 두 번째 방어선으로만 본다(§9 의 결정 5).

### 2.2 호출부가 넘기는 것

읽기 전용 조사(2026-10-02, 영역 다섯 개)의 결과다. 아래 줄은 직접 다시 열어 확인했다.

| 위치 | 무엇이 나가나 | sink | 등급 |
|---|---|---|---|
| `app/api/auth/v1/callback/route.ts` 14~15, 42 | 콜백 URL 전체와 쿼리 전부(`code` 포함), 리다이렉트 URL | Vercel 로그 | high |
| `app/api/payment/portone/callback/route.ts` 19~20, 37~39 | 콜백 URL 전체, 쿼리 전부, `token`·`pg_token` | Vercel 로그 | high |
| `app/api/payment/toss/result/route.ts` 25~36 | 같은 유형(URL 전체, 쿼리 전부, `token`·`pg_token`) | Vercel 로그 | high |
| `lib/supabase/social/callback-handler.ts` 59 | 콜백 파라미터 객체 통째(code, Apple 의 `id_token`·`user`). `NODE_ENV !== 'production'` 일 때만 찍힌다(`lib/supabase/social/service.ts` 25, 65) | 개발 환경의 콘솔 | high(운영에서는 꺼져 있다) |
| `app/api/payment/paypal/capture-order/route.ts` 115 | PayPal 캡처 응답 통째(payer 정보가 들어올 수 있다) | Sentry, Vercel 로그 | high |
| `app/api/payment/paypal/create-order/route.ts` 150 | PayPal 주문 생성 응답 통째 | Sentry, Vercel 로그 | medium~high |
| `app/api/auth/google/route.ts` 164, `kakao/route.ts` 82·111·192 | 공급자의 오류 응답 본문 통째 | Sentry, Vercel 로그 | medium |
| `app/api/auth/apple/route.ts` 46 | 정규화한 프로필(id, 이메일, 이름) | Vercel 로그 | medium |
| `app/api/payment/portone/webhook/route.ts` 105 | 웹훅 요청 본문 통째를 **HTTP 응답**으로 돌려준다(`receivedBody`) | 응답 본문 | high |

규모: `logError` 호출은 86건(`app/api` 65건). `app/api` 에서 `console.*` 를 직접 부르는 파일은 26개, 77건이다. 조사는 결제 경로에서 high 5건·medium 16건쯤, 인증 경로에서 high 5건·medium 15건 이상을 찾았다. 전체 목록은 구현 계획의 첫 단계에서 표로 다시 만든다(§4.2).

### 2.3 전달

- `logError` 는 `logger.error(...)` 의 Promise 를 기다리지 않는다(`utils/log-error.ts` 72). `SentryLogTarget.write` 는 `captureException` 앞에서 `await import('@sentry/nextjs')` 를 한다(`utils/logger-targets.ts` 75).
- SDK 는 route handler 를 감싸 끝에서 `vercelWaitUntil(flushSafelyWithTimeout())` 를 부른다(`@sentry/nextjs/build/cjs/common/wrapRouteHandlerWithSentry.js` 79, flush 제한 2초). 즉 **핸들러가 끝나기 전에 큐에 들어간 이벤트는 SDK 가 이미 내보낸다.**
- 남는 틈은 "핸들러가 끝난 뒤에 큐에 들어가는 이벤트"다. `logError` 가 동기로 돌아오고 `captureException` 은 `await import` 뒤에 불리므로, 그 순서가 SDK 의 flush 호출보다 늦을 수 있다. 실측에서 61건이 모두 도착한 것은 프로세스가 계속 살아 있는 로컬 서버라서다. serverless 의 동결 조건에서는 확인하지 못했다.

### 2.4 조사에서 나온 범위 밖의 것

- `app/api/user/profile/route.ts` 91·114·280: 요청마다 사용자 UUID 와 닉네임을 `console.log` 로 찍는다.
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
  1. **URL 을 담는 값은 `?` 와 `#` 뒤를 버린다.** 대상: `event.request.url`, transaction 이름, span 의 `description`, 속성 `http.target`·`http.url`·`url.full`·`url`·`next.span_name`.
  2. **쿼리만 담는 값은 지운다.** 대상: `event.request.query_string`, 속성 `url.query`·`http.query`·`url.fragment`·`http.fragment`. SDK 는 URL 전체와 별개로 `url.query` 를 만든다(`@sentry/core/build/cjs/utils/url.js` 144~159).
- 이 규칙은 서버가 밖으로 부르는 요청의 span(`http.client`)에도 적용된다. Supabase REST 주소의 쿼리에는 필터 값(사용자 UUID 등)이 들어간다.
- 대상 목록은 추측으로 닫지 않는다. envelope 테스트가 canary 를 넣은 쿼리로 실제 자식 span 까지 받아 남은 경로를 찾는다(§5.1). SDK 를 올리면 같은 테스트를 다시 돌린다.
- 지금의 `beforeSend`(개발용 오류와 API 404 걸러내기)는 그대로 둔다.

`sentry.edge.config.js`

- `Console` 을 뺀다. `requestDataIntegration` 은 지금도 들어가지 않는다는 것을 테스트로 고정한다. URL·쿼리 규칙은 서버와 같은 함수를 쓴다.

`instrumentation-client.ts`

- PR 1~4 에서는 바꾸지 않는다. 브라우저는 §4.6 이다.

### 4.2 호출부: 계약을 통과한 값만 남긴다

초안 1 은 "허용 필드만 받는 타입"으로 충분하다고 봤다. 리뷰가 지적한 대로 타입만으로는 부족하다. `message`·`errorCode`·`step` 은 임의의 문자열이 될 수 있고, `error` 는 무엇이든 될 수 있으며, 지금 로거는 오류의 `message` 와 `stack` 을 콘솔과 Sentry 에 그대로 복사한다(`utils/logger.ts` 83~92, `utils/logger-targets.ts` 20~27·64~92). 그래서 **타입이 아니라 런타임 계약**으로 정한다.

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
  errorCode?: string;   // [A-Za-z0-9_.:-]{1,64} 만. 외부 응답의 코드 필드
  amount?: number;      // 유한한 수만
  currency?: string;    // [A-Z]{3} 만
};

export function logSafeError(code: LogEventCode, error: unknown, fields?: SafeLogFields): void;
```

- 함수는 넘겨받은 값을 그대로 쓰지 않고 **가린 기록을 새로 만든다.** 형식에 맞지 않는 필드는 버리고 버린 필드의 이름만 `droppedFields` 에 남긴다. 값은 남기지 않는다.
- `error` 에서 쓰는 것은 두 가지뿐이다: 식별자 형식을 통과한 `name`, 그리고 `stack` 에서 `at …` 으로 시작하는 프레임 줄. 첫 줄(`Error: <message>`)과 `message`, `cause`, 그 밖의 속성은 쓰지 않는다. 외부 오류의 메시지에는 값이 섞인다(#76: `PostgrestError.details` 의 `Key (email)=(…)`).
- **Console 과 Sentry 두 target 모두 이 가린 기록만 받는다.** 한쪽만 가리면 다른 쪽이 우회로가 된다(#73 의 실패한 접근 1).
- 결제·인증 경로(`app/api/payment/**`, `app/api/auth/**`, `lib/supabase/social/**`, `lib/payment/**`)에서는 `logError` 와 `console.*` 를 lint 로 금지한다.
- 구현 계획의 첫 단계는 이 경로의 로그 호출 전수 조사 표다: 파일, 줄, 지금 넘기는 값, 붙일 사건 코드, 남길 필드. #73 의 요구 1(실제 키 전수 조사)과 #76 의 요구 1(실행으로 확인한 표)에 해당한다. 외부 응답에 무엇이 들어오는지는 sandbox 응답으로 확인하고, sandbox 가 없으면 "통째로 버리고 상태 코드만 남긴다"를 기본으로 한다.
- §2.2 의 `console.log` 가운데 URL·쿼리·토큰을 찍는 줄은 지운다. 남길 정보가 없다. 이 삭제는 계약을 기다리지 않고 먼저 할 수 있다(§6.1 의 PR 1b).
- §9 의 결정 3(외부 오류의 `message`·`stack`)은 호출부를 옮기기 전에 정해져야 한다.

### 4.3 전달: 무엇을 보장하고 무엇을 보장하지 못하나

초안 1 은 "정적 import 로 바꾸면 전달이 보장된다"고 썼다. 틀린 표현이다. 정적 import 는 이벤트가 큐에 들어가는 시점을 앞당길 뿐이다. SDK 의 flush 는 2초가 지나면 `false` 를 돌려주고 래퍼는 그 결과를 버린다(`responseEnd.js` 9~16, `client.js` 의 `flush`). `vercelWaitUntil` 은 Vercel 요청 컨텍스트가 없으면 아무것도 등록하지 않는다(`vercelWaitUntil.js`). 그래서 보장을 둘로 나눈다.

1. **항상 보장하는 것: 가린 로그 한 줄.** `logSafeError` 는 Console target 에 동기로 쓴다. 응답이 나가기 전에 서버 표준 출력에 남으므로 Vercel 런타임 로그에서 찾을 수 있다(보존 약 하루). Sentry 전달이 실패해도 오류가 흔적 없이 사라지지는 않는다.
2. **최선 노력: Sentry 도착.** Vercel 요청 컨텍스트 안에서 transport 가 flush 제한(2초) 안에 끝나면 도착한다.
   - `SentryLogTarget` 이 `@sentry/nextjs` 를 정적으로 import 하고 `captureException` 을 `write` 의 동기 구간에서 부른다. `await import` 를 없앤다. `captureException` 뒤의 event processor 는 비동기이므로 "큐에 들어갔다"와 "전송됐다"는 다르다.
   - SDK 의 route handler 래퍼가 끝에서 flush 를 `waitUntil` 에 건다(§2.3). 여기에 기대되, 우리 쪽에서도 `after(async () => { const ok = await Sentry.flush(2000); if (!ok) console.warn('[sentry] flush timeout'); })` 를 건다. 제한을 넘긴 사실이 Vercel 로그에 남는다. `after` 는 Next 15.5 의 안정 API 이고 route handler, server action, middleware 에서 쓸 수 있다.
   - `log-error.ts` 는 브라우저 번들에도 들어간다. `after` 는 서버 전용 파일에서만 부른다(런타임 분기가 아니라 파일 분리).
3. **보장하지 못하는 것.** flush 제한 안에 Sentry 가 응답하지 않는 경우, Vercel 요청 컨텍스트 밖(빌드 중 프리렌더, 로컬 스크립트)에서 난 오류의 전송 완료. 이 경우의 기록은 1번의 로그 한 줄이다.

`waitUntil` 에 로거의 Promise 만 거는 방식(#74 에서 철회)은 쓰지 않는다. `logError` 의 동기 시그니처는 그대로 둔다.

### 4.4 응답 본문

`app/api/payment/portone/webhook/route.ts` 105 의 `receivedBody` 를 지운다. 400 응답은 `{ error: 'Missing paymentId' }` 만 준다. 결제 계약 테스트(#88)가 이 응답 모양을 고정하고 있으면 테스트를 같이 고친다.

### 4.5 마지막 가드

운영에서 값 모양으로만 보는 가드를 `beforeSend`·`beforeSendTransaction` 끝에 둔다: JWT 모양(`eyJ…\.…\.…`)과 `Bearer ` 뒤의 토큰이 이벤트 문자열에 있으면 그 값을 고정 문자열로 바꾸고 태그 `redaction.tripwire=1` 을 붙인다. 정제 수단이 아니라 **경보**다. 이 태그가 달린 이벤트가 생기면 §4.1·§4.2 에 구멍이 있다는 뜻이다. 넣을지는 §9 의 결정 6 이다.

### 4.6 브라우저 (별도 단계)

브라우저에서는 "수집을 끈다"가 통하지 않는다. 주소 자체가 이벤트의 `request.url`, navigation breadcrumb, pageload transaction, Replay 에 들어간다. OAuth 콜백 페이지(`/auth/callback/{provider}?code=…`)가 대표적이다. 지금 클라이언트 설정은 오류가 난 세션의 Replay 표본율이 1.0 이다(`instrumentation-client.ts` 87~90, 317~321). `maskAllText` 로 화면의 글자는 가려지지만 URL 정책은 검증된 적이 없다(#73 의 5번).

- 방법은 서버와 같은 URL·쿼리 함수를 클라이언트의 `beforeSend`·`beforeSendTransaction`·`beforeSendSpan`·`beforeBreadcrumb` 와 Replay 의 `beforeAddRecordingEvent` 에 거는 것이다. 이것은 #73 이 경고한 "모든 이벤트 종류를 덮어야 한다"에 해당하므로, **브라우저 envelope 테스트가 먼저 있어야 한다**(Playwright 로 실제 페이지를 열고 DSN 을 로컬 수집기로 돌려 Replay 를 포함한 envelope 을 받는다).
- 이 단계 전까지 Replay 를 어떻게 둘지는 §9 의 결정 7 이다.
- 클라이언트의 서드파티 필터와 그 밖의 설정은 건드리지 않는다.

## 5. 테스트

### 5.1 envelope 테스트 (누출)

초안 1 은 핸들러를 직접 불러 검사한다고 썼다. 그러면 Next 의 계측(route handler 래퍼는 빌드 때 loader 가 끼워 넣는다, `routeHandlerWrapperTemplate.js`)을 건너뛰고, 오늘 실측에서 쿼리가 나온 transaction 경로를 검사하지 못한다. 그래서 **실제 Next 서버에 실제 요청을 보낸다.**

- 방법: Production 빌드를 `next start` 로 띄우고 `SENTRY_DSN` 을 로컬 수집기로 돌린다(§2.1 의 방법을 스크립트로 만든다: `npm run test:envelope`).
- 표본을 강제한다. `sentry.server.config.js` 가 `SENTRY_TRACES_SAMPLE_RATE` 가 있으면 그 값을 쓰게 하고(없으면 지금처럼 0.1), 테스트는 1 로 준다.
- 보내는 요청: 페이지 `GET /ko/vote?code=<canary>`(서버가 Supabase 를 불러 자식 span 이 생긴다), PortOne 웹훅(서명 실패), PayPal capture(인증 실패 경로), OAuth 콜백 프록시. 헤더·쿠키·쿼리·본문에 canary 를 넣는다.
- **수신 건수를 먼저 단언한다**: 오류 이벤트 N건, transaction N건, 자식 span 1건 이상(`http.client` 포함). 아무것도 받지 못한 테스트가 통과하는 일을 막는다.
- 그다음 envelope 전체(event, transaction, span, breadcrumb, attachment)와 서버 표준 출력에서 canary 를 찾는다. 하나라도 있으면 실패다.
- 오늘 실측한 표(§2.1)가 이 테스트의 첫 실패 목록이다. 수정 전에 실패하는 것을 먼저 본다.
- 빌드가 Supabase 조회에 의존하므로 이 테스트는 CI 에 넣지 못한다. PR 1~4 의 머지 전 필수 확인으로 두고 결과를 PR 본문에 적는다. Sentry SDK 를 올릴 때도 돌린다.
- 보조로, 옵션 객체를 검사하는 단위 테스트를 CI 에 둔다(`requestDataIntegration` 의 `include`, `Console` 제외, 훅 세 개가 같은 함수를 쓰는지, URL·쿼리 함수의 입력·출력 표). 이것만으로는 누출이 없다고 말할 수 없다.

### 5.2 전달 테스트

- 실제 SDK 에 전송 시간을 조절할 수 있는 transport 를 붙이고, SDK 의 route handler 래퍼를 포함해 호출한다.
- 사례 1(정상): 전송 300ms. 핸들러가 `logSafeError` 를 부르고 바로 응답한다. `waitUntil` 에 걸린 Promise 가 끝났을 때 전송이 완료돼 있다. 모듈 캐시가 빈 첫 호출에서도 그렇다. 응답 시각이 전송 완료보다 앞선다.
- 사례 2(제한 초과): 전송이 flush 제한보다 길다. `flush` 가 `false` 를 돌려주고, `[sentry] flush timeout` 줄과 가린 로그 한 줄이 표준 출력에 있다. 응답은 늦어지지 않는다.
- 사례 3(요청 컨텍스트 없음): `@vercel/request-context` 가 없는 환경. `vercelWaitUntil` 이 아무것도 걸지 않는다는 것과, 그때도 가린 로그 한 줄이 남는다는 것을 확인한다.
- 수정 전 코드(`await import`)에서 사례 1 이 실패하는지 먼저 본다. 실패하지 않으면 §2.3 의 "틈" 가설이 틀린 것이므로 §4.3 의 2번을 다시 쓴다.

### 5.3 그 밖

- 계약 함수의 단위 테스트: 형식에 맞지 않는 필드는 버려지고 이름만 `droppedFields` 에 남는다. 오류의 `message` 와 첫 줄은 기록에 없다. Console 과 Sentry 두 target 이 받은 기록이 같다. 입력·출력 표로 고정한다.
- lint 규칙 테스트: 결제·인증 경로의 `console.*` 와 `logError` 호출이 오류가 된다.
- 결제 계약 테스트 17건과 `it.fails` 6건은 그대로 통과해야 한다.
- fixture 테스트: 대표 오류 다섯 가지의 이벤트에 결제 ID·사용자 UUID·오류 코드가 남는다.

## 6. 배포와 운영

### 6.1 PR 구성과 순서

| PR | 내용 | 이 PR 로 닫히는 sink | 아직 남는 것 |
|---|---|---|---|
| 1 | envelope 테스트 스크립트, 서버·edge 설정의 수집 축소와 URL·쿼리 규칙(§4.1) | SDK 가 스스로 붙이던 쿠키·헤더·IP·쿼리(오류 이벤트, transaction, span), 서버의 console breadcrumb | 호출부가 넘기는 값, URL 을 찍는 `console.log`, 웹훅 응답 본문, 브라우저 |
| 1b | 바로 지울 수 있는 줄: URL·쿼리·토큰을 찍는 `console.log`(`auth/v1/callback`, `payment/portone/callback`, `payment/toss/result`), 웹훅 응답의 `receivedBody`(§4.4) | OAuth code 와 결제 토큰의 Vercel 로그 출력, 웹훅 본문 에코 | 호출부가 넘기는 값(PayPal 응답 통째 등), 브라우저 |
| 2 | 가린 기록을 만드는 계약 함수(§4.2)와 전달(§4.3), 전달 테스트 | (호출부를 옮길 준비) | 위와 같음 |
| 3 | 인증 경로의 호출부를 계약 함수로 옮기고 lint 규칙을 켠다 | 인증 경로의 호출부 값(Sentry, Vercel 로그) | 결제 경로의 호출부 값, 브라우저 |
| 4 | 결제 경로의 호출부 | 결제 경로의 호출부 값 | 브라우저 |
| 5 | 브라우저(§4.6): 브라우저 envelope 테스트, 클라이언트 훅과 Replay | 브라우저 이벤트·breadcrumb·Replay 의 URL 쿼리 | QNA·프로필 API 등 2단계 |

- 모든 PR 은 고위험(개인정보·인증·결제)으로 분류해 다른 공급자의 교차 리뷰를 받는다.
- PR 1 은 §9 의 결정 1·6 이, PR 1b 는 결정 1 이 정해지면 시작할 수 있다. 세션 쿠키와 OAuth code 가 나가는 것을 막는 변경이라 가장 급하다.
- PR 4 는 결제 결함 수정(B-P1~B-P3)과 같은 파일을 건드리므로 순서를 맞춘다.
- 로그 레벨 정책(#75·#76)은 PR 3·4 와 같은 호출부를 다시 고친다. PR 3·4 뒤에 하거나 같은 PR 에서 사건 코드별로 정한다. 지금 Sentry 로 가는 것은 ERROR·FATAL 뿐이다(`utils/logger-targets.ts` 59). 레벨 정책이 Sentry 로 가는 범위를 넓히는 쪽으로 바뀐다면 가리기가 먼저 끝나 있어야 한다.

### 6.2 머지 전후 확인

- Preview 배포가 없다. 머지 전 검증은 로컬 `next start` + 로컬 수집기다(§5.1 의 스크립트). 머지 뒤에는 Sentry 에서 새 릴리스의 서버 이벤트와 transaction 을 열어 `request` 에 헤더·쿠키·쿼리가 없는지 본다.
- 이미 Sentry 에 들어가 있는 과거 이벤트는 이 변경으로 지워지지 않는다. 보존 기간과 삭제 여부는 §9 의 결정 5 다.

### 6.3 롤백

Vercel Instant Rollback. 설정과 로그 줄만 바꾸므로 데이터에 남는 것이 없다.

### 6.4 리스크

| 리스크 | 완화 |
|---|---|
| 요청 헤더를 빼서 장애 분석 정보가 준다(User-Agent, Referer) | 필요한 헤더만 허용 목록으로 다시 넣는다. `utils/logger-utils.ts` 의 `SAFE_REQUEST_HEADERS` 가 이미 그 방식이다 |
| Console breadcrumb 을 빼서 오류 직전의 맥락이 준다 | 서버의 console 출력은 Vercel 로그에 있다. 요청 ID 로 잇는다 |
| `logSafeError` 의 필드가 부족해 호출부가 우회한다 | 필드 추가는 이 파일을 고치는 PR 로만 한다. lint 가 우회를 막는다 |
| URL 모양 속성을 하나 놓친다 | envelope 테스트가 canary 로 잡는다. 새 SDK 버전에서 속성이 늘어도 같은 테스트가 잡는다 |
| `SENTRY_TRACES_SAMPLE_RATE` 가 운영 환경변수로 잘못 들어가 표본이 바뀐다 | 0 과 1 사이의 수만 받고, 운영 환경변수 목록에 없음을 배포 확인 항목에 넣는다 |
| 정적 import 로 서버 번들이 달라진다 | `@sentry/nextjs` 는 `instrumentation.ts` 가 이미 서버에 올린다. 브라우저 번들에 `logger-targets.ts` 가 들어가는지 빌드로 확인한다 |

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

남은 가정

| 가정 | 확인 방법 |
|---|---|
| `await import` 때문에 이벤트가 flush 보다 늦게 큐에 들어갈 수 있다 | §5.2 의 사례 1 을 수정 전 코드로 돌린다 |
| 브라우저 이벤트와 Replay 에 OAuth 쿼리가 실제로 실린다 | 브라우저 envelope 테스트(§4.6). 아직 재지 않았다 |
| `after()` 안의 flush 가 Vercel 에서 응답 뒤에 실제로 끝까지 돈다 | PR 2 배포 뒤 Vercel 로그에서 `[sentry] flush timeout` 유무와 Sentry 도착을 대조한다 |
| Sentry 프로젝트의 Data Scrubber 가 켜져 있다 | Sentry 설정 화면(Security & Privacy) |
| Vercel 의 route handler 가 모두 SDK 래퍼로 감싸인다 | 빌드 결과에서 래퍼 적용 여부 확인 |
| 외부 응답(PayPal, Google, Kakao)의 오류 본문에 개인정보가 들어올 수 있다 | sandbox 응답 수집 |

## 9. 결정 사항 — 사용자 확인 필요

| # | 질문 | 권장 | 언제까지 |
|---|---|---|---|
| 1 | 접근법은 C(수집과 호출을 좁히고 envelope 테스트로 지킨다)로 가도 되는가 | C | PR 1 전 |
| 2 | 사용자 UUID·결제 ID·주문 ID 는 로그에 남기는가. 이메일·이름·전화번호·IP 는 남기지 않는가 | UUID 와 ID 는 남기고 나머지는 남기지 않는다 | PR 2 전 |
| 3 | 외부 오류의 `message` 를 싣는가 | 싣지 않는다. 사건 코드, 오류의 `name`, 우리 코드의 프레임만 남긴다(§4.2) | PR 2 전. 호출부를 옮기기 전에 반드시 |
| 4 | 브라우저 단계(PR 5)를 이 설계에 이어서 바로 할 것인가 | 한다. PR 1~4 와 따로 리뷰한다 | PR 5 전 |
| 5 | Sentry 의 Data Scrubber 설정을 확인하고, 이미 들어간 서버 이벤트(쿠키가 실렸을 수 있다)를 지울 것인가 | 설정을 확인하고 켠다. 과거 이벤트는 보존 기간과 건수를 본 뒤 정한다 | 지금 |
| 6 | §4.5 의 값 모양 가드를 넣는가 | 넣는다. 정제가 아니라 경보로 | PR 1 전 |
| 7 | 브라우저 단계가 끝날 때까지 Replay 를 어떻게 둘 것인가(지금 오류 세션 표본율 1.0) | Production 의 `replaysOnErrorSampleRate` 를 0 으로 내려 두고 PR 5 에서 검증한 뒤 다시 켠다 | 지금 |

결정과 별개로 알릴 것: §2.1 은 지금 Production 에서 일어나고 있는 일이다. PR 1 은 결정 1·6 이, PR 1b 는 결정 1 이 정해지면 시작할 수 있다.

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
