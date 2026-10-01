# 로그 민감정보 가리기와 오류 전달 보장 — 설계 (초안)

- 날짜: 2026-10-02
- 근거: 감사 계획 `docs/audit-2026-09-26/plan.md` U-22(STR-008), B-P4. 이슈 #73(Sentry 페이로드에 중앙 redaction 이 없다), #74(logError 가 Sentry 전달을 보장하지 않는다). 핸드오프 `docs/handoff-2026-10-02.html` §7 의 4순위
- 상태: **초안. 사용자 검토 전.** §9 의 결정 여섯 개가 정해져야 구현 계획을 쓸 수 있다. 구현은 시작하지 않았다
- 기준: 코드 `9174da8d`(2026-10-02 Production), `@sentry/nextjs` 9.47.1, Next 15.5.26

용어

- **sink**: 값이 서버 프로세스 밖으로 나가 남는 곳. 이 문서가 다루는 sink 는 Sentry(이벤트·transaction·breadcrumb)와 Vercel 런타임 로그(`console.*` 출력), 그리고 HTTP 응답 본문이다.
- **high**: access·refresh·ID 토큰, OAuth code, client secret, 웹훅 서명과 시크릿, API 키, 쿠키, `Authorization` 헤더, 카드 정보, 요청 본문·헤더 통째.
- **medium**: 이메일, 전화번호, 이름, IP, 결제 ID·주문 ID, 사용자 UUID.
- **호출부**: `logError`·`console.*` 를 부르는 애플리케이션 코드.
- **자동 수집**: 호출부가 넘기지 않았는데 Sentry SDK 가 스스로 이벤트에 붙이는 데이터.

## 1. 목표와 성공 기준

### 1.1 목표

