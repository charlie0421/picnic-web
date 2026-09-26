# picnic-web 테스트·보안·의존성 위생 감사

- 감사일: 2026-09-26 (KST)
- 대상: `/Users/charlie.hyun/Repositories/picnic-web`
- 범위: 테스트 구조·실행 결과, API 인증/권한 및 입력 경계, 결제·업로드·이미지 프록시, npm 의존성
- 방식: 소스와 설정의 읽기 전용 정적 검토 및 비파괴 명령 실행
- 제외: `next build`는 `.next`를 덮어쓰므로 실행하지 않았다. 실제 PortOne/PayPal/S3/Supabase 운영 요청과 침투 테스트도 수행하지 않았다.

## 1. 결론 요약

Vitest는 **122개 파일, 2,074개 테스트가 모두 통과**했고 TypeScript와 ESLint도 오류 없이 끝났다. 그러나 현재 커버리지 대상은 선별된 유틸리티·컴포넌트에 집중되어 있으며, PortOne/PayPal 결제, 인증 콜백, 업로드·서명 URL, 이미지 프록시 같은 서버 신뢰 경계는 사실상 회귀 테스트 밖에 있다.

가장 시급한 문제는 다음과 같다.

1. PortOne 결제 금액과 지급량을 클라이언트 `customData`에서 받아 그대로 적립 RPC에 전달한다. 실제 상품 정보와 대조하지 않아, 웹훅이 정상화되면 임의의 캔디 적립으로 이어질 수 있다.
2. PortOne 웹훅 구현이 설치된 공식 v2 SDK의 원문 본문·표준 헤더·이벤트 봉투 규약과 맞지 않는다. 정상 웹훅은 거부되고, 자체 규약의 일부 상태는 서명 전에 성공 처리된다.
3. PayPal 주문 소유권을 확인하기 전에 캡처를 먼저 호출한다. 다른 사용자의 주문 ID를 안 사용자가 결제를 캡처시킨 뒤 API가 403을 반환하게 만들 수 있다.
4. 이미지 프록시는 임의의 `*.supabase.co` 테넌트가 반환하는 `text/html`도 Picnic 출처에서 그대로 제공하며, 응답 크기 제한 없이 전체를 메모리에 올린다.
5. 잠금 파일의 Next.js 15.5.23은 `npm audit`상 critical RCE 범위에 포함되고, 이 앱은 취약점 조건과 관련된 AVIF 이미지 최적화를 활성화했다. 15.5 계열 보안 패치로 즉시 올려야 한다.

> 판정 표기: **확정**은 현재 코드나 명령으로 직접 확인한 사실, **조건부**는 운영 프록시·RLS·외부 공급자 설정이 충족될 때 재현되는 문제, **추측**은 운영 설정을 확인할 수 없어 가능성만 남긴 항목이다. DB/RLS/RPC 변경 제안은 모두 **picnic-supabase 이관 필요**로 표시한다.

## 2. 실행 근거

| 명령 | 결과 | 비고 |
|---|---:|---|
| `node --version` | `v24.18.0` | `package.json`의 `24.x`와 일치 |
| `npm --version` | `11.16.0` | 감사 실행 환경 |
| `npx vitest run` | 종료 0 | **122 files passed, 2,074 tests passed, 0 failed**, 14.60초 |
| `npx tsc --noEmit --incremental false` | 종료 0 | 출력 없음 |
| `npm run lint` | 종료 0 | ESLint 오류·경고 0. 단, `next lint` 폐기 예정 경고 및 다중 lockfile로 인한 workspace root 추론 경고 발생 |
| `npm audit --json` | 종료 1 | 전체 32건: critical 2, high 6, moderate 24 |
| `npm audit --omit=dev --json` | 종료 1 | 운영 그래프 26건: critical 1, high 4, moderate 21 |
| `npm outdated --json` | 종료 1 | Next, React, Sentry, PayPal SDK, Supabase CLI, Tailwind, Vitest 등 메이저/패치 갭 확인 |
| `npm ls --depth=0` | 종료 0 | 현재 최상위 의존성 트리의 peer 오류 없음 |
| `npm config get legacy-peer-deps` | `false` | 현재 저장소에 `.npmrc`도 없음 |

`npx vitest run` 중 provider guard 테스트가 의도적으로 만든 오류 스택이 반복 출력됐지만 테스트 실패는 아니었다. 또한 `vitest.config.ts`를 CommonJS로 읽으면서 ESM 구문을 감지한 Vite native-loader 경고가 있었다.

커버리지 명령은 `coverage/`를 생성하므로 이번 읽기 전용 감사에서는 실행하지 않았다. 대신 커버리지 대상 설정과 테스트 파일 분포를 정적으로 확인했다.

## 3. 테스트 현황

### 3.1 `__tests__` 구조

| 영역 | 테스트 파일 수 | 관찰 |
|---|---:|---|
| `components` | 47 | UI·투표 컴포넌트 중심 |
| `lib` | 28 | 데이터 변환·클라이언트 로직 중심 |
| `utils` | 22 | 리다이렉트·날짜·재시도·이미지 유틸리티 포함 |
| `hooks` | 8 | 훅 단위 테스트 |
| `api` | 6 | 총 20개 테스트로 투표 submit/status와 wallet guard에 집중 |
| `contexts` | 4 | 컨텍스트·리듀서 |
| `anti-abuse` | 3 | 투표 남용 방지 보조 로직 |
| `stores` | 2 | 상태 저장소 |
| 기타 | 2 | Sentry 설정, instrumentation filter |

API 테스트 6개는 `vote-submit-balance-conflict`, `vote-submit-request-id`, `votes-admin-status-guard`, `wallet-history-admin-guard`, `wallet-history`, `wallet`이다. PortOne/PayPal route, `/api/auth/callback`, `/api/uploads/presign`, `/api/storage/signed-url`, `/api/proxy-image`, QNA 업로드를 직접 import하거나 호출하는 테스트는 검색되지 않았다.

### 3.2 테스트 발견사항

#### TEST-01 — 결제·인증·업로드 API가 커버리지 게이트 밖

- **심각도:** P1 높음
- **판정:** 확정
- **근거 파일:라인:** `vitest.config.ts:15-75`는 커버리지 대상을 일부 `utils`, `lib`, `hooks`, `stores`, `contexts`, `components`로만 제한한다. `app/api/**`가 없고, 임계값은 `vitest.config.ts:84-89`의 statements 80%, branches 70%, functions 80%, lines 80%다.
- **영향·재현 조건:** PortOne 웹훅 헤더나 PayPal 캡처 순서를 잘못 바꿔도 현재 커버리지 임계값은 영향을 받지 않는다. `rg -l 'portone|capture-order|auth/callback|uploads/presign|storage/signed-url|proxy-image' __tests__`로 route 직접 테스트가 없음을 재확인할 수 있다. 결제 회귀는 금전 손실 또는 적립 누락까지 배포 후에야 드러날 수 있다.
- **최소 수정 방향:** 아래 3.3의 route 단위 테스트를 먼저 추가하고 `app/api/payment/**`, `app/api/auth/callback/**`, `app/api/uploads/**`, `app/api/storage/**`, `app/api/proxy-image/**`를 커버리지 대상에 포함한다. 초기 임계값은 파일별 baseline으로 두고 점진적으로 올린다.
- **예상 작업량:** L
- **회귀 위험:** 낮음. 테스트 추가 자체는 낮지만, route를 테스트 가능하게 분리하는 과정에서 중간 수준의 구조 변경이 생길 수 있다.

#### TEST-02 — TypeScript 검사가 테스트 코드의 타입 드리프트를 놓침

- **심각도:** P2 중간
- **판정:** 확정
- **근거 파일:라인:** `tsconfig.json:44-50`이 테스트를 제외한다. `utils/auth-redirect-validators.ts:122`의 `normalizeRedirectPath`는 인자 1개인데 `__tests__/utils/auth-redirect-validators.test.ts:178,184`는 인자 2개로 호출한다.
- **영향·재현 조건:** Vitest는 변환만 수행해 2,074개가 통과하지만, 테스트의 함수 사용법이 실제 시그니처와 어긋나도 CI가 실패하지 않는다. 별도 test tsconfig로 해당 파일을 typecheck하면 extra argument 오류가 드러난다.
- **최소 수정 방향:** `tsconfig.test.json`을 만들고 Vitest 전용 global/stub을 포함한 `tsc -p tsconfig.test.json --noEmit`을 CI에 추가한다. 현재 두 호출을 실제 시그니처에 맞춘다.
- **예상 작업량:** S
- **회귀 위험:** 낮음. 기존에 잠복한 테스트 타입 오류가 여러 건 드러날 수 있다.

#### TEST-03 — 테스트 로그 노이즈와 설정 모듈 경고

- **심각도:** P3 낮음
- **판정:** 확정
- **근거 파일:라인:** `vitest.config.ts:1-3`은 ESM import를 쓰며 실행 때 CommonJS native-loader 경고가 발생했다. provider guard의 예상 오류 스택이 stderr에 반복됐다.
- **영향·재현 조건:** `npx vitest run`은 성공하지만 실제 예외가 긴 예상 로그 사이에 묻혀 CI 조사 시간이 늘어난다.
- **최소 수정 방향:** package/module 설정에 맞춰 Vitest 설정 확장자·로딩 방식을 정리하고, 예상 오류 테스트에서는 `console.error`/logger를 명시적으로 spy해 호출값을 검증한 뒤 복원한다.
- **예상 작업량:** S
- **회귀 위험:** 낮음

### 3.3 핵심 흐름에 추가할 테스트 케이스

아래 표의 “외부 호출 없음”은 Supabase Edge/RPC, PortOne, PayPal, S3 mock 호출 횟수 0까지 확인해야 한다는 뜻이다.

#### 투표

| 입력·전제 | 기대값 |
|---|---|
| 비로그인 `POST /api/vote/submit` + 정상 vote/item/amount | 401, 잔액·Edge Function 변경 0 |
| `amount`가 `0`, `-1`, `1.5`, 숫자 문자열, 허용 최댓값+1 | 각각 400, 외부 호출 없음 |
| JMA 상태 사용자 + 정상 투표 | 403, 차감·투표 0 |
| 다른 vote에 속한 `vote_item_id` | 400 또는 404로 계약 고정, 차감 0 |
| upcoming/ended vote에 submit | 403, 차감·집계 0 |
| 동일 `request_id`·동일 body를 응답 유실 후 재요청 | 최초와 같은 응답, 차감과 집계 정확히 1회 |
| 동일 `request_id`·다른 body | 409, 두 번째 변경 0 |
| 같은 `request_id`로 동시 2요청 | mutation 1회, 두 응답은 동일 결과 또는 하나 409로 계약 고정 |
| 비로그인 `GET /api/vote/<미공개 ID>/detail` | 404, 미공개 제목·후보·보상 필드 없음 |

#### PortOne