1. 결제·인증 요청을 처리하는 동안 high 값이 어떤 sink 로도 나가지 않게 한다.
2. medium 값은 장애 분석에 필요한 것(사용자 UUID, 결제 ID, 주문 ID)만 이름이 정해진 필드로 남기고, 나머지(이메일, 이름, 전화번호, IP)는 남기지 않는다(§9 의 결정 2).
3. 서버의 오류 이벤트가 serverless 에서 응답 직후에 사라지지 않게 한다(#74).
4. 위 세 가지를 mock 이 아니라 SDK 가 실제로 만든 envelope 으로 검증한다(#73·#74 의 요구).

### 1.2 목표가 아닌 것

- 로그 레벨 정책(#75, #76). 어떤 오류를 `error` 로 보낼지는 다루지 않는다. 다만 순서 의존이 있어 §6.1 에 적는다.
- Session Replay 의 URL·사용자 데이터 정책(#73 의 5번). 별도 검토.
- 결제 결함 6건의 수정(B-P1~B-P3). 이 설계는 결제 로직을 바꾸지 않고 로그 줄만 바꾼다.
- 브라우저에서 실행되는 `console.*` 전체 정리. 서버 sink 로 이어지는 것만 다룬다.
- QNA·프로필 API 의 로그. 조사에서 같은 유형이 나왔지만(§2.4) 결제·인증 뒤의 2단계로 둔다.
- Sentry 클라이언트 설정의 서드파티 필터, 소스맵, 릴리스 설정(plan.md §6 의 7번). 건드리지 않는다.

### 1.3 성공 기준

| 기준 | 확인 방법 |
|---|---|
| 요청의 쿠키, `Authorization`, 웹훅 서명 헤더, 프록시 IP 헤더, 쿼리스트링이 오류 이벤트와 transaction 어디에도 없다 | envelope 통합 테스트(§5.1). canary 값을 넣은 요청을 실제 SDK 에 통과시키고 envelope 전체를 문자열로 검색한다 |
| 결제·인증 라우트의 로그 호출이 넘기는 값이 허용 필드 표(§4.2)에 있는 것뿐이다 | 타입(허용 필드만 받는 함수)과 lint 규칙, 호출부별 테스트 |
| 결제·인증 라우트가 `console.*` 를 직접 부르지 않는다 | lint 규칙(경로 한정 `no-console`) |
| 핸들러가 `logError` 를 부르고 바로 응답해도 이벤트가 transport 까지 간다 | 지연 transport 를 붙인 통합 테스트(§5.2). 첫 오류(모듈 캐시가 빈 상태)를 포함한다 |
| flush 가 응답을 늦추지 않는다 | 같은 테스트에서 응답 시각과 transport 완료 시각을 비교한다 |
| 가린 뒤에도 장애 분석이 된다 | 대표 오류 다섯 가지의 이벤트에 결제 ID·사용자 UUID·오류 코드가 남는지 fixture 로 확인한다 |

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
| B. 수집과 호출을 좁힌다 | SDK 가 요청 데이터와 console 을 **수집하지 않게** 끄고, 호출부는 **허용 필드만 받는 함수**로 로그를 남긴다. 값을 지우는 코드가 없다 | 키 이름을 추측하지 않는다. 이벤트 종류마다 훅을 덮을 필요가 줄어든다(수집 자체가 없다) |
| C. B + 탐지 | B 에 더해, envelope 통합 테스트가 canary 값을 찾으면 실패하게 한다. 운영에서는 값 모양(JWT, `Bearer `)만 보는 마지막 가드를 둔다 | #73 의 요구 4(실제 envelope 테스트)를 설계의 중심에 둔다 |

**C 를 권한다.** 이유는 세 가지다.

1. #73 이 남긴 교훈은 "지우는 방식은 빠뜨린 경로가 우회로가 된다"였다. 수집을 끄면 빠뜨릴 경로가 없어진다. 실측한 누출(§2.1)은 전부 자동 수집에서 나왔고 설정 몇 줄로 닫힌다.
2. 호출부의 값은 종류가 정해져 있다(결제 ID, 사용자 UUID, 상태 코드, 오류 코드). 받는 쪽을 타입으로 좁히면 "무엇을 지울까"가 아니라 "무엇을 남길까"만 정하면 된다.
3. 사람이 다시 `console.log(request.url)` 를 넣는 것은 설계로 막을 수 없다. lint 와 envelope 테스트가 막는다.

비용: 결제·인증 경로의 로그 호출 100여 곳을 고친다. 결제 코드에 손을 대지만 바뀌는 것은 로그 줄뿐이고, #88 의 계약 테스트 17건이 동작 불변을 지킨다.

## 4. 설계

### 4.1 자동 수집을 좁힌다

`sentry.server.config.js`

- `requestDataIntegration({ include: { cookies: false, headers: false, query_string: false, data: false, url: true } })` 를 명시한다. `url` 은 남기되 쿼리를 뗀다(아래).
- 기본 integration 에서 `Console` 을 뺀다(`integrations: (defaults) => […]`). 서버의 console 출력은 Vercel 로그에 이미 있고, breadcrumb 로 다시 실을 이유가 없다.
- `beforeSend` 와 `beforeSendTransaction` 에서 `event.request.url` 의 쿼리를 떼고 `event.request.query_string` 을 지운다. transaction 은 `contexts.trace.data` 의 `http.target`·`next.span_name` 등 URL 모양 속성의 쿼리를 뗀다. 자식 span 은 `beforeSendSpan` 에서 같은 처리를 한다.
  - 이것은 키 이름 추측이 아니다. "URL 에서 `?` 뒤를 버린다"는 구조 규칙이다. 어떤 속성이 URL 을 담는지는 envelope 테스트가 찾아 준다(§5.1).
- 지금의 `beforeSend`(개발용 오류와 API 404 걸러내기)는 그대로 둔다.

`sentry.edge.config.js`

- `Console` 을 뺀다. `requestDataIntegration` 은 지금도 들어가지 않는다는 것을 테스트로 고정한다.

`instrumentation-client.ts`

- 이 설계에서는 바꾸지 않는다. 브라우저 이벤트의 URL 쿼리(`/auth/callback?code=…`)는 §9 의 결정 4 에 따른다.

### 4.2 호출부: 허용 필드만 받는 함수

`utils/log-error.ts` 옆에 결제·인증용 함수를 둔다.

```ts
// 남길 수 있는 필드의 전부다. 여기에 없는 값은 로그에 실을 방법이 없다.
type SafeLogFields = {
  userId?: string;          // 사용자 UUID
  paymentId?: string;       // PortOne·PayPal 결제 ID
  orderId?: string;
  productId?: string;
  provider?: 'google' | 'kakao' | 'apple' | 'portone' | 'paypal' | 'toss';
  httpStatus?: number;      // 외부 응답의 상태 코드
  errorCode?: string;       // 외부 응답이나 DB 의 오류 코드(값이 아닌 코드)
  step?: string;            // 어디서 실패했는지 나타내는 고정 문자열
  amount?: number;
  currency?: string;
};

export function logSafeError(message: string, error: unknown, fields?: SafeLogFields): void;
```

- `message` 는 고정 문자열이다. 값을 끼워 넣지 않는다(lint 로 템플릿 리터럴을 막는다).
- `error` 는 `name` 과 고정된 분류만 쓴다. `error.message` 와 `stack` 을 그대로 실을지는 §9 의 결정 3 이다. 외부 응답 객체, `PostgrestError`, 요청 객체는 받지 않는다. 호출부가 `httpStatus`·`errorCode` 를 뽑아서 넘긴다.
- 결제·인증 경로(`app/api/payment/**`, `app/api/auth/**`, `lib/supabase/social/**`, `lib/payment/**`)에서는 `logError` 와 `console.*` 를 lint 로 금지하고 `logSafeError`·`logSafeInfo` 만 쓰게 한다.
- 구현 계획의 첫 단계는 이 경로의 로그 호출을 전수 조사한 표다: 파일, 줄, 지금 넘기는 값, 남길 필드. #73 의 요구 1(실제 키 전수 조사)과 #76 의 요구 1(실행으로 확인한 표)에 해당한다. 외부 응답에 무엇이 들어오는지는 sandbox 응답으로 확인하고, sandbox 가 없으면 "통째로 버린다"를 기본으로 한다.
- §2.2 의 `console.log` 가운데 URL·쿼리·토큰을 찍는 줄은 지운다. 남길 정보가 없다.

### 4.3 전달 보장

- `SentryLogTarget` 이 `@sentry/nextjs` 를 정적으로 import 하고 `captureException` 을 `write` 의 동기 구간에서 부른다. `await import` 를 없앤다. 그러면 `logError` 가 돌아오기 전에 이벤트가 SDK 큐에 들어가고, route handler 래퍼의 flush 가 그것을 내보낸다(§2.3).
- `logError` 의 동기 시그니처는 그대로 둔다. 호출부를 `await` 로 바꾸지 않는다.
- `waitUntil` 에 로거의 Promise 를 거는 방식(#74 에서 철회)은 쓰지 않는다.
- SDK 래퍼가 감싸지 않는 실행 경로가 있는지 확인한다: server action, `after()` 안, middleware. 있으면 그 경로에서만 `after(() => Sentry.flush(2000))` 를 쓴다(Next 15.5 의 `after` 는 안정 API 다).
- 이 절의 주장은 §5.2 의 테스트가 통과해야 사실이 된다. 통과하지 못하면 `after()` + `flush` 를 기본으로 바꾼다.

### 4.4 응답 본문

`app/api/payment/portone/webhook/route.ts` 105 의 `receivedBody` 를 지운다. 400 응답은 `{ error: 'Missing paymentId' }` 만 준다. 결제 계약 테스트(#88)가 이 응답 모양을 고정하고 있으면 테스트를 같이 고친다.

### 4.5 마지막 가드

운영에서 값 모양으로만 보는 가드를 `beforeSend`·`beforeSendTransaction` 끝에 둔다: JWT 모양(`eyJ…\.…\.…`)과 `Bearer ` 뒤의 토큰이 이벤트 문자열에 있으면 그 값을 고정 문자열로 바꾸고 태그 `redaction.tripwire=1` 을 붙인다. 정제 수단이 아니라 **경보**다. 이 태그가 달린 이벤트가 생기면 §4.1·§4.2 에 구멍이 있다는 뜻이다. 넣을지는 §9 의 결정 6 이다.

## 5. 테스트

### 5.1 envelope 통합 테스트 (누출)

- 실제 `@sentry/nextjs` 서버 SDK 를 테스트용 transport 로 초기화한다. 설정은 `sentry.server.config.js` 가 쓰는 옵션 객체를 그대로 가져온다(옵션을 함수로 뽑아 테스트와 공유한다).
- canary 를 헤더·쿠키·쿼리·본문·로그 필드에 넣은 요청으로 대표 핸들러를 부른다: PortOne 웹훅(서명 실패), PayPal capture(외부 응답 실패), OAuth 콜백 프록시, Google 토큰 교환 실패.
- 받은 envelope 전체(event, transaction, span, breadcrumb, attachment)를 문자열로 만들어 canary 를 찾는다. 하나라도 있으면 실패다.
- 오늘 실측한 표(§2.1)가 이 테스트의 첫 실패 목록이다. 수정 전에 실패하는 것을 먼저 본다.
- edge 설정도 같은 방식으로 확인한다.

### 5.2 지연 transport 테스트 (전달)

- 전송에 300ms 가 걸리는 transport 를 붙인다.
- 핸들러가 `logError` 를 부르고 바로 응답한다. SDK 의 route handler 래퍼를 포함해 호출한다.
- 확인: 래퍼가 등록한 `waitUntil` Promise 가 끝났을 때 전송이 완료돼 있다. 모듈 캐시가 빈 첫 호출에서도 그렇다. 응답 시각이 전송 완료보다 앞선다.
- 수정 전 코드(`await import`)에서 이 테스트가 실패하는지 먼저 본다. 실패하지 않으면 §2.3 의 "틈" 가설이 틀린 것이므로 §4.3 을 다시 쓴다.

### 5.3 그 밖

- `logSafeError` 의 타입 테스트: 허용 필드 밖의 키를 넘기면 컴파일이 실패한다.
- lint 규칙 테스트: 결제·인증 경로의 `console.log`, `logError`, 템플릿 리터럴 메시지.
- 결제 계약 테스트 17건과 `it.fails` 6건은 그대로 통과해야 한다.
- fixture 테스트: 대표 오류 다섯 가지의 이벤트에 결제 ID·사용자 UUID·오류 코드가 남는다.

## 6. 배포와 운영

### 6.1 PR 구성과 순서

| PR | 내용 | 위험 |
|---|---|---|
| 1 | envelope 테스트 하네스, `sentry.server.config.js`·`sentry.edge.config.js` 의 수집 축소(§4.1) | 고위험(개인정보). 결제·인증 코드를 건드리지 않는다. **§2.1 의 누출이 여기서 닫힌다** |
| 2 | 전달 보장(§4.3)과 지연 transport 테스트 | 고위험 |
| 3 | 인증 경로의 호출부(§4.2)와 lint 규칙 | 고위험(인증) |
| 4 | 결제 경로의 호출부, 웹훅 응답 본문(§4.4) | 고위험(결제). 결제 결함 수정(B-P1~B-P3)과 같은 파일을 건드리므로 순서를 맞춘다 |

- PR 1 은 다른 결정을 기다리지 않고 먼저 갈 수 있다. 세션 쿠키가 나가는 것을 막는 변경이라 가장 급하다.
- 모든 PR 은 다른 공급자의 교차 리뷰를 받는다.
- 로그 레벨 정책(#75·#76)은 이 네 PR 뒤에 한다. 레벨을 내려 Sentry 로 가는 이벤트가 늘기 전에 가리기가 끝나 있어야 한다.

### 6.2 머지 전후 확인

- Preview 배포가 없다. 머지 전 검증은 로컬 `next start` + 로컬 수집기다(§2.1 의 방법). 머지 뒤에는 Sentry 에서 새 릴리스의 서버 이벤트와 transaction 을 열어 `request` 에 헤더·쿠키·쿼리가 없는지 본다.
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
| 정적 import 로 서버 번들이 달라진다 | `@sentry/nextjs` 는 `instrumentation.ts` 가 이미 서버에 올린다. 브라우저 번들에 `logger-targets.ts` 가 들어가는지 빌드로 확인한다 |

## 7. 범위 밖·후속

- QNA·프로필 API 의 로그(§2.4), 그 밖의 `app/api` 의 `console.*`.
- 로그 레벨 정책(#75, #76).
- Replay 정책(#73 의 5번).
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
| `await import` 때문에 이벤트가 flush 보다 늦게 큐에 들어갈 수 있다 | §5.2 의 테스트를 수정 전 코드로 돌린다 |
| Sentry 프로젝트의 Data Scrubber 가 켜져 있다 | Sentry 설정 화면(Security & Privacy) |
| Vercel 의 route handler 가 모두 SDK 래퍼로 감싸인다 | 빌드 결과에서 래퍼 적용 여부 확인 |
| 외부 응답(PayPal, Google, Kakao)의 오류 본문에 개인정보가 들어올 수 있다 | sandbox 응답 수집 |

## 9. 결정 사항 — 사용자 확인 필요

| # | 질문 | 권장 |
|---|---|---|
| 1 | 접근법은 C(수집과 호출을 좁히고 envelope 테스트로 지킨다)로 가도 되는가 | C |
| 2 | 사용자 UUID·결제 ID·주문 ID 는 로그에 남기는가. 이메일·이름·전화번호·IP 는 남기지 않는가 | UUID 와 ID 는 남기고 나머지는 남기지 않는다 |
| 3 | 외부 오류의 `message`·`stack` 을 그대로 싣는가. `PostgrestError.details` 처럼 값이 섞이는 것이 확인돼 있다 | `name` 과 오류 코드만 싣는다. `stack` 은 우리 코드의 프레임만 남긴다 |
| 4 | 브라우저 이벤트의 URL 쿼리(`/auth/callback?code=…`)도 이번에 떼는가 | PR 1 에 포함한다. 클라이언트 설정의 다른 부분은 건드리지 않는다 |
| 5 | Sentry 의 Data Scrubber 설정을 확인하고, 이미 들어간 서버 이벤트(쿠키가 실렸을 수 있다)를 지울 것인가 | 설정을 확인하고 켠다. 과거 이벤트는 보존 기간과 건수를 본 뒤 정한다 |
| 6 | §4.5 의 값 모양 가드를 넣는가 | 넣는다. 정제가 아니라 경보로 |

결정과 별개로 알릴 것: §2.1 은 지금 Production 에서 일어나고 있는 일이다. PR 1 은 위 결정 1·4 만 정해지면 시작할 수 있다.