| 입력·전제 | 기대값 |
|---|---|
| 공식 이벤트 원문 + `webhook-id`, `webhook-timestamp`, `webhook-signature` | 200, provider 조회 1회, 적립 RPC 1회 |
| 서명 누락·변조·허용 시간 밖 timestamp·동일 webhook-id replay | 401, provider/RPC 호출 0 |
| 서명 없는 `READY` 이벤트 | 401. 현재의 200 동작을 회귀 테스트로 먼저 고정해 실패시키기 |
| `{type:'Transaction.Paid', data:{paymentId}}` 공식 봉투 | `data.paymentId`로 provider 조회 |
| 결제 1원/소액, `customData.starCandy=1000000000`이나 DB 상품 가격·지급량 불일치 | 400, 적립 RPC 0 |
| 정상 PAID + 서버 intent와 상품·금액·통화·사용자 모두 일치 | DB 기준 지급량만 정확히 1회 적립 |
| 같은 `paymentId` 웹훅 동시/반복 | 모두 멱등 응답, 적립 1회 |
| 탈퇴 사용자 | 403 또는 무적립 성공 응답으로 계약 고정, 적립 0 |
| RPC 일시 실패 후 provider 재시도 | 첫 응답 5xx, 재시도에서 정확히 1회 적립 |

#### PayPal

| 입력·전제 | 기대값 |
|---|---|
| 비로그인 create/capture | 401, PayPal 호출 0 |
| 존재하지 않는 product | 400, PayPal 주문 생성 0 |
| 사용자 A가 사용자 B의 미캡처 `orderID` 제출 | 403이 **캡처 호출 전에** 반환되고 PayPal capture 0 |
| PayPal 주문 금액·통화와 DB 상품 불일치 | 400, capture/RPC 0 |
| 동일 order 동시 capture 두 건 | 외부 capture/적립 각각 1회, 재요청은 멱등 응답 |
| PayPal 응답에 payer/shipping/payee PII 포함 | 허용 목록 외 PII가 DB insert payload·로그에 없음 |

#### 인증 콜백

| 입력·전제 | 기대값 |
|---|---|
| `next=/ko/vote?tab=live#rank` + 정상 code | 동일 내부 경로로 이동 |
| `next=https://evil.example`, `//evil.example`, `/\\evil.example`, percent-encoded separator | 모두 canonical origin의 `/`로 이동 |
| 비허용 Host/origin + code 실패 | canonical site의 오류 경로 또는 400; 요청 origin으로 이동하지 않음 |
| code exchange 실패에 공급자 내부 오류 문자열 포함 | 안전한 일반 오류 코드만 URL에 노출 |
| 탈퇴 사용자 | sign-out, 세션 쿠키 만료, locale 로그인 페이지 이동 |

#### 업로드·서명 URL·프록시

| 입력·전제 | 기대값 |
|---|---|
| 비로그인 presign 요청 | 401, S3 호출 0 |
| 미허용 MIME, 선언 크기 20MB 초과 | 415/413, presign 0 |
| `Content-Type:image/png`이지만 실제 HTML/실행 파일 | quarantine 후 형식 검증 실패, 공개 URL 없음 |
| 사용자별 용량·횟수 초과 | 429 또는 413, presign 0 |
| 다른 사용자 UUID prefix 또는 `media/private/known-object` signed URL 요청 | 403, signed URL 없음 |
| proxy가 비허용 host 또는 redirect를 통해 link-local/metadata IP로 이동 | 403, 후속 fetch 0 |
| upstream `text/html` 또는 SVG active content | 415, 본문 반사 없음 |
| upstream이 크기 상한 초과 또는 Content-Length 없음 상태로 무한 stream | 413/중단, 메모리 상한 유지 |
| 비로그인 대형 QNA multipart | 본문 파싱 전에 401 |
| QNA 파일 수·개별/합계 크기·실제 MIME 초과, 소유하지 않은 thread | 400/403/413/415, storage insert 0 |

## 4. 보안 발견사항

#### SEC-01 — PortOne 결제 금액·지급량을 클라이언트가 결정

- **심각도:** P0 치명
- **판정:** 확정된 신뢰 경계 결함. 실제 악용 가능성은 운영 웹훅 설정과 아래 SEC-02 정상화 여부에 조건부다.
- **근거 파일:라인:** `lib/payment/portone.ts:145-168`에서 클라이언트가 `totalAmount`, `productId`, `starCandy`, `bonusAmount`를 구성한다. `app/api/payment/portone/confirm/route.ts:18-55`는 양수 금액과 선택적인 userId만 확인한다. `app/api/payment/portone/webhook/route.ts:144-160,244-259`는 provider 결제를 다시 읽지만 `customData`의 지급량을 상품 원장과 대조하지 않고 service-role `process_portone_capture` RPC로 전달한다.
- **영향·재현 조건:** 인증 사용자가 유효한 자기 userId와 실제 productId를 쓰되, 낮은 결제 금액과 `starCandy:1000000000`, `bonusAmount:1000000000`을 넣어 결제를 완료한다. `POST /api/payment/portone/confirm` body가 `{"paymentId":"<paid-id>","totalAmount":1}`처럼 양수이면 확인을 통과할 수 있고, 정상 PAID 웹훅이 처리되면 조작한 지급량이 RPC로 전달된다. 금액 1이 provider 최솟값에 걸리면 provider가 허용하는 최저 금액으로 동일하게 재현된다.
- **최소 수정 방향:** 서버가 payment intent를 만들고 user/product/가격/통화/지급량을 서버 저장소에 고정한다. confirm/webhook에서는 paymentId로 intent와 provider 결과를 조회해 전 필드를 일치 검사하고, RPC는 클라이언트 유래 지급량 대신 intent ID 또는 DB 상품 ID만 받게 한다. **RPC·테이블 변경은 picnic-supabase 이관 필요.**
- **예상 작업량:** L
- **회귀 위험:** 높음. 결제 생성·확인·웹훅·적립 멱등성을 함께 바꾸므로 sandbox 결제와 재시도 테스트가 필요하다.

#### SEC-02 — PortOne 웹훅이 공식 v2 서명·봉투 규약과 불일치

- **심각도:** P1 높음
- **판정:** 확정
- **근거 파일:라인:** `app/api/payment/portone/webhook/route.ts:51-55`가 검증 전에 JSON을 파싱하고, `:80-91`은 `x-portone-signature`류 비표준 헤더를 찾는다. `webhook-helpers.ts:56-84`는 `JSON.stringify(payload)`의 단순 HMAC hex를 계산한다. 설치 SDK 문서는 원문 문자열과 `webhook-id`, `webhook-timestamp`, `webhook-signature`를 요구한다(`node_modules/@portone/server-sdk/README.md:82-103`, `dist/webhook.d.ts:40-71`). 공식 결제 이벤트는 `type`과 `data.paymentId` 봉투다(`WebhookTransactionPaid.d.ts:3-12`, `WebhookTransactionDataPaid.d.ts:2-8`).
- **영향·재현 조건:** 표준 세 헤더만 붙인 정상 v2 웹훅은 로컬 signature가 빈 값이 되어 401이 된다. 반대로 서명 없는 `{"status":"READY","paymentId":"attacker-controlled"}`를 route에 전달하는 로컬 재현은 `route.ts:60-64` 조기 반환 때문에 200 `ok:true`였다. 공식 `{type:'Transaction.Paid',data:{paymentId:'...'}}` 봉투에 현재 자체 HMAC을 붙여도 top-level paymentId가 없어 400 `Missing paymentId`가 재현됐다. 정상 결제 적립 누락과 재시도 폭증 가능성이 있다.
- **최소 수정 방향:** `request.text()` 원문과 표준 헤더를 공식 `Webhook.verify`에 넘기고 **모든 이벤트 분기 전에** 검증한다. 검증된 `type/data`만 사용하며 webhook-id/timestamp의 replay 방어를 유지한다.
- **예상 작업량:** M
- **회귀 위험:** 높음. 실제 PortOne sandbox fixture와 raw-body 바이트 일치 테스트가 필요하다.

#### SEC-03 — PayPal 주문 소유권 검사 전에 캡처 실행

- **심각도:** P1 높음
- **판정:** 확정
- **근거 파일:라인:** `app/api/payment/paypal/capture-order/route.ts:72-93`은 로그인과 orderID만 확인하고, `:95-115`에서 PayPal `/capture`를 먼저 호출한다. 사용자 소유권은 `:125-164`, 상품·금액은 `:166-203`에서 사후 검사한다.
- **영향·재현 조건:** 공격자가 로그인한 상태에서 피해자의 아직 캡처되지 않은 orderID를 알아내 `POST /api/payment/paypal/capture-order`에 `{"orderID":"<victim-order>"}`를 보낸다. PayPal 캡처는 성공한 뒤 로컬 소유권 검사에서 403이 될 수 있다. 피해자는 청구됐지만 캔디가 적립되지 않고 재시도도 이미 캡처됨으로 실패할 수 있다.
- **최소 수정 방향:** 캡처 전에 주문 조회 또는 서버 저장 intent로 user/product/금액/통화를 검증한다. orderID를 생성 사용자와 서버에서 결박하고 PayPal request-id 및 DB unique constraint로 멱등성을 보장한다. **DB 제약·intent 저장은 picnic-supabase 이관 필요.**
- **예상 작업량:** M
- **회귀 위험:** 높음. 승인→캡처 순서와 provider 상태 전이를 sandbox에서 검증해야 한다.

#### SEC-04 — 이미지 프록시가 타 테넌트 active content를 동일 출처로 반사

- **심각도:** P1 높음
- **판정:** 확정. 고전적인 redirect SSRF는 현재 수동 redirect 검사로 일부 방어된다.
- **근거 파일:라인:** `app/api/proxy-image/route.ts:22,39-45`는 모든 `*.supabase.co`·`*.supabase.in`을 허용한다. `:131-143`은 host만 확인하고 `https:` scheme을 강제하지 않으며, `:82-117`은 redirect 목적지의 host를 다시 검사하는 긍정 통제다. 그러나 `:162-171`은 임의 Content-Type을 반사하고 응답 전체를 크기 제한 없이 버퍼링한다.
- **영향·재현 조건:** fetch를 mock해 `https://attacker.supabase.co/payload.html`이 `Content-Type:text/html`과 `<script>...</script>`를 반환하게 한 로컬 route 호출에서 응답은 200, `text/html`, 본문 그대로였다. 공격자가 자기 Supabase 프로젝트에 active content를 올리고 `/api/proxy-image?url=<encoded-url>`를 공유하면 Picnic 동일 출처 콘텐츠로 제공될 수 있다. 또한 허용 테넌트의 매우 큰 응답은 함수 메모리·egress를 소모한다.
- **최소 수정 방향:** 운영 소유 host를 정확히 allowlist하고 HTTPS만 허용한다. raster 이미지 MIME 및 magic byte만 허용하고 SVG/HTML을 거부하며, Content-Length와 streaming byte cap을 두고 `X-Content-Type-Options: nosniff`를 설정한다. 향후 host가 동적이면 DNS 해석 후 private/link-local IP도 거부한다.
- **예상 작업량:** M
- **회귀 위험:** 중간. 기존 외부 Supabase 이미지 URL과 캐시 동작이 영향을 받을 수 있다.

#### SEC-05 — service-role signed URL이 사용자 경계를 우회하는 confused deputy

- **심각도:** P1 높음
- **판정:** 코드 경계는 확정, 실제 데이터 노출은 객체 경로·운영 RLS에 조건부
- **근거 파일:라인:** `app/api/storage/signed-url/route.ts:15-19`는 세 bucket을 허용하고, `:130-148`은 다른 UUID prefix는 막지만 non-UUID prefix는 통과시킨 뒤 `:150-179`에서 service role로 서명한다. `app/api/user/profile/route.ts:204-243`은 profile의 `avatar_url`에서 추출한 임의 bucket/path를 별도 allowlist 없이 service role로 서명한다. parser는 같은 Supabase host URL 또는 bare `bucket/path`를 허용한다(`utils/image/supabase-storage.ts:77-171`).
- **영향·재현 조건:** 로그인 사용자가 `POST /api/storage/signed-url`에 `{"bucket":"media","path":"private/known-object","expiresIn":3600}`을 보낼 때 해당 non-UUID 경로에 객체가 존재하면 RLS를 우회한 URL이 발급될 수 있다. 또한 운영 정책상 사용자가 자기 `avatar_url`을 수정할 수 있다면 이를 `private-bucket/known-object`로 설정한 뒤 `GET /api/user/profile`로 cross-bucket 서명을 받을 수 있다. 두 번째 경로는 운영 profile update/RLS 정책 확인이 필요하다.
- **최소 수정 방향:** bucket을 용도별 exact allowlist하고 사용자 소유 prefix를 강제한다. profile avatar는 `avatars/<user-id>/...`만 허용하며 가능하면 사용자 세션 client와 Storage RLS로 서명한다. **RLS·Storage 정책 변경은 picnic-supabase 이관 필요.**
- **예상 작업량:** M
- **회귀 위험:** 높음. 과거 avatar/media 경로 형식의 호환성을 조사해야 한다.

#### SEC-06 — presigned upload가 선언 MIME만 신뢰하고 quota가 없음

- **심각도:** P2 중간
- **판정:** 확정
- **근거 파일:라인:** `app/api/uploads/presign/route.ts:42-50`은 인증하고, `:18-27`에 MIME allowlist, `:40`에 20MB 상한, `:70-85`에 사용자 기반 key와 Content-Type/길이 조건이 있다. 그러나 실제 magic byte·미디어 구조 검증, 사용자별 용량/횟수 제한, quarantine 단계가 없고 `:87-92`에서 공개 URL을 즉시 반환한다.
- **영향·재현 조건:** 로그인 사용자가 `contentType:"image/png"`으로 presign을 받고 실제 HTML·polyglot·악성 파일 바이트를 그 Content-Type으로 업로드할 수 있다. 20MB POST를 반복해 저장 비용과 공개 배포면을 계속 늘릴 수도 있다.
- **최소 수정 방향:** private quarantine prefix에 업로드하고 worker가 실제 형식·크기·차원·재생시간·악성 여부를 검증한 뒤 공개 위치로 승격한다. 사용자별 rate/용량 quota를 둔다. **quota 원장·정책은 picnic-supabase 이관 필요.**
- **예상 작업량:** L
- **회귀 위험:** 중간. 업로드 완료 시점과 클라이언트 표시 흐름이 바뀐다.

#### SEC-07 — QNA multipart를 인증 전에 파싱하고 파일 제한이 없음

- **심각도:** P2 중간
- **판정:** 확정. 최대 피해량은 Vercel request limit에 조건부다.
- **근거 파일:라인:** `app/api/qna/messages/route.ts:4-12,22-29`는 `request.formData()`로 전체 본문을 만든 뒤 인증한다. `:46-76`은 파일 개수·크기·실제 형식 제한 없이 원래 확장자와 제공된 Content-Type을 사용한다. `:14,31-39`는 `parseInt`로 threadId를 처리하고 route 자체 소유권 검사가 없다.
- **영향·재현 조건:** 비로그인 사용자가 큰 multipart body를 보내면 401 전에 파싱 비용을 유발한다. 로그인 사용자는 다수의 임의 `.html` 등 파일을 첨부할 수 있고, `thread_id=1abc`도 숫자 1로 해석된다. 실제 타 thread insert 차단은 운영 RLS에 의존한다.
- **최소 수정 방향:** 인증을 body 파싱보다 먼저 수행하고 Content-Length, 파일 수, 개별·합계 크기, MIME/magic byte를 제한한다. 정수 전체 문자열을 검증하고 thread 소유권을 route와 RLS 양쪽에서 확인한다. **RLS 변경은 picnic-supabase 이관 필요.**
- **예상 작업량:** M
- **회귀 위험:** 중간. 기존 허용 확장자와 상담 첨부 최대치를 제품 정책과 맞춰야 한다.

#### SEC-08 — 투표 상세 API가 미공개 조건을 적용하지 않고 전체 열을 반환

- **심각도:** P2 중간
- **판정:** route 결함은 확정, 실제 열람은 운영 SELECT RLS에 조건부
- **근거 파일:라인:** `app/api/vote/[id]/detail/route.ts:20-29`는 인증/admin/`visible_at` 조건 없이 vote를 `select('*')`하고, `:35-69`에서도 item/artist/reward 전체 열을 읽어 `:99-106`에 반환한다. 반면 목록 API는 비관리자에게 공개 시각을 적용한다(`app/api/votes/route.ts:71-105`).
- **영향·재현 조건:** public SELECT RLS가 해당 row를 허용하는 환경에서 ID를 추측해 `GET /api/vote/<future-id>/detail`을 요청하면 목록에 숨겨진 투표의 후보·보상·내부 열이 200으로 노출될 수 있다.
- **최소 수정 방향:** 목록과 동일한 공개 상태·시각 조건을 detail에도 적용하고 반환 열을 명시한다. DB에서도 공개 view/RLS로 동일 규칙을 강제한다. **DB view/RLS 변경은 picnic-supabase 이관 필요.**
- **예상 작업량:** S
- **회귀 위험:** 중간. 관리자 미리보기는 별도 인증 경로가 필요할 수 있다.

#### SEC-09 — auth callback의 `next`는 방어되지만 origin 신뢰로 조건부 open redirect

- **심각도:** P2 중간
- **판정:** 직접 `next` 공격 방어는 확정된 긍정 통제, Host/origin 공격은 배포 프록시 설정에 조건부·추측
- **근거 파일:라인:** `app/api/auth/callback/route.ts:7-14,32-45`는 상대 경로만 허용해 absolute URL과 `//`를 `/`로 바꾼다. 그러나 성공·오류 redirect의 base가 canonical env가 아닌 `request.url.origin`이다(`:28,45,104,141-148`).
- **영향·재현 조건:** `https://www.picnic.fan/...next=https://evil.example`은 Picnic origin에 남는 것을 로컬 호출로 확인했다. 반면 request URL 자체를 `https://evil.example/api/auth/callback?...`로 구성하면 오류 redirect Location도 evil origin이 됐다. Vercel이 공격자 Host/forwarded host를 완전히 거부하면 운영 악용은 막히지만, custom proxy가 이를 전달하면 callback 오류가 외부 사이트로 이동한다.
- **최소 수정 방향:** `NEXT_PUBLIC_SITE_URL` 등 canonical origin allowlist를 base로 사용하고 예상하지 않은 Host는 400 처리한다. 현재 relative-only `next` 검증은 유지하고 route-level encoded separator 테스트를 추가한다.
- **예상 작업량:** S
- **회귀 위험:** 낮음. preview/custom domain 허용 목록만 명확히 해야 한다.

#### SEC-10 — 투표 목록 숫자 query 검증이 NaN을 허용

- **심각도:** P3 낮음
- **판정:** 확정
- **근거 파일:라인:** `app/api/votes/route.ts:68-69`가 `parseInt` 결과를 finite 검사 없이 `Math.max`에 넣는다.
- **영향·재현 조건:** `GET /api/votes?page=x&limit=x`에서 page/limit/offset이 NaN이 되어 Supabase range 호출 오류 또는 500을 만들 수 있다. 반복 요청은 불필요한 오류 로그를 만든다.
- **최소 수정 방향:** zod 또는 명시적 `Number.isSafeInteger`로 범위 포함 검증하고 잘못된 query는 400으로 고정한다.
- **예상 작업량:** S
- **회귀 위험:** 낮음

#### SEC-11 — PortOne verify가 paymentId 소유권을 확인하지 않음

- **심각도:** P3 낮음
- **판정:** 확정된 누락, 노출량은 provider 응답·receipt RLS에 조건부
- **근거 파일:라인:** `app/api/payment/portone/verify/route.ts:52-80`은 로그인 사용자가 준 paymentId로 provider를 조회하지만 `paymentData.customData.userId`를 현재 사용자와 비교하지 않는다.
- **영향·재현 조건:** 로그인 공격자가 추측·획득한 다른 사용자의 paymentId로 verify를 반복 호출하면 결제 존재·상태를 구분할 수 있다. receipt 조회 RLS까지 느슨하면 추가 메타데이터 노출 가능성이 있으므로 운영 정책 확인이 필요하다.
- **최소 수정 방향:** 서버 intent의 소유자와 payment customData userId를 모두 현재 user와 비교하고, 불일치·미존재 응답을 구분하지 않는다. **intent/RLS 변경은 picnic-supabase 이관 필요.**
- **예상 작업량:** S
- **회귀 위험:** 낮음

### 4.1 확인된 긍정 통제

- `SUPABASE_SERVICE_ROLE_KEY` 참조는 검색상 서버 route에만 있고, `next.config.js:43-57`의 client env 인라인 목록에는 service-role key가 없다. `NEXT_PUBLIC_*SERVICE_ROLE`, `NEXT_PUBLIC_*SECRET`, `NEXT_PUBLIC_*PRIVATE_KEY`도 검색되지 않았다.
- 커밋된 소스에서 일반적인 AKIA/JWT-like 비밀 패턴을 파일명과 함께 검색했지만 직접 노출은 찾지 못했다.
- 빌드는 금지되어 `.next/static` 산출물을 확인하지 못했다. 따라서 “직접 누출을 찾지 못함”이지 부재를 증명한 것은 아니다.
- proxy-image는 redirect를 수동 추적하며 각 목적지 host를 다시 검사한다(`app/api/proxy-image/route.ts:82-117`). 이 방어는 제거하지 말고 exact host·MIME·크기 검증을 추가해야 한다.

## 5. 의존성 발견사항

#### DEP-01 — Next.js 15.5.23이 critical RCE 영향 범위

- **심각도:** P0 치명
- **판정:** 확정
- **근거 파일:라인:** 잠금 버전은 `package-lock.json:12571-12574`의 15.5.23이다. `npm audit --omit=dev`는 Next에 Windows-hosted server RCE와 Image Optimization AVIF RCE를 보고하며 둘 다 `<15.5.24`가 영향 범위다. 앱은 `next.config.js:71-80`에서 AVIF를 활성화하고 S3 remote image를 허용하며, `app/api/uploads/presign/route.ts:18-27`도 AVIF 업로드를 허용한다.
- **영향·재현 조건:** 현재 서버에서 `/_next/image?url=<허용된 S3의 crafted AVIF>&w=640&q=75`가 이미지 최적화 경로를 통과하는 구성이 취약 조건과 겹친다. 안전을 위해 악성 AVIF 바이너리는 만들거나 실행하지 않았다. Linux Vercel이면 Windows 전용 건은 해당하지 않아도 AVIF 건은 별도다.
- **최소 수정 방향:** 먼저 15.5 계열의 최소 보안 패치인 15.5.24 이상, 현재 wanted인 15.5.26으로 올리고 이미지 최적화 회귀 테스트를 한다. Next 16 메이저는 별도 마이그레이션으로 분리한다.
- **예상 작업량:** S
- **회귀 위험:** 중간. patch지만 이미지 파이프라인과 Sentry 연동 smoke test가 필요하다.

#### DEP-02 — 운영 의존성 그래프에 26개 취약점

- **심각도:** P1 높음
- **판정:** 확정
- **근거 파일:라인:** `npm audit --omit=dev --json`은 critical 1, high 4, moderate 21을 반환했다. `@sentry/nextjs` 9.47.1(`package-lock.json:5200-5208`)은 OTel·fast-uri 경로, `@iamtraction/google-translate` 2.0.1(`package-lock.json:2364-2371`)은 undici 5 경로를 끌어온다. `package.json:54`의 번역 패키지는 검색상 `scripts/auto-translate.ts`, `scripts/fill-placeholders.ts`에서만 사용한다.
- **영향·재현 조건:** `npm audit --omit=dev`로 동일 집계가 재현된다. 번역 도구까지 production install에 포함되어 런타임에 필요 없는 취약한 undici가 배포 그래프에 남는다. Sentry의 일괄 자동 수정은 11 메이저를 제안하므로 API·빌드 호환성 검토 없이 적용하면 안 된다.
- **최소 수정 방향:** 번역 패키지를 devDependencies로 옮기고 lockfile을 재생성한다. Sentry는 9 계열 보안 패치 가능 여부를 먼저 조사한 뒤 11 메이저 업그레이드를 별도 작업으로 수행한다.
- **예상 작업량:** M
- **회귀 위험:** 중간. Sentry instrumentation/build plugin과 번역 스크립트를 각각 검증해야 한다.

#### DEP-03 — sharp 0.34.5가 high advisory 범위

- **심각도:** P1 높음
- **판정:** 확정
- **근거 파일:라인:** `package-lock.json:14244-14247`에 0.34.5가 잠겼고 npm audit의 영향 범위는 `<0.35.4`다. Next image 최적화가 실제 처리면이다.
- **영향·재현 조건:** production audit에서 high로 집계된다. 공격자가 제어하는 허용 remote image나 upload가 sharp 처리 경로에 들어갈 때 advisory 조건에 노출될 수 있다.
- **최소 수정 방향:** Next 15.5 patch 호환성을 확인한 뒤 sharp 0.35.4 이상으로 올리고 JPEG/PNG/WebP/AVIF 변환, animated image, oversized/corrupt fixture를 smoke test한다.
- **예상 작업량:** S
- **회귀 위험:** 중간. native binary/Node 24 플랫폼 호환성과 이미지 결과가 달라질 수 있다.

#### DEP-04 — 개발 도구 그래프에 critical tar와 패치 가능한 Vitest 취약점

- **심각도:** P2 중간
- **판정:** 확정
- **근거 파일:라인:** 전체 audit은 critical 2, high 6, moderate 24다. Supabase CLI 1.226.4(`package-lock.json:14781-14786`)가 취약 tar 7.4.3(`:14976-14982`)을 포함하고, Vitest 4.1.10(`:15747-15755`)과 coverage-v8 4.1.10(`:6747-6755`)에는 dev-server path traversal/arbitrary file read advisory가 있으며 4.1.11 패치가 있다.
- **영향·재현 조건:** `npm audit` 전체 실행에서 재현된다. CI나 개발 머신에서 untrusted archive/테스트 프로젝트를 처리하거나 Vitest UI/dev server를 외부에 노출할 때 위험이 커진다. Supabase CLI 수정 제안은 2.118.0 메이저다.
- **최소 수정 방향:** Vitest와 coverage-v8를 함께 4.1.11 이상으로 patch한다. Supabase CLI 2.x는 CLI 명령·생성 타입 diff를 확인하는 별도 업그레이드로 진행한다. 그 전까지 Vitest UI와 dev server를 loopback 외부에 노출하지 않는다.
- **예상 작업량:** M
- **회귀 위험:** 중간. Supabase CLI 2.x의 생성 결과와 명령 옵션 변화가 핵심이다.

#### DEP-05 — 메이저 버전 드리프트와 폐기 예정 lint 경로

- **심각도:** P2 중간
- **판정:** 확정
- **근거 파일:라인:** `npm outdated` 기준 Next 16.3.6, React 19.3.0, Sentry 11.0.0, PayPal JS 11.1.1, Supabase CLI 2.118.0, Tailwind 4.3.3, Vitest 5.0.2가 최신이다. Node engine은 24.x(`package.json:5-7`)인데 `@types/node`는 20 계열(`package.json:91`)이다. lint script는 제거 예정인 `next lint`다(`package.json:28`).
- **영향·재현 조건:** `npm outdated --json`과 `npm run lint`에서 각각 갭과 Next 16 제거 경고가 재현된다. Next/React를 나중에 한 번에 올리면 App Router, ESLint, Sentry, UI 동작 변경이 동시에 겹쳐 회귀 격리가 어려워진다.
- **최소 수정 방향:** 보안 patch와 메이저 마이그레이션을 분리한다. 우선 `@types/node`를 runtime major와 맞추고 ESLint CLI로 이전한 뒤, PayPal/Sentry/Vitest/Tailwind/React/Next를 각각 작은 PR과 계약 테스트로 올린다.
- **예상 작업량:** L
- **회귀 위험:** 높음. 여러 메이저를 동시에 올리지 않아야 한다.

#### DEP-06 — `legacy-peer-deps`는 현재 꺼져 있으며 재도입 금지

- **심각도:** P3 낮음
- **판정:** 확정된 긍정 상태
- **근거 파일:라인:** 저장소에 `.npmrc`가 없고 `npm config get legacy-peer-deps`는 `false`, `npm ls --depth=0`은 성공했다. Git 이력상 `dffb4b31`에서 과거 `legacy-peer-deps=true`를 제거했다.
- **영향·재현 조건:** 현재 영향은 없다. 다시 `.npmrc`에 `legacy-peer-deps=true`를 넣으면 npm이 peer 충돌을 무시해 설치 성공처럼 보이지만 React/Next/테스트 도구의 실제 비호환을 런타임·타입 단계로 미룬다. 과거 제거 기록에도 229개 타입 오류 은폐가 언급됐다.
- **최소 수정 방향:** 현 상태를 유지하고 CI에서 `npm ci`와 `npm ls --depth=0`을 실행한다. peer 충돌은 패키지별로 해결하며 `--legacy-peer-deps`를 설치 문서에 추가하지 않는다.
- **예상 작업량:** S
- **회귀 위험:** 낮음

## 6. 우선 개선 Top 10

효과 대비 비용과 실제 금전·원격 실행 위험을 함께 정렬했다.

| 순위 | 조치 | 효과 | 비용 | 선행/검증 |
|---:|---|---|---:|---|
| 1 | Next 15.5.23 → 15.5.26 이상 보안 patch | critical RCE 면 즉시 축소 | S | 이미지 최적화·Sentry smoke |
| 2 | PortOne 지급량을 서버 intent/DB 상품 기준으로 전환 | 임의 과적립 차단 | L | **picnic-supabase 이관 필요**, 결제 sandbox |
| 3 | PortOne 공식 `Webhook.verify(rawBody, headers)` 적용 | 정상 적립 복구, 위조·replay 차단 | M | 공식 fixture, retry/idempotency |
| 4 | PayPal 소유권·금액 검사를 capture 앞으로 이동 | 타인 주문 강제 캡처·미적립 차단 | M | PayPal sandbox |
| 5 | proxy-image exact host/MIME/크기 제한 | 동일 출처 active-content와 메모리 DoS 차단 | M | 기존 remote image 회귀 |
| 6 | signed URL을 exact bucket+사용자 prefix로 제한 | service-role 데이터 경계 복원 | M | 과거 경로 조사, **picnic-supabase 이관 필요** |
| 7 | 결제·인증·업로드 route 계약 테스트 추가 | 금전/권한 회귀를 배포 전 차단 | L | 3.3 표를 acceptance로 사용 |
| 8 | presigned upload quarantine·실파일 검증·quota | 악성 파일·스토리지 남용 축소 | L | 비동기 publish UX, **picnic-supabase 이관 필요** |
| 9 | sharp, Vitest를 안전 패치로 올리고 번역 도구를 dev로 이동 | high/moderate 노출과 production graph 축소 | S~M | lockfile·이미지·test 검증 |
| 10 | QNA 인증 선행·multipart 제한 및 vote detail 공개 조건 통일 | 자원 고갈·미공개 데이터 노출 축소 | M | RLS 확인, **picnic-supabase 이관 필요** |

## 7. 건드리면 안 되는 것

- 이 저장소에 `supabase/migrations/*.sql`을 추가하지 않는다. RLS, RPC, unique constraint, payment intent/quota 원장은 **picnic-supabase 이관 필요**다.
- `legacy-peer-deps=true` 또는 `npm install --legacy-peer-deps`를 재도입하지 않는다. 충돌을 해결하지 않고 숨긴다.
- PortOne 웹훅을 “작동하게 만들기 위해” 서명 검증을 느슨하게 하거나 READY 조기 성공 분기를 유지하지 않는다. 공식 SDK의 raw-body 검증을 기준으로 한다.
- PayPal capture 이후의 사후 소유권 검사만 강화하지 않는다. 외부 capture 전에 권한·금액을 확정해야 한다.
- service-role key를 `NEXT_PUBLIC_*`, client component, 브라우저 로그, 오류 응답에 넣지 않는다. 서버 route에 있더라도 사용자 입력을 그대로 service-role 작업의 대상 경로로 쓰지 않는다.
- proxy-image의 redirect 재검사(`app/api/proxy-image/route.ts:82-117`)를 제거하지 않는다. exact host·MIME·크기·IP 검사는 그 위에 추가한다.
- `npm audit fix --force`로 Next/React/Sentry/Supabase/Vitest 메이저를 한꺼번에 바꾸지 않는다. 보안 patch와 메이저 마이그레이션을 분리한다.
- presigned URL을 공개 URL로 간주해 업로드 직후 신뢰하지 않는다. 검증 전 파일은 quarantine/private 상태여야 한다.
- 미공개 투표를 숨기는 책임을 UI나 목록 API에만 두지 않는다. detail route와 DB 정책에서 함께 강제한다.
- 감사 재현을 위해 운영 결제·실사용자 주문·악성 이미지 payload를 사용하지 않는다. provider sandbox와 무해한 fixture로 검증한다.

## 8. 남은 확인사항

- PortOne 콘솔의 실제 v2 webhook endpoint/secret/재시도 상태와 최근 401·400 비율
- PayPal orderID 노출 가능 경로와 provider-side order 조회 API/intent 저장 현황
- `profiles.avatar_url` update 및 Storage bucket별 운영 RLS, `media/private/*` 실재 여부
- vote·vote_item·reward의 public SELECT RLS와 관리자 preview 요구사항
- S3 bucket의 public 접근·Content-Disposition·CDN MIME 처리 및 사용자별 실제 사용량
- Vercel/custom proxy가 Host·`x-forwarded-host`를 어떻게 정규화하는지

이번 감사에서는 스키마·소스·설정·`package.json`을 수정하지 않았다. 후속 수정 시 각 발견사항의 재현 테스트를 먼저 실패시키고, 수정 후 동일 입력으로 권한·금액·호출 횟수·멱등성을 검증해야 한다.
