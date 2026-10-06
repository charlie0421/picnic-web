# 가린 기록만 남기는 계약 함수와 경계 함수 (B-P4 의 PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결제·인증 경로가 오류를 "계약을 통과한 값만" 남길 수 있게 계약 함수 `logSafeError` 와 경계 함수 `withSafeErrors` 를 만들고, 응답 뒤의 Sentry 전송이 어디까지 보장되는지를 실제 서버와 CI 에서 재는 테스트로 고정한다. 호출부는 옮기지 않는다(PR 3·4).

**Architecture:** `logSafeError(code, error, fields)` 는 넘겨받은 값을 그대로 쓰지 않고 가린 기록을 새로 만든다. 사건 코드와 오류 이름·오류 코드는 닫힌 목록에서 고르고, 필드는 이름이 정해진 여덟 개만 형식을 검증해 남기며, stack 은 호출 지점에서 새로 만든다. 그 기록 하나를 기존 `Logger` 를 거쳐 Console 과 Sentry 두 target 에 넘긴다. `withSafeErrors(code, handler)` 는 서버 전용 파일에서 핸들러의 예외를 잡아 고정된 500 을 돌려주고, 오류를 기록한 요청에 한해 요청당 한 번 `after()` 로 `Sentry.flush(2000)` 의 결과를 본다. "이 요청에서 기록이 있었는가"는 `AsyncLocalStorage` 로 안다. `SentryLogTarget` 의 `await import` 는 그대로 둔다 — 재 보니 전달의 틈이 없다.

**Tech Stack:** Next 15.5.26 (App Router, webpack), `@sentry/nextjs` 9.47.1, vitest 4 (기본 jsdom, 서버 코드 테스트는 `// @vitest-environment node`), Node 24, CommonJS 스크립트(`scripts/`).

**Spec:** `docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md` (§4.2, §4.3, §4.7, §5.1, §5.2, §5.3, §6.1 의 PR 2). 결정 2·3 은 2026-10-02 에 권장대로 확정됐다(§9).

**실행 방식:** 초기 구현은 조정자가 직접 했고, 후속 리뷰 수정은 Orca 로 추적하는 Claude Opus 5.5/high 가 맡았다. Codex(`gpt-6-sol`/high, 읽기 전용)가 고위험 교차 리뷰를 한다. 테스트·문서·통합은 조정자가 맡으며 구현과 리뷰는 순차 진행한다. 머지는 사용자 승인 뒤에 한다.

## 실행 결과 (2026-10-06)

**안전한 새 신호 정규화 구현과 수정 후 검증을 완료했으며 독립 재검토를 기다린다.** 이전 교차 리뷰의 상태 변화 blocker 는 원본 재투척을 없애는 방식으로 수정했다. 새 반례의 단위·실서버 RED/GREEN 결과는 아래에 있다. 브랜치는 `feat/log-redaction-contract` 다. 아래 본문의 파일 블록은 실행이 끝난 뒤의 실제 파일과 같게 맞췄다. 실행하면서 계획과 달라진 것:

| 무엇 | 계획 | 실제 | 이유 |
|---|---|---|---|
| 전달 시나리오의 수집기 (Task 8) | 모든 envelope 에 300ms·2600ms 뒤에 답한다 | **오류 이벤트에만** 늦게 답하고 나머지에는 바로 답한다 | "틈을 만들어 실패를 본다"(Step 7)에서 다섯 단계 가운데 넷만 실패했다(하나는 전송 완료와 0ms 로 겹쳤다). SDK 는 flush 할 때 표본에서 빠진 transaction 의 집계(`client_report`)도 보내는데, 수집기가 그것까지 늦추면 flush 가 그 응답을 기다려 틈이 있어도 몇 ms 차이로만 갈린다. 고친 뒤에는 차이가 약 300ms 이고 같은 지연에서 7건이 실패한다 |
| "실패를 확인한다" (Task 1·3·4) | 모듈이 없다는 오류를 본다 | 그 뒤에 값을 그대로 넘기는 골격으로도 돌려 동작의 부재로 실패하는 것을 봤다: 닫힌 목록 39/60건, 계약 함수 37/52건(지금의 `logError` 처럼 넘기는 골격), 경계 함수 9/25건(설계 문구 그대로의 골격) | 모듈이 없어서 나는 오류는 테스트가 무엇을 잡는지 보여 주지 않는다 |
| `Logger.safeError` 의 주석 (Task 2) | "한 이슈로 합쳐진다" | "한 이슈로 묶일 수 있다" | Sentry 의 문서에 따른 예상이고 Sentry 에서 잰 것이 아니다. envelope 테스트로 확인한 것은 경계가 잡은 예외의 프레임이 공용 청크의 것뿐이라는 데까지다 |
| `utils/log-error.ts` 의 주석 (Task 9) | "결제·인증 경로는 logSafeError 를 쓴다" | "값을 가려 남겨야 하는 경로(결제·인증)에는 logSafeError 를 쓴다" | 호출부는 아직 옮기지 않았다(PR 3·4) |

결과: 테스트는 3,170건 → 3,521건(파일 198 → 204), `it.fails` 6건과 skipped 1건은 그대로다. `npm run test:envelope` 는 누출 시나리오 36건과 전달 시나리오 11건이 통과한다. 경계 없이 `logError` 에 값을 넘긴 모습에서는 누출 시나리오가 20건으로 실패했고, `captureException` 앞에 5ms 지연을 넣으면 전달 시나리오가 7건, CI 의 전달 테스트가 2건으로 실패한다.

### 교차 리뷰 1차와 수정 (2026-10-06)

Codex `gpt-6-sol`/high 의 읽기 전용 리뷰는 REQUEST_CHANGES(blocker 1, major 2, minor 1)였다. 실패하는 테스트로 각 지적을 확인한 뒤 `8025927b` 에서 수정했다. 원 리뷰어의 재검증에서 경계의 blocker 1건이 남았고, 아래 후속 수정에서 다룬다.

| 지적 | 수정 | 회귀 테스트 |
|---|---|---|
| blocker: `cause` getter·순환·Proxy 가 경계를 뚫는다 | 경계가 사슬을 직접 따라가며 예외·순환·깊이를 제한하고, Next 가 각 값 자체를 다시 던질 때만 신호로 전파한다 | `with-safe-errors.test.ts` 의 "던진 값이 읽기를 방해할 때" 6건. 실제 서버 `boundary-hostile` 수정 전 실패 4건 → 수정 뒤 0건 |
| major: 취소된 `fields` Proxy 에서 로그가 사라진다 | `Array.isArray` 도 try 안에서 검사하고 기록 생성 실패에는 상수 대체 기록을 남긴다 | `log-safe-error.test.ts` 의 취소된 Proxy 3건, "기록을 만들다가 던져도…" 1건 |
| major: 동적 함수 이름이 stack 에 노출된다 | 구조화된 CallSite 의 스크립트 이름·줄·칸만 사용한다. API 가 없으면 프레임을 생략한다 | 동적 함수 이름 반례 4건, 위치만 싣는 stack 1건 |
| minor: Symbol·비열거 키가 누락된다 | `Reflect.ownKeys` 로 센다 | Symbol·비열거 키 1건 |

새 라우트 `scripts/envelope-test/routes/boundary-hostile/route.ts` 와 사건 코드 `envtest.boundary.hostile` 을 더했다. `scenario.js` 와 라우트 목록 테스트도 갱신했다. 아래 최종 파일 블록과 diff 는 이 수정을 포함한다. 수정 전 실패를 보여 주는 시제품·출력 블록은 당시 기록을 유지한다.

**이어서 확인한 결과:** 코드 `8025927b` 에서 `npx tsc --noEmit`, `npm run lint` 통과. KST·UTC 각각 테스트 204파일, 3,387건 통과·6건 expected fail·1건 skipped. `npm run test:envelope -- --skip-build` 로 핸드오프의 기존 `.next-envtest` 빌드를 재사용해 누출 24건과 전달 11단계 통과를 재확인했다. 이번 후속 작업은 문서만 수정하며 빌드는 다시 만들지 않았다.

리뷰어가 미확인으로 남긴 항목: (1) 경계의 getter 반례는 실제 서버에서 재현·검증했다. 나머지 세 지적은 계약 함수 단위 테스트로 검증한다. (2) 전달 실측은 route handler 의 `Promise.resolve().then(require)` 경로다. 별도 청크의 첫 동적 import 는 측정하지 않았고, 로더의 동기 `require` 는 코드로만 확인했다. (3) 스트리밍 응답 반환 뒤의 오류는 경계가 잡지 못한다. 현재 결제·인증 라우트는 스트리밍하지 않는다.

### 원 리뷰어 재검증 — REQUEST_CHANGES (2026-10-06)

대상 `db57eed3`(코드 `8025927b`), Codex `gpt-6-sol/high`, 읽기 전용·승인 `never`·Fast OFF. 최신 동일 계정 사용량·capability 와 build-launch 검증을 통과한 뒤 원 리뷰어 터미널에 요청했다. 원격 CI 도 `db57eed3` 에서 통과했다.

- **부분 해소 / blocker:** `utils/with-safe-errors.ts:83` 의 `isNextControlFlow`. `cause` getter 가 원본 오류 자신을 던지면 `thrown === value` 가 참이 된다. 실제 Next 신호가 아닌데 원본을 전파하여 고정 500 과 가린 로그가 모두 빠진다.
- **해소:** 취소된 `fields` Proxy, 동적 함수명 stack 누출, Symbol·비열거 키 표시.

최소 판별식 반례(설치된 Next 의 서버 구현, 외부 호출 없음):

```js
const { unstable_rethrow } = require('next/navigation');
const error = new Error('synthetic-self-rethrow-canary');
Object.defineProperty(error, 'cause', { get() { throw error; } });
try {
  unstable_rethrow(error);
} catch (thrown) {
  console.log({ rethrowsOriginal: thrown === error }); // true — Next 신호가 아니다.
}
```

조정자는 현재 `utils/with-safe-errors.ts` 를 TypeScript `transpileModule` 로 메모리에서 변환해 `withSafeErrors` 전체도 확인했다. Next 의 `unstable_rethrow` 는 실제 모듈을 쓰고, Sentry·`after`·로그 target 은 무동작/호출수 대역을 썼다. 위 오류를 던지는 handler 의 결과: `{"responseStatus":null,"safeLogCalls":0,"escapedOriginal":true}`. 당시 코드에서 결함이 재현됐다. 새 반례의 실제 Next 서버 검증과 수정 결과는 아래 후속 기록에 있다. 기존 3,387건과 envelope 누출 24건·전달 11단계의 통과를 이 반례의 해결 근거로 삼지 않는다.

후속 수정 요구사항: 현재 값 자체가 Next 제어 흐름 신호인지 안전하게 판별하고 `cause` 탐색을 분리한다. 자기 자신을 던지는 getter 의 실패 테스트와 실제 서버 누출 검증, 기존 Next 제어 흐름 신호 회귀 검증이 필요하다.

추적: Run `run_176dd32d29c0`, Task `task_839d8b57ef0c`, Dispatch `ctx_a6a790bde55d`. 리뷰어의 `worker_done` 은 읽기 전용 샌드박스의 `runtime_access_denied (EPERM)` 으로 차단됐다. 최종 판정과 턴 종료를 transcript 로 확인한 뒤 조정자가 `worker-abandon` 으로 정산했고 수락됐다(프로세스 동작 없음, 원 터미널 유지). 이는 리뷰 APPROVE 나 구현 완료를 뜻하지 않는다. 정리 대기 터미널은 0건이며 quota 실패·providerHold 는 없다.

### 자기 재투척 blocker 후속 수정 (2026-10-06)

첫 수정(`5470d15b`)은 `unstable_rethrow` 에 원본 값을 넘기지 않는다. Next 15.5.26 의 판정이 읽는 `digest`·`message`·`$$typeof` 를 예외를 잡는 범위 안에서 한 번씩 읽어 평범한 새 객체에 담았다. getter·`cause` 가 없는 그 객체로 실제 Next 판별을 수행하고, 신호로 확인됐을 때 원래 값을 전파한다. 원본 속성을 읽다가 던지면 일반 오류로 처리한다. `cause` 사슬의 깊이·순환 제한, 가린 로그와 요청당 flush 는 유지한다. 속성의 읽는 시점과 순서는 아래 후속 수정에서 보완한다.

- 단위 RED: 자기 자신을 던지는 getter 4종, 일반 객체·Proxy, 중첩 cause 두 경우가 모두 경계를 빠져나갔다. 최종 경계 테스트 51건 중 **8건 실패 / 43건 통과**였다.
- 실서버 RED: 수정 전 코드를 새로 빌드했다. 전체 시나리오는 첫 `boundary-self-throw` 다음 요청의 `ECONNRESET` 으로 중단됐다. 같은 빌드에 해당 요청만 한 번 보내 원인을 분리했다. 결과는 **HTTP 500, 본문 `Internal Server Error`, 원본 canary 가 서버 출력에 노출, 가린 이벤트 0건, Next 프로세스 종료 코드 7**이었다. 단순 빌드·연결 실패로 취급하지 않는다.
- 수정 뒤 단위 GREEN: **51/51**. redirect·접근 fallback·CSR 전환·동적 렌더링·동적 postpone·React postpone·hanging promise 거부를 Next 자체 판정과 함께 검증한다. Next 판정이 읽는 속성에 대한 호환 테스트도 둔다.
- 실서버 `boundary-self-throw` 와 사건 코드 `envtest.boundary.self_throw` 를 추가하고 기존 `boundary-hostile` 은 유지한다. 실행기는 경계 요청 네 종류의 응답 상태·고정 JSON·본문의 canary 부재도 판정한다. 잘못된 500 본문을 이전 판정기는 놓치고 새 판정기는 실패시키는 것을 별도로 확인했다.
- `npx tsc --noEmit`, `npm run lint` 통과. KST·UTC 각각 **204파일, 3,417건 통과 · 6 expected fail · 1 skipped**. 관련 판정·라우트·사건 코드 테스트 67건 통과.

수정 후 새 전체 빌드의 `npm run test:envelope` 는 종료 코드 0으로 통과했다. 누출 요청 **27건**, 전달 요청 **11건**이며, 자기 재투척 오류의 가린 이벤트·로그·transaction 은 각각 3건이다. 경계 네 종류의 고정 응답도 각 3/3 일치했고 canary 누출과 서버 종료는 없었다. 구현 Task `task_d35be66071d4`, Dispatch `ctx_1d32fe60652a` (Run `run_176dd32d29c0`)의 `worker_done` 은 수락됐다. 구현은 Claude Opus 5.5/high, 테스트 실행은 조정자가 맡았다. 커밋 `5470d15b` 를 push 했으며 해당 커밋의 GitHub CI 도 통과했다.

### 단락 평가 회귀의 재검토 (2026-10-06)

원 리뷰어 Codex `gpt-6-sol`/high 는 `5470d15b` 에서 자기 재투척 누출 blocker 를 **해소**로 판정했다. 최종 판정은 **REQUEST_CHANGES(major 1건)** 다. 유효한 `redirect()` 신호의 `message` getter 가 던질 때, Next 는 `digest` 만 읽고 신호를 전파하지만 경계의 probe 는 세 속성을 미리 읽다가 고정 500 으로 바꾼다. 판정 순서와 단락 평가를 보존하는 수정이 필요하다.

리뷰 Task `task_5375ac536d41`, Dispatch `ctx_14487c13de2c`. 리뷰어의 `worker_done` 은 읽기 전용 샌드박스의 `runtime_access_denied (EPERM)` 으로 차단됐다. 최종 판정과 턴 종료를 transcript 에서 확인한 뒤 `worker-abandon` 으로 정산했다. 프로세스를 종료하거나 권한을 넓히지 않았고 quota 실패·providerHold 는 없다. 이 판정은 머지 승인이 아니다. 후속 수정은 같은 Run 의 Task `task_76b13dfcc4fe`, Dispatch `ctx_765f11679370` 에서 수행했고 `worker_done` 이 수락됐다. 원 리뷰어의 최종 재검증은 별도 단계다.

### 단락 평가 회귀의 수정·검증 (2026-10-06)

`isNextControlFlow` 는 속성을 미리 모으지 않는다. 빈 객체의 Proxy 를 실제 `unstable_rethrow` 에 넘기고, `has`·`get` 이 요청될 때만 원본을 읽는다. 같은 읽기는 결과를 기억하고, 읽기 예외는 내부 Symbol 로 바꿔 신호와 구분한다. 원본 자체를 Next 판별 함수에 넘기지 않는다. `findControlFlow` 는 현재 값을 먼저 판정해 신호이면 즉시 반환하고, 신호가 아닐 때만 `cause` 를 읽는다. 최대 10개 연결·순환·예외 방어, 가린 로그·고정 JSON 500·요청당 flush 는 유지한다.

- 단위 RED: **97건 중 29건 실패 / 68건 통과**. 실패는 새 단락 평가 반례뿐이다. 실제 Next 에 같은 신호를 넘긴 판정과 속성 접근 순서를 비교하며, 마지막 hanging-promise 판정 전에 message·$$typeof 를 읽는 순서도 포함한다. 판정기·라우트 테스트 61건은 통과했다.
- 새 빌드 실서버 RED: 요청 30건 중 redirect 3건이 모두 500 이었다. 실패는 5종(오류 이벤트 3건 대 기대 0건, 가린 로그 6줄 대 기대 3줄, 307 대신 500, 잘못된 본문, 누락된 Location)이었다. canary 누출은 없었고 기존 경계 응답과 전달 11건은 통과했다.
- 단위 GREEN: 경계 **97/97**, 판정기·라우트 **61/61**, 합계 **158/158**. 기존 자기 재투척 8건과 Next 신호 10종도 유지한다.
- 타입 검사·lint 통과. KST·UTC 각각 전체 테스트 **204파일, 3,476건 통과 · 6 expected fail · 1 skipped**.
- `boundary-redirect` 실제 라우트와 상태·Location·빈 본문·오류 이벤트 부재·헤더 canary 판정을 추가했다. 잘못된 응답 코드·이동 주소·본문·오류 이벤트를 탐지하는 회귀 테스트도 둔다. 새 빌드 실서버 GREEN 은 종료 코드 0: 누출 요청 **30건**, 전달 요청 **11건** 통과. redirect 3건 모두 **307·정확한 Location·빈 본문**, 오류 이벤트 0건이었다. 기존 경계 네 종류의 고정 응답도 각 3/3 이고 canary 누출은 없다. 원 리뷰어는 단락 평가 회귀를 해소로 판정했지만, 아래의 상태 변화 blocker 를 새로 확인했다.

### 원본 재투척 재검토 — 상태가 바뀌는 판정 속성의 blocker (2026-10-06)

코드 `67ae0212` 를 push 했고 해당 GitHub CI 는 통과했다. 원 리뷰어 Codex `gpt-6-sol`/high 는 이전 단락 평가 major 와 자기 재투척 방어의 유지를 확인했다. 그러나 **REQUEST_CHANGES(blocker 1건)** 다: 일반 오류의 `digest` getter 가 첫 읽기에만 유효한 redirect 문자열을 반환하면, 경계의 캐시가 이를 신호로 판정해 원본을 던지고 Sentry 는 뒤의 다른 값으로 일반 오류로 판정한다. `utils/with-safe-errors.ts` 의 값 캐시와 원본 재투척이 연결되는 문제다.

조정자 재현 결과:

| 판정 방법 | 유효한 값을 주는 읽기 수 | 결과 | 가린 로그 | 후속 Sentry 판정 |
|---|---:|---|---:|---|
| 현재 경계 | 첫 1번 | 원본 탈출 | 0 | 일반 오류, 포착 대상 |
| 캐시를 제거한 메모리 시제품 | 첫 1번 | 고정 500 | 1 | 원본이 밖으로 나오지 않음 |
| 현재 경계 | 첫 2번 | 원본 탈출 | 0 | 일반 오류, 포착 대상 |
| 캐시를 제거한 메모리 시제품 | 첫 2번 | 원본 탈출 | 0 | 일반 오류, 포착 대상 |

이 비교는 경계 TypeScript 를 메모리에서 변환해 실행했고, 설치된 Next·Sentry 판별 함수를 사용했다. 캐시 제거 시제품은 파일로 적용하거나 커밋하지 않았다. 다음 짧은 예시도 재판정 차이를 보여 준다(Next 15.5.26·Sentry 9.47.1, 저장소 루트의 Node):

```javascript
const { unstable_rethrow } = require('next/navigation');
const sdk = require('./node_modules/@sentry/nextjs/build/cjs/common/nextNavigationErrorUtils.js');
let reads = 0;
const error = new Error('synthetic-stateful-secret');
Object.defineProperty(error, 'digest', {
  get: () => ++reads <= 2 ? 'NEXT_REDIRECT;replace;/login;307;' : 'ordinary',
});
let nextSignal = false;
try { unstable_rethrow(error); } catch (thrown) { nextSignal = thrown === error; }
const sdkWouldCapture = !sdk.isRedirectNavigationError(error) && !sdk.isNotFoundNavigationError(error);
console.log({ nextSignal, sdkWouldCapture }); // { nextSignal: true, sdkWouldCapture: true }
```

**실제 서버에서도 조정자가 누출을 확인했다.** `67ae0212` 로 새로 만든 검증 빌드를 사용하고, 컴파일된 `boundary-self-throw` 테스트 fixture 의 getter 만 첫 1회 valid digest/이후 ordinary 로 바꿨다. 경계 구현과 추적 소스는 바꾸지 않았다. 로컬 Next 서버·로컬 Sentry 수집기에 1회 요청한 결과는 **HTTP 500, 빈 본문, 서버 출력과 envelope 양쪽에 원본 canary, 가린 이벤트 0건**이었다. 서버는 살아 있었다. 컴파일 fixture 는 `finally` 에서 원래 바이트로 복구하고 해시를 확인했다. 이 결과는 현 구현의 실서버 누출 재현이며, 새 소스 회귀 테스트나 수정 후 통과를 주장하는 근거가 아니다.

원 리뷰어와 캐시 제거의 충분성을 한 차례 교환했다. 리뷰어도 **캐시 제거만으로 부족**하다고 확인했다. 유한 횟수 재검사는 그다음 읽기에서 값이 바뀌는 경우를 막지 못한다. 생성 시점부터 신뢰할 수 있는 신호만 원본으로 전달하거나, 필요한 값만 검증해 새 신호/응답을 만드는 계약이 필요하다. 후자는 원본 객체 동일성 보장을 바꾼다. 현재의 중복 읽기를 생략하는 테스트 기록기도 이 반례를 잡지 못했다.

승인된 `main` 설계(`39ddc313`, §4.7)의 원칙은 원본 오류 비노출이다. 원본 객체 동일성은 PR 2 구현 중 추가한 조건이고 운영 호출부는 아직 이관하지 않았다. **권고하는 후속 방향은 정상 Next 동작을 보존하되 원본 객체를 내보내지 않는 안전한 신호 정규화**다. redirect 의 URL·종류·상태와 쿠키 응답, HTTP fallback, 동적 렌더링·postpone·hanging 신호에 필요한 정보만 확인·검증하고, 원본 message·stack·cause·임의 메타데이터는 전달하지 않는다. 판단할 수 없는 입력은 기존 가린 로그와 고정 500 으로 처리한다. 사용자가 2026-10-06 "진행"으로 이 방향을 승인했다. 원본 동일성 보장을 버리고 정상 동작·비노출을 보존하는 새 계약으로 구현·검증한다. 구현 Task `task_ddd9204caf38` / Dispatch `ctx_0f2b685c7117` 이며, 검증과 독립 리뷰는 아직 진행 전이다.

추적: 원 리뷰 Task `task_27f8cb0378bf` / Dispatch `ctx_f8241db38f12`; 기술 반례 교환 Task `task_114de1ff6ac2` / Dispatch `ctx_c36b7c5c144c`, Run `run_176dd32d29c0`. 두 읽기 전용 리뷰의 `worker_done` 은 Orca 연결의 `runtime_access_denied (EPERM)` 으로 차단됐다. 최종 판정·턴 종료를 확인한 뒤 `worker-abandon` 정산을 수락받았다. 원본 구현 Task 의 정상 `worker_done` 과 리뷰의 정산을 구분한다. 권한 확대·quota 재시도·providerHold 는 없다. 기술 반례 교환 리뷰어는 메모리 실행과 소스만 검토했고, 위 실서버 추가 재현은 조정자가 수행했다. PR 은 미머지이며 운영 배포도 하지 않았다.

### 안전한 신호 정규화 — 구현과 검증 (2026-10-06)

사용자가 필요한 값만 검증한 새 Next 제어 신호를 만드는 방향을 승인했다. 원본 객체 동일성은 보장하지 않는다. 원본 message·stack·cause·getter·Proxy·임의 메타데이터는 경계 밖으로 전달하지 않는다. 정상 Next 신호는 필요한 원시값만으로 다시 만들며, 안전하게 만들 수 없으면 가린 로그와 고정 JSON 500 으로 끝낸다. 구현은 기존 Claude Opus 5.5/high, 독립 리뷰는 기존 Codex gpt-6-sol/high 가 맡는다.

- 단위 RED: 구현 파일 `utils/with-safe-errors.ts` 를 `e971e032` 그대로 두고 회귀 테스트를 실행했다. 경계 127건 중 **86건 실패 / 41건 통과**, 판정기·라우트 **72/72 통과**, 합계 199건이다. 실패는 원본 객체 재투척 및 유효하지 않은 Location 이 경계를 벗어나는 반례다. 신호 10종·상태 변화 N1/N2·Proxy·민감 메타데이터·중첩 사슬·상태 코드 정규화·잘못된 주소를 포함한다.
- 새 빌드 실서버 RED: `boundary-stateful?reads=1|2` 를 추가했다. Next 의 `cookies().set()` 뒤 실제 `redirect()` 신호의 digest 가 첫 1회 또는 2회만 유효하도록 만들고 원본에 canary 를 넣었다. 누출 요청 36건 중 새 6건이 모두 **500·빈 본문**, 기대한 Location·Set-Cookie 가 없었다. 오류 이벤트 6건, envelope 예외 값 12곳과 서버 출력에 canary 가 있어 **9종 실패**했다. 기존 경계 응답과 전달 11건은 통과했다. 이 기록은 수정 전 실패이며 해결 근거가 아니다.

- 추가 RED: 실제 React postpone 에 Next 동적 메시지를 붙인 두 표식과 읽을 수 없는 `$$typeof` 등을 4건 더 시험했다. 4/4 가 원본 재투척으로 실패했고 나머지 127건은 이 실행에서 선택하지 않았다.
- 구현: 원본을 대신 읽는 probe 는 경계 안에서만 쓴다. 판정 중 읽은 값으로 새 Error 를 만들고, message·stack 은 정해진 문장과 한 줄로 제한한다. redirect URL 은 헤더에 쓸 수 있는지 검사하며 digest 의 종류·상태 코드를 정규 형태로 다시 적는다. 접근 fallback 의 뒤에 붙은 값도 버린다. 동적 postpone 은 고정 메시지와 React postpone Symbol 두 표식을 새로 넣는다. 만든 값이 실제 `unstable_rethrow` 를 통과할 때만 올려보내고, 그렇지 않으면 가린 로그·고정 500 이다. 원본 객체와 임의 속성은 전달하지 않는다.
- 단위 GREEN: **203/203**(경계 131, 판정기·라우트 72). 기존 자기 재투척·순환·깊이 제한·단락 평가와 새 정규화 반례를 함께 통과했다. 타입 검사와 lint 도 종료 코드 0이다.
- 전체 GREEN: KST·UTC 각각 **204파일, 3,521건 통과 · 6 expected fail · 1 skipped**(총 3,528), 종료 코드 0.
- 새 빌드 실서버 GREEN: `npm run test:envelope` 종료 코드 0. 누출 요청 **36건**, 전달 요청 **11건** 모두 통과했다. 상태 변화 N1/N2 각 3건이 **307·정확한 Location·빈 본문·Set-Cookie** 를 유지하고, 그 transaction 의 오류 이벤트는 0건이다. stdout·envelope·응답 본문 및 헤더에 원본 canary 가 없다. 기존 경계 응답도 모두 유지했다.

실서버에서 확인한 신호는 redirect 와 상태 변화 redirect 다. 그 밖의 Next·React 신호, 원본 부가 속성 제거, invalid Location 의 고정 500 은 단위 테스트로 검증했다. 실제 Vercel 의 after 완료 및 호출부 이관은 기존 후속 범위다. 독립 재검토는 아직 대기 중이며 머지·배포하지 않았다. Run `run_176dd32d29c0`, 구현 Task `task_ddd9204caf38` / Dispatch `ctx_0f2b685c7117` 의 `worker_done`(`msg_500af6a040ca`, succeeded)은 수락됐다. 작업자는 테스트를 실행하지 않았으며 위 수치는 조정자가 직접 실행해 확인했다.

## 계획을 쓰기 전에 확인한 것 (2026-10-06)

설계 §5.2 는 "수정 전 코드에서 사례 1 이 실패하는지 먼저 본다. 실패하지 않으면 '틈' 가설이 틀린 것이므로 §4.3 의 2번을 다시 쓴다"고 정했다. 그래서 구현보다 먼저 쟀다.

| 무엇 | 결과 |
|---|---|
| 지금 코드(`await import`)에서 핸들러가 `logError` 뒤 바로 응답할 때, SDK 가 핸들러 끝에 건 flush 가 그 이벤트의 전송을 기다리는가 | **기다린다.** 실제 `next start`, 수집기 지연 300ms, 6회(서버의 첫 요청 포함) 전부. 이벤트는 flush 등록 뒤 1~22ms 에 수집기에 닿았고, flush 는 수집기가 답한 뒤 0~6ms 에 끝났다 |
| 왜 틈이 없는가 | 순서가 구조로 정해져 있다. (1) 실측한 route handler 번들의 `import('@sentry/nextjs')` 는 `Promise.resolve().then(require)` 이다. 다른 레이어의 별도 청크 로더가 동기 `require` 라는 것은 코드로만 확인했다(`.next-envtest/server/webpack-runtime.js` 의 `c.f.require`). 그 청크의 첫 import 는 측정하지 않았다. (2) `client.flush` 는 처리 중인 이벤트 수를 1ms `setInterval` 로 처음 확인한다(`@sentry/core` `client.js` 541~559). `captureException` 은 호출 즉시 그 수를 올린다(같은 파일 138~159, 775~787). 타이머는 마이크로태스크가 다 돈 뒤에 오므로 `captureException` 이 항상 먼저다 |
| 경계 함수가 걸 flush | `after(async () => Sentry.flush(2000))`: 수집기 300ms → `true`(약 300ms 뒤), 수집기 2600ms → `false`(약 2.0초 뒤)와 `[sentry] flush timeout`. 응답은 두 경우 모두 약 5ms. `after` 콜백은 응답 뒤 2~16ms 에 시작했다 |
| CI 에서 잴 수 있는가 | 된다. 실제 SDK(`NodeClient`)에 손으로 푸는 transport 를 붙이고 SDK 의 `wrapRouteHandlerWithSentry` 로 감싸 60회 중 60회 통과. `captureException` 앞에 5ms 타이머를 넣으면 전부 실패한다(틈을 실제로 잡는다) |
| 그 밖에 알게 된 것 | `after()` 는 요청 범위 밖에서 던진다. DSN 이 없으면 `Sentry.init` 을 부르지 않고(`sentry.server.config.js`), 그때 `Sentry.flush()` 는 `false` 다. 결제·인증 경로에 edge 라우트는 없다. 공용 `vitest.setup.ts` 가 `window` 를 써서 node 환경 테스트를 못 돌린다. `next/navigation` 의 `unstable_rethrow` 는 `window` 유무로 서버용·브라우저용이 갈린다(동적 렌더링 신호는 서버용만 올려보낸다) |

**이 계획의 코드 블록은 버릴 시제품으로 먼저 돌려 본 것이다.** 타입 검사와 lint 를 통과했고, 전체 테스트는 3,170건 → 3,370건(KST·UTC), `npm run test:envelope` 는 누출 시나리오 21건과 전달 시나리오 11건이 모두 통과했다. 반대로도 봤다: 경계를 빼고 지금처럼 `logError` 에 값을 넘기면 누출 시나리오가 20건으로 실패하고, `captureException` 앞에 5ms 지연을 넣으면 전달 시나리오가 5건으로 실패한다(Task 7·8 에 출력을 적었다. 실행에서는 수집기를 고쳐 7건이 됐다 — 위의 실행 결과). 시제품은 커밋하지 않고 지웠다. 실행할 때는 작업마다 테스트를 먼저 쓰고 실패를 본 뒤 구현한다.

## 설계와 달라지는 것 — 확인이 필요하다

| # | 무엇 | 설계 | 이 계획 | 이유 |
|---|---|---|---|---|
| 1 | `SentryLogTarget` 의 import | 정적 import 로 바꾸고 `captureException` 을 동기 구간에서 부른다(§4.3 의 2) | **바꾸지 않는다.** §4.3 의 2 를 측정값으로 다시 쓴다 | 틈이 없다(위). 바꾸면 `utils/logger-targets.ts` 가 들어가는 브라우저 번들까지 건드린다 |
| 2 | Sentry 이슈 묶음 | 언급 없음 | 가린 기록의 이벤트에 `fingerprint: ['{{ default }}', 사건 코드]` 를 싣는다 | 경계 함수가 잡은 예외는 호출 지점(stack)이 모두 같다. Sentry 는 stack 이 있으면 stack 으로 이슈를 묶으므로, 그대로 두면 서로 다른 라우트의 오류가 한 이슈로 묶일 수 있다(Sentry 에서 재지는 않았다) |
| 3 | 전달 테스트의 자리(§5.2) | 실제 SDK 에 지연 transport 를 붙여 호출한다 | 두 곳에 둔다. **실제 서버**: `npm run test:envelope` 에 전달 시나리오를 더한다(사례 1·2·3, 실제 `after`, 빌드가 끼워 넣은 SDK 래퍼). **CI**: 실제 SDK 와 손으로 푸는 transport 로 사례 1 과 "핸들러 뒤의 기록은 기다리지 않는다"를 고정한다 | `after()` 는 Next 의 요청 범위 안에서만 돈다. vitest 에서는 대역을 쓸 수밖에 없다 |
| 4 | 경계 함수의 세부(§4.7) | 모든 오류를 잡아 500 | `redirect()`·`notFound()`·동적 렌더링 신호는 필요한 값만 검증해 새 신호로 올려보낸다(2026-10-06 승인). 본문은 `{ "error": "Internal server error" }`. SDK 가 초기화되지 않았으면 flush 하지 않는다. 경계가 겹치면 바깥이 한 번만 건다. `after` 등록이 실패해도 응답은 돌려준다 | 처음 둘은 빠뜨리면 실제 결함이 된다(리다이렉트가 500 이 된다, DSN 없는 환경마다 제한 초과 줄이 찍힌다) |
| 5 | 닫힌 목록의 초기값(§4.2) | 전수 조사와 sandbox 응답으로 만든다 | 조사가 필요 없는 것만 넣는다. 오류 이름: ECMAScript, fetch 의 `AbortError`·`TimeoutError`, 설치된 `@supabase/auth-js`·`postgrest-js` 의 이름, 이 저장소가 정의한 오류. 오류 코드: RFC 6749 의 OAuth 코드, 이 저장소의 코드가 이미 비교하는 SQLSTATE·PostgREST 코드. 사건 코드: 계약 함수의 대체 코드 하나와 테스트 라우트용 다섯 | 전수 조사는 호출부를 옮기는 PR 3·4 의 첫 단계다. PayPal·PortOne·Kakao 의 코드는 그때 더한다 |
| 6 | `droppedFields` | 버린 필드의 이름 | 정해진 필드 이름과 `code`·`fields`·`other` 만 | 호출부가 넘긴 키 이름도 밖에서 온 문자열일 수 있다(외부 응답을 펼쳐 넘기는 경우) |
| 7 | 테스트 환경 | 언급 없음 | `vitest.setup.ts` 의 `window` 사용부를 `typeof window !== 'undefined'` 로 감싼다. 서버 전용 코드의 테스트는 `// @vitest-environment node` 로 돈다 | 경계 함수는 서버용 `unstable_rethrow` 로 시험해야 한다. jsdom 테스트의 동작은 그대로다(전체 3,170건 통과 확인) |

## Global Constraints

- 머지는 곧 Production 배포다(Preview 없음). **머지는 사용자 승인 뒤에만 한다.**
- **호출부를 옮기지 않는다.** `app/**`, `lib/**`, `components/**` 의 파일을 바꾸지 않는다. lint 규칙도 켜지 않는다(둘 다 PR 3·4).
- `logError` 의 동기 시그니처와 동작을 바꾸지 않는다. `SentryLogTarget` 의 `await import` 를 그대로 둔다.
- `sentry.*.config.js`, `instrumentation.ts`, `instrumentation-client.ts`, `next.config.js` 를 바꾸지 않는다.
- 가린 기록의 문자열은 닫힌 목록에서 고른 값이거나 형식을 검증한 값뿐이다. 원본 오류의 `message`·`stack`·`cause`·그 밖의 속성, 호출부가 넘긴 키 이름을 싣지 않는다.
- `utils/log-safe-error.ts` 는 브라우저 번들에도 들어간다. `next/server`, `node:*`, `server-only` 를 import 하지 않는다. `after` 와 `AsyncLocalStorage` 는 `utils/with-safe-errors.ts`(`import 'server-only'`)에만 둔다.
- 필드 형식(설계 §4.2): `userId` UUID, `paymentId`·`orderId`·`productId` `[A-Za-z0-9_-]{1,64}`, `httpStatus` 100~599 정수, `errorCode` 표에 있는 값(없으면 `'unknown'`), `amount` 유한한 수, `currency` `[A-Z]{3}`.
- flush 제한은 2000ms, 제한 초과 줄은 정확히 `[sentry] flush timeout` 이다(설계 §4.3).
- 테스트용 라우트(`scripts/envelope-test/routes/**`)에 비밀처럼 보이는 값(`cnry`, `eyJ`)을 두지 않는다. 실행기가 요청 헤더로 넘긴다.
- 로컬 `next build`·`next start` 는 운영 Sentry 로 보고하지 않게 한다. envelope 테스트는 DSN 을 로컬 수집기로 돌린다. vitest 의 실제 SDK 테스트는 transport 를 가짜로 바꿔 네트워크로 나가지 않는다.
- 결제 로직을 바꾸지 않는다. 결제 계약 테스트 17건과 `it.fails` 6건은 그대로 통과해야 한다.
- DB 스키마·마이그레이션 변경 없음.
- CI(UTC 러너): `npx tsc --noEmit`, `npm run lint`, `npm test` 가 통과해야 한다.
- 커밋은 Conventional Commits. 문서(`docs/`)도 같은 브랜치에 커밋한다.
- 고위험(개인정보·인증·결제)이다. Codex `gpt-6-sol`/high 교차 리뷰를 받는다.

## Review Focus

설계가 말하지 않았지만 실제로 만나게 될 입력이다. 각 줄의 테스트는 표시한 작업에 들어 있다.

1. **감싼 핸들러가 `redirect()`·`notFound()` 를 부르거나 Next 가 동적 렌더링 신호를 던진다.** 오류가 아니다. 500 으로 바꾸거나 로그로 남기면 안 되고 그대로 올려보내야 한다. → Task 4 (`Next 의 제어 흐름`, 실제 Next 오류 객체로)
2. **`after()` 를 쓸 수 없다.** 결제 계약 테스트(#88)처럼 핸들러를 직접 부르면 요청 범위가 없어 `after` 가 던진다. 경계는 그래도 응답을 돌려줘야 한다. → Task 4 (`after 를 쓸 수 없는 환경에서도 응답을 돌려준다`)
3. **한 인스턴스가 여러 요청을 동시에 처리한다(Fluid Compute).** 오류를 기록한 요청만 flush 를 걸어야 한다. 옆 요청의 기록을 세면 "기록하지 않은 요청에서 0번"이 깨진다. → Task 4 (`동시에 처리 중인 다른 요청의 기록을 세지 않는다`)
4. **계약 함수에 이상한 값이 들어온다.** `error` 가 `null`·문자열·읽으면 던지는 Proxy, 이름이 비밀인 오류, `fields` 가 배열이거나 던지는 getter 를 가졌거나 정해지지 않은 키를 가진 경우, 목록에 없는 사건 코드. 던지지 않고, 새지 않고, 기록은 남아야 한다. → Task 1, Task 3
5. **SDK 가 초기화되지 않았거나(DSN 없음) `Sentry.flush` 가 던진다.** 제한 초과가 아닌데 `[sentry] flush timeout` 이 찍히면 안 되고, `after` 콜백 밖으로 던져 Next 가 오류 객체를 통째로 찍게 해도 안 된다. → Task 4 (`flush 의 결과`)

## 파일 구조

| 파일 | 작업 | 역할 |
|---|---|---|
| `utils/log-event-codes.ts` | 새로 (Task 1) | 사건 코드의 닫힌 목록, `LogEventCode`, `isLogEventCode` |
| `utils/log-known-errors.ts` | 새로 (Task 1) | 오류 이름 표와 `knownErrorName`, 오류 코드 표와 `knownErrorCode` |
| `utils/logger-types.ts` · `utils/logger.ts` · `utils/logger-targets.ts` | 수정 (Task 2) | `LogEntry.fingerprint`, `Logger.safeError`, Sentry target 이 fingerprint 를 넘긴다 |
| `utils/log-safe-error.ts` | 새로 (Task 3) | 계약 함수: `buildSafeRecord`, `logSafeError`, `setSafeErrorListener`. 브라우저 번들에도 들어간다 |
| `utils/with-safe-errors.ts` | 새로 (Task 4) | 경계 함수 `withSafeErrors`. 서버 전용 |
| `vitest.setup.ts` | 수정 (Task 4) | `window` 사용부를 가드로 감싼다 |
| `__tests__/utils/log-event-codes.test.ts` · `log-known-errors.test.ts` · `log-safe-error.test.ts` · `with-safe-errors.test.ts` | 새로 (Task 1·3·4) | 단위 테스트 |
| `__tests__/utils/logger.test.ts` · `logger-sentry-target.test.ts` | 수정 (Task 2) | `safeError` 와 fingerprint |
| `__tests__/utils/log-safe-error-delivery.test.ts` | 새로 (Task 5) | 실제 SDK 로 도는 전달 테스트(CI) |
| `scripts/envelope-test/analyze.js` | 수정 (Task 6) | 가린 기록의 모양(type, fingerprint, `contexts.log`)과 서버 출력의 줄 수 판정 |
| `scripts/envelope-test/scenario.js` · `routes/_lib/envtest.ts` | 수정 (Task 7) | 경계 요청 둘과 canary, 기대값 |
| `scripts/envelope-test/routes/boundary-throw/route.ts` · `boundary-handled/route.ts` · `boundary-hostile/route.ts` · `boundary-self-throw/route.ts` · `boundary-redirect/route.ts` | 새로 (Task 7·교차 리뷰 수정) | 경계로 감싼 테스트 라우트 |
| `scripts/envelope-test/harness.js` | 새로 (Task 8) | 두 시나리오가 같이 쓰는 것(포트, 압축 풀기, `next start`, 기다리기) |
| `scripts/envelope-test/delivery.js` | 새로 (Task 8) | 전달 시나리오: 단계, 판정(`evaluateDelivery`), 실행(`runDelivery`) |
| `scripts/envelope-test/routes/_lib/delivery-probe.ts` · `delivery-plain/route.ts` · `delivery-safe/route.ts` · `delivery-control/route.ts` | 새로 (Task 8) | 전달 시나리오의 테스트 라우트와 탐침 |
| `scripts/envelope-test/run.js` | 수정 (Task 8) | 누출 시나리오 뒤에 전달 시나리오를 돌린다. `--only=leak\|delivery` |
| `__tests__/scripts/envelope-test-analyze.test.ts` · `envelope-test-routes.test.ts` | 수정 (Task 6·7·8) | 판정과 라우트 목록 |
| `__tests__/scripts/envelope-test-delivery.test.ts` | 새로 (Task 8) | 전달 판정의 단위 테스트(CI) |
| `docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md` · `utils/log-error.ts`(주석) | 수정 (Task 9) | 실측 반영 |

## 설계에서 구체화한 것

1. **기록을 내보내는 길은 기존 `Logger` 다.** `logSafeError` 는 가린 기록으로 `Error`(이름·사건 코드·호출 지점 stack)와 context(통과한 필드, `droppedFields`)를 만들어 `logger.safeError(code, error, context)` 에 넘긴다. `Logger.writeLog` 가 `LogEntry` 하나를 만들어 두 target 에 넘기므로 "Console 과 Sentry 가 같은 기록을 받는다"가 구조로 지켜진다. target 을 따로 부르는 새 경로를 만들지 않는다.
2. **Console 줄은 동기다.** `logger.safeError()` 는 `async` 지만 첫 `await` 앞에서 `targets.map(target => target.write(entry))` 가 돌고, `ConsoleLogTarget.write` 에는 `await` 가 없다. `logSafeError` 가 돌아왔을 때 줄은 이미 찍혀 있다. 테스트가 `await` 없이 단언한다.
3. **stack 은 위치만 싣는다.** 첫 줄은 표에서 고른 오류 이름과 사건 코드다. `Error.prepareStackTrace` 를 동기 구간에서 잠깐 바꿔 구조화된 CallSite 를 받고 스크립트 이름·줄·칸만으로 프레임을 만든 뒤 원래 훅을 복원한다. 함수 이름은 값에서 올 수 있어 싣지 않는다. 스크립트 주소의 쿼리·fragment 는 버리고, 이 API 가 없는 엔진에서는 프레임을 생략한다.
4. **목록에 없는 사건 코드.** 타입은 `as any` 를 막지 못한다. 런타임에 목록에 없으면 `log.invalid_event_code` 로 바꾸고 `droppedFields` 에 `code` 를 적는다. 로그를 통째로 버리지 않는다 — 오류가 났다는 사실은 남아야 한다.
5. **필드의 세부.** 값이 `undefined`·`null` 이면 버린 것으로 세지 않는다. `errorCode` 는 표에 없으면 `'unknown'` 으로 바꾸고 버린 것으로 세지 않는다(설계의 "없으면 `'unknown'`"). 정해지지 않은 키는 값도 이름도 싣지 않고 `other` 하나로만 남긴다. `fields` 가 객체가 아니거나 읽다가 던지면 읽다 만 값까지 버리고 `fields` 를 적는다.
6. **"요청당 한 번"을 아는 방법.** 경계가 요청마다 `AsyncLocalStorage` 에 `{ recorded: false }` 를 두고, `logSafeError` 가 부르는 등록 함수(경계 파일이 모듈을 불러올 때 등록한다)가 지금 요청의 표시를 켠다. 핸들러가 끝난 뒤 표시가 켜져 있으면 `after` 를 한 번 건다. `logSafeError` 를 핸들러의 인자로 넘겨받게 하면 깊은 곳의 헬퍼(`lib/payment/**`)가 남긴 기록을 세지 못한다.
7. **`Sentry.flush(2000)` 이 기다리는 시간.** 2초는 처리 대기와 전송 대기에 각각 적용된다(`client.flush`: `_isClientDoneProcessing(timeout)` 뒤 `transport.flush(timeout)`). 이론상 최대 4초다. 측정에서는 제한 초과 때 약 2.0초에 끝났다. 오류를 기록한 요청은 응답 뒤에 함수 인스턴스를 그만큼 더 붙잡는다.
8. **남는 한계.** (a) 형식이 맞는 토큰을 ID 자리에 넘기면 그대로 남는다(설계 §6.4). 테스트로 고정한다. (b) 핸들러가 끝난 뒤에 남긴 기록은 그 요청의 flush 가 기다리지 않는다. 테스트로 고정한다. (c) 경계가 잡은 예외는 원본 메시지와 stack 을 잃는다 — 원인은 사건 코드(라우트)와 오류 이름으로 좁힌다(결정 3). (d) `Logger.safeError` 는 공개 메서드다. PR 3 의 lint 는 결제·인증 경로에서 `logError`·`console.*` 와 함께 `@/utils/logger` 의 직접 import 도 막아야 한다.

---

### Task 0: 워크트리와 기준선

**Files:** 없음.

- [ ] **Step 1: 워크트리를 확인한다**

워크트리 `/Users/charlie.hyun/Repositories/picnic-web-log-redaction-contract`, 브랜치 `feat/log-redaction-contract`(origin/main `39ddc313` 에서 만들었다). `.env.local`·`.env.vercel` 을 복사했고 `npm ci` 를 돌렸다.

Run: `git -C /Users/charlie.hyun/Repositories/picnic-web-log-redaction-contract status --short --untracked-files=all && git -C /Users/charlie.hyun/Repositories/picnic-web-log-redaction-contract log --oneline -1`
Expected: 이 계획 문서의 커밋만 있고 작업 트리가 깨끗하다.

- [ ] **Step 2: 기준선을 잰다**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 타입 검사와 lint 통과. `Test Files 198 passed (198)`, `Tests 3170 passed | 6 expected fail | 1 skipped (3177)`.

---

### Task 1: 닫힌 목록 — 사건 코드, 오류 이름, 오류 코드

**Files:**
- Create: `utils/log-event-codes.ts`
- Create: `utils/log-known-errors.ts`
- Test: `__tests__/utils/log-event-codes.test.ts`
- Test: `__tests__/utils/log-known-errors.test.ts`

**Interfaces:**
- Produces: `LOG_EVENT_CODES`(readonly 배열), `type LogEventCode`, `FALLBACK_EVENT_CODE: LogEventCode`, `isLogEventCode(value: unknown): value is LogEventCode`
- Produces: `KNOWN_ERROR_NAMES`, `type KnownErrorName`, `knownErrorName(error: unknown): KnownErrorName`, `KNOWN_ERROR_CODES`, `type KnownErrorCode`, `UNKNOWN_ERROR_CODE = 'unknown'`, `knownErrorCode(value: unknown): KnownErrorCode | 'unknown'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/utils/log-event-codes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FALLBACK_EVENT_CODE, LOG_EVENT_CODES, isLogEventCode } from '@/utils/log-event-codes';

describe('사건 코드 목록', () => {
  it('중복이 없다', () => {
    expect(new Set(LOG_EVENT_CODES).size).toBe(LOG_EVENT_CODES.length);
  });

  // 코드는 Sentry 의 예외 값과 서버 로그의 첫 줄에 그대로 나간다. URL·공백·대문자가 섞인 값을 목록에 넣지 못하게 한다.
  it.each([...LOG_EVENT_CODES])('%s 는 점으로 나눈 소문자 마디 둘 이상이다', (code) => {
    expect(code).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    expect(code.length).toBeLessThanOrEqual(80);
  });

  it('목록의 값은 사건 코드다', () => {
    for (const code of LOG_EVENT_CODES) expect(isLogEventCode(code)).toBe(true);
    expect(isLogEventCode(FALLBACK_EVENT_CODE)).toBe(true);
  });

  it.each([
    ['목록에 없는 문자열', 'payment.made_up.code'],
    ['목록의 값에 덧붙인 문자열', 'envtest.boundary.unhandled?code=cnry'],
    ['빈 문자열', ''],
    ['Object.prototype 의 키', 'constructor'],
    ['__proto__', '__proto__'],
    ['숫자', 1],
    ['null', null],
    ['undefined', undefined],
    ['문자열로 바뀌는 객체', { toString: () => 'envtest.boundary.unhandled' }],
    ['배열', ['envtest.boundary.unhandled']],
  ])('%s 은(는) 사건 코드가 아니다', (_label, value) => {
    expect(isLogEventCode(value)).toBe(false);
  });
});
```

`__tests__/utils/log-known-errors.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import {
  AuthApiError,
  AuthError,
  AuthImplicitGrantRedirectError,
  AuthInvalidCredentialsError,
  AuthInvalidJwtError,
  AuthInvalidTokenResponseError,
  AuthPKCECodeVerifierMissingError,
  AuthPKCEGrantCodeExchangeError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  AuthWeakPasswordError,
  PostgrestError,
} from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  KNOWN_ERROR_CODES,
  KNOWN_ERROR_NAMES,
  UNKNOWN_ERROR_CODE,
  knownErrorCode,
  knownErrorName,
} from '@/utils/log-known-errors';

const root = process.cwd();

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

describe('알려진 오류 이름 표', () => {
  it('중복이 없고 첫 값이 Error 다', () => {
    expect(new Set(KNOWN_ERROR_NAMES).size).toBe(KNOWN_ERROR_NAMES.length);
    expect(KNOWN_ERROR_NAMES[0]).toBe('Error');
  });

  // 표의 이름이 설치된 라이브러리가 실제로 쓰는 이름인지 본다. 라이브러리가 이름을 바꾸면 여기서 드러난다.
  it.each([
    new AuthError('m'),
    new AuthApiError('m', 400, 'c'),
    new AuthUnknownError('m', null),
    new AuthSessionMissingError(),
    new AuthInvalidTokenResponseError(),
    new AuthInvalidCredentialsError('m'),
    new AuthImplicitGrantRedirectError('m'),
    new AuthPKCEGrantCodeExchangeError('m'),
    new AuthPKCECodeVerifierMissingError(),
    new AuthRetryableFetchError('m', 0),
    new AuthWeakPasswordError('m', 422, []),
    new AuthInvalidJwtError('m'),
    new PostgrestError({ message: 'm', details: 'd', hint: 'h', code: 'c' }),
    new TypeError('m'),
    new RangeError('m'),
    new SyntaxError('m'),
    new ReferenceError('m'),
    new URIError('m'),
    new EvalError('m'),
    new AggregateError([], 'm'),
    new DOMException('m', 'AbortError'),
    new DOMException('m', 'TimeoutError'),
  ])('$name 을 그대로 남긴다', (error) => {
    expect(KNOWN_ERROR_NAMES).toContain(error.name);
    expect(knownErrorName(error)).toBe(error.name);
  });

  it('이 저장소가 정의한 오류 이름이 모두 표에 있다', () => {
    const files = [...walk(path.join(root, 'utils/error')), ...walk(path.join(root, 'lib'))];
    const names = files.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/this\.name\s*=\s*['"]([A-Za-z]+)['"]/g)].map((match) => match[1]),
    );
    expect(names.length).toBeGreaterThan(5);
    for (const name of new Set(names)) {
      expect(KNOWN_ERROR_NAMES, `${name} 이 utils/log-known-errors.ts 의 표에 없다`).toContain(name);
    }
  });

  it('Error 가 아닌 객체의 name 도 표에서 고른다', () => {
    expect(knownErrorName({ name: 'AuthApiError', message: 'plain object' })).toBe('AuthApiError');
  });

  it.each([
    ['표에 없는 이름', Object.assign(new Error('x'), { name: 'CnryNameError' })],
    ['비밀이 든 이름', Object.assign(new Error('x'), { name: 'Bearer cnry-secret-token-1234567890' })],
    ['Object.prototype 의 키', { name: 'constructor' }],
    ['문자열로 바뀌는 객체', { name: { toString: () => 'TypeError' } }],
    ['이름이 없는 객체', { message: 'x' }],
    ['문자열', 'TypeError'],
    ['숫자', 500],
    ['null', null],
    ['undefined', undefined],
    ['함수', TypeError],
  ])('%s 은(는) Error 로 남긴다', (_label, value) => {
    expect(knownErrorName(value)).toBe('Error');
  });

  it('name 을 읽다가 던져도 Error 로 남긴다', () => {
    const throwing = Object.defineProperty({}, 'name', {
      get() {
        throw new Error('cnry getter');
      },
    });
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error('cnry proxy');
        },
      },
    );
    expect(knownErrorName(throwing)).toBe('Error');
    expect(knownErrorName(proxy)).toBe('Error');
  });
});

describe('알려진 오류 코드 표', () => {
  it('중복이 없고 unknown 은 표에 없다', () => {
    expect(new Set(KNOWN_ERROR_CODES).size).toBe(KNOWN_ERROR_CODES.length);
    expect(KNOWN_ERROR_CODES).not.toContain(UNKNOWN_ERROR_CODE);
  });

  it.each([...KNOWN_ERROR_CODES])('%s 를 그대로 남긴다', (code) => {
    expect(knownErrorCode(code)).toBe(code);
  });

  it.each([
    ['표에 없는 코드', 'made_up_code'],
    // 코드처럼 생긴 비밀. 형식 검사로는 가릴 수 없어 표로 고른다(설계 §4.2).
    ['코드 모양의 비밀', 'CNRY_BEARER_91c2'],
    ['SQLSTATE 모양이지만 표에 없는 값', '99999'],
    ['대소문자가 다른 값', 'INVALID_GRANT'],
    ['앞뒤 공백', ' invalid_grant'],
    ['Object.prototype 의 키', 'constructor'],
    ['숫자', 23505],
    ['null', null],
    ['undefined', undefined],
    ['문자열로 바뀌는 객체', { toString: () => 'invalid_grant' }],
  ])('%s 은(는) unknown 으로 남긴다', (_label, value) => {
    expect(knownErrorCode(value)).toBe('unknown');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/utils/log-event-codes.test.ts __tests__/utils/log-known-errors.test.ts`
Expected: FAIL. 두 파일 모두 `Failed to resolve import "@/utils/log-event-codes"`·`"@/utils/log-known-errors"`(모듈이 없다).

- [ ] **Step 3: 구현한다**

`utils/log-event-codes.ts`:

```ts
/**
 * logSafeError 가 받는 사건 코드의 닫힌 목록 (설계 §4.2).
 *
 * 코드는 문자열을 조립해 만들지 않는다. 새 사건은 이 파일에 한 줄을 더해 만든다.
 * 타입은 `as any` 로 넘긴 값을 막지 못하므로 런타임에도 목록을 확인한다. 목록에 없으면
 * FALLBACK_EVENT_CODE 로 바꿔 남긴다 — 오류가 났다는 사실까지 버리지는 않는다.
 *
 * 모양: 점으로 나눈 소문자 마디 둘 이상(`payment.paypal.capture.failed`).
 * 단위 테스트(__tests__/utils/log-event-codes.test.ts)가 모양과 중복을 고정한다.
 */
export const LOG_EVENT_CODES = [
  // 계약 함수가 스스로 쓴다: 호출부가 목록에 없는 코드를 넘겼다.
  'log.invalid_event_code',
  // envelope·전달 테스트용 라우트(scripts/envelope-test/routes/)가 쓴다. 운영 코드는 쓰지 않는다.
  'envtest.boundary.unhandled',
  'envtest.boundary.handled',
  'envtest.boundary.hostile',
  'envtest.boundary.self_throw',
  'envtest.delivery.unhandled',
  'envtest.delivery.handled',
] as const;

export type LogEventCode = (typeof LOG_EVENT_CODES)[number];

export const FALLBACK_EVENT_CODE: LogEventCode = 'log.invalid_event_code';

const CODES: ReadonlySet<unknown> = new Set(LOG_EVENT_CODES);

export function isLogEventCode(value: unknown): value is LogEventCode {
  return CODES.has(value);
}
```

`utils/log-known-errors.ts`:

```ts
/**
 * logSafeError 가 남기는 오류 이름과 오류 코드의 닫힌 목록 (설계 §4.2).
 *
 * 오류의 name 과 공급자가 돌려준 code 는 밖에서 정한 문자열이다. 형식 검사로는 그 값이 비밀인지
 * 가릴 수 없으므로 표에 있는 값만 남긴다. 표에 없으면 이름은 'Error', 코드는 'unknown' 이 된다.
 * 표를 넓히는 일은 이 파일을 고치는 PR 로만 한다.
 */

export const KNOWN_ERROR_NAMES = [
  // ECMAScript
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'URIError',
  'EvalError',
  'AggregateError',
  // fetch · AbortController · AbortSignal.timeout 의 DOMException
  'AbortError',
  'TimeoutError',
  // @supabase/auth-js
  'AuthError',
  'AuthApiError',
  'AuthUnknownError',
  'AuthSessionMissingError',
  'AuthInvalidTokenResponseError',
  'AuthInvalidCredentialsError',
  'AuthImplicitGrantRedirectError',
  'AuthPKCEGrantCodeExchangeError',
  'AuthPKCECodeVerifierMissingError',
  'AuthRetryableFetchError',
  'AuthWeakPasswordError',
  'AuthInvalidJwtError',
  // @supabase/postgrest-js
  'PostgrestError',
  // 이 저장소가 정의한 오류
  'AppError',
  'DataFetchingError',
  'SocialAuthError',
  'AntiAbuseError',
  'AntiAbusePermissionError',
  'WithdrawnUserError',
  'SupabaseError',
  'SupabaseAuthError',
  'SupabaseStorageError',
  'SupabasePostgrestError',
] as const;

export type KnownErrorName = (typeof KNOWN_ERROR_NAMES)[number];

const NAMES: ReadonlySet<unknown> = new Set(KNOWN_ERROR_NAMES);

/** 오류의 이름을 표에서 고른다. 표에 없거나 읽을 수 없으면 'Error' 다. 던지지 않는다. */
export function knownErrorName(error: unknown): KnownErrorName {
  try {
    if (typeof error !== 'object' || error === null) return 'Error';
    const name = (error as { name?: unknown }).name;
    return NAMES.has(name) ? (name as KnownErrorName) : 'Error';
  } catch {
    // name 이 던지는 getter 였다.
    return 'Error';
  }
}

export const KNOWN_ERROR_CODES = [
  // OAuth 2.0 (RFC 6749 §4.1.2.1, §5.2)
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'unsupported_response_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
  // PostgreSQL SQLSTATE — 이 저장소의 코드가 이미 비교하는 값
  '22001',
  '22003',
  '22P02',
  '23502',
  '23503',
  '23505',
  '23514',
  '28P01',
  '42501',
  '42703',
  '42P01',
  // PostgREST — 같은 기준
  'PGRST116',
  'PGRST204',
  'PGRST301',
  'PGRST403',
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export const UNKNOWN_ERROR_CODE = 'unknown';

const ERROR_CODES: ReadonlySet<unknown> = new Set(KNOWN_ERROR_CODES);

/** 공급자가 돌려준 오류 코드를 표에서 고른다. 표에 없으면 'unknown' 이다. */
export function knownErrorCode(value: unknown): KnownErrorCode | typeof UNKNOWN_ERROR_CODE {
  return ERROR_CODES.has(value) ? (value as KnownErrorCode) : UNKNOWN_ERROR_CODE;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/utils/log-event-codes.test.ts __tests__/utils/log-known-errors.test.ts`
Expected: PASS (두 파일).

- [ ] **Step 5: 커밋한다**

```bash
git add utils/log-event-codes.ts utils/log-known-errors.ts __tests__/utils/log-event-codes.test.ts __tests__/utils/log-known-errors.test.ts
git commit -m "feat(logging): 사건 코드와 알려진 오류 이름·코드의 닫힌 목록을 둔다"
```

---

### Task 2: Logger 의 가린 기록 경로

**Files:**
- Modify: `utils/logger-types.ts` (`LogEntry`)
- Modify: `utils/logger.ts` (`writeLog`, 새 메서드 `safeError`)
- Modify: `utils/logger-targets.ts` (`SentryLogTarget.write`)
- Test: `__tests__/utils/logger.test.ts`, `__tests__/utils/logger-sentry-target.test.ts`

**Interfaces:**
- Produces: `LogEntry.fingerprint?: string[]`, `Logger.safeError(code: string, error: Error, context: Record<string, unknown>): Promise<void>` — ERROR 수준, `message = code`, `fingerprint = ['{{ default }}', code]`, `user`·`request` 없음.

- [ ] **Step 1: 실패하는 테스트를 더한다**

```diff
--- a/__tests__/utils/logger.test.ts
+++ b/__tests__/utils/logger.test.ts
@@ -183,6 +183,33 @@ describe('Logger', () => {
     });
   });

+  describe('safeError', () => {
+    it('writes an ERROR entry whose message and fingerprint carry the event code', async () => {
+      const error = new TypeError('payment.x.failed');
+      await loggerInstance.safeError('payment.x.failed', error, { httpStatus: 502 });
+
+      expect(mockTarget.write).toHaveBeenCalledTimes(1);
+      const entry = (mockTarget.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as LogEntry;
+      expect(entry).toMatchObject({
+        level: LogLevel.ERROR,
+        message: 'payment.x.failed',
+        context: { httpStatus: 502 },
+        error: { name: 'TypeError', message: 'payment.x.failed', stack: error.stack },
+        fingerprint: ['{{ default }}', 'payment.x.failed'],
+      });
+      // 가린 기록에는 사용자와 요청 정보가 없다.
+      expect(entry.user).toBeUndefined();
+      expect(entry.request).toBeUndefined();
+    });
+
+    it('does not add a fingerprint to entries written by the other methods', async () => {
+      await loggerInstance.error('boom', new Error('boom'));
+
+      const entry = (mockTarget.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as LogEntry;
+      expect(entry.fingerprint).toBeUndefined();
+    });
+  });
+
   describe('fatal', () => {
     it('writes fatal log entry', async () => {
       await loggerInstance.fatal('fatal error');
```

```diff
--- a/__tests__/utils/logger-sentry-target.test.ts
+++ b/__tests__/utils/logger-sentry-target.test.ts
@@ -74,6 +74,15 @@ describe('SentryLogTarget', () => {
     expect((options as any).user).toMatchObject({ id: 'u1' });
   });

+  it('forwards the fingerprint when the entry has one, and adds no key otherwise', async () => {
+    const target = new SentryLogTarget();
+    await target.write(entry(LogLevel.ERROR, { fingerprint: ['{{ default }}', 'payment.x.failed'] }));
+    await target.write(entry(LogLevel.ERROR));
+
+    expect((captureException.mock.calls[0][1] as any).fingerprint).toEqual(['{{ default }}', 'payment.x.failed']);
+    expect(captureException.mock.calls[1][1]).not.toHaveProperty('fingerprint');
+  });
+
   it('never throws when Sentry itself fails', async () => {
     captureException.mockImplementationOnce(() => { throw new Error('sentry down'); });

```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/utils/logger.test.ts __tests__/utils/logger-sentry-target.test.ts`
Expected: FAIL 2건. `loggerInstance.safeError is not a function`, 그리고 Sentry target 의 `expected undefined to deeply equal [ '{{ default }}', 'payment.x.failed' ]`. (`does not add a fingerprint…` 는 지금도 통과한다 — 다른 메서드가 fingerprint 를 싣지 않는다는 것을 고정하는 테스트다.)

- [ ] **Step 3: 구현한다**

```diff
--- a/utils/logger-types.ts
+++ b/utils/logger-types.ts
@@ -45,6 +45,8 @@ export interface LogEntry {
   environment: string;
   service: string;
   version?: string;
+  /** Sentry 이슈를 가르는 기준. 가린 기록(Logger.safeError)만 쓴다. Console target 은 찍지 않는다. */
+  fingerprint?: string[];
 }

 /**
```

```diff
--- a/utils/logger.ts
+++ b/utils/logger.ts
@@ -68,7 +68,8 @@ export class Logger {
       userAgent?: string;
       ip?: string;
       headers?: Record<string, string>;
-    }
+    },
+    fingerprint?: string[]
   ): Promise<void> {
     const entry: LogEntry = {
       timestamp: new Date().toISOString(),
@@ -103,6 +104,10 @@ export class Logger {
       entry.request = request;
     }

+    if (fingerprint) {
+      entry.fingerprint = fingerprint;
+    }
+
     // 모든 타겟에 로그 작성
     await Promise.allSettled(
       this.targets.map(target => target.write(entry))
@@ -151,6 +156,16 @@ export class Logger {
     await this.writeLog(LogLevel.ERROR, message, context, error, user, request);
   }

+  /**
+   * 가린 기록 전용. utils/log-safe-error.ts 만 부른다 — 사건 코드, 호출 지점에서 만든 Error, 계약을 통과한 필드.
+   *
+   * 사건 코드를 Sentry 의 fingerprint 에 더한다. 경계 함수(withSafeErrors)가 잡은 예외는 호출 지점이 모두 같다.
+   * Sentry 는 stack 이 있으면 stack 으로 이슈를 묶으므로, 그대로 두면 서로 다른 라우트의 오류가 한 이슈로 묶일 수 있다.
+   */
+  async safeError(code: string, error: Error, context: Record<string, unknown>): Promise<void> {
+    await this.writeLog(LogLevel.ERROR, code, context, error, undefined, undefined, ['{{ default }}', code]);
+  }
+
   /**
    * 치명적 에러 로그
    */
```

```diff
--- a/utils/logger-targets.ts
+++ b/utils/logger-targets.ts
@@ -82,6 +82,7 @@ export class SentryLogTarget implements LogTarget {
           ...(entry.version ? { version: entry.version } : {}),
         },
         user: entry.user,
+        ...(entry.fingerprint ? { fingerprint: entry.fingerprint } : {}),
         contexts: {
           log: {
             timestamp: entry.timestamp,
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/utils/logger.test.ts __tests__/utils/logger-sentry-target.test.ts __tests__/utils/log-error.test.ts`
Expected: PASS. `logError` 의 테스트도 그대로 통과한다(동작을 바꾸지 않았다).

- [ ] **Step 5: 커밋한다**

```bash
git add utils/logger-types.ts utils/logger.ts utils/logger-targets.ts __tests__/utils/logger.test.ts __tests__/utils/logger-sentry-target.test.ts
git commit -m "feat(logging): Logger 에 가린 기록 전용 경로와 fingerprint 를 더한다"
```

---

### Task 3: 계약 함수 `logSafeError`

**Files:**
- Create: `utils/log-safe-error.ts`
- Test: `__tests__/utils/log-safe-error.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `isLogEventCode`·`FALLBACK_EVENT_CODE`·`knownErrorName`·`knownErrorCode`, Task 2 의 `logger.safeError`
- Produces:
  - `type SafeLogFields = { userId?: string; paymentId?: string; orderId?: string; productId?: string; httpStatus?: number; errorCode?: string; amount?: number; currency?: string }`
  - `type DroppedField = keyof SafeLogFields | 'code' | 'fields' | 'other'`
  - `type SafeLogRecord = { code: LogEventCode; errorName: KnownErrorName; fields: SafeLogFields; droppedFields: DroppedField[] }`
  - `buildSafeRecord(code: unknown, error: unknown, fields?: unknown): SafeLogRecord` — 던지지 않는다
  - `logSafeError(code: LogEventCode, error: unknown, fields?: SafeLogFields): void` — 동기, 던지지 않는다
  - `setSafeErrorListener(listener: (() => void) | undefined): void` — Task 4 가 쓴다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/utils/log-safe-error.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { buildSafeRecord } from '@/utils/log-safe-error';

const USER_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

/** 어느 sink 에도 나오면 안 되는 값. 전부 'cnry' 가 들어 있다. */
const CANARY = {
  name: 'CnryNameError',
  message: 'cnry-message https://pay.example/callback?code=cnry-query',
  stack: 'cnry-stack',
  cause: 'cnry-cause',
  prop: 'cnry-prop',
  errorCode: 'CNRY_ERRORCODE_91c2',
  paymentId: 'cnry.payment/id',
  userId: 'cnry-user-not-a-uuid',
  currency: 'cnry',
  key: 'cnryKey',
};

function hostileError(): Error {
  const error = new Error(CANARY.message, { cause: new Error(CANARY.cause) });
  error.name = CANARY.name;
  error.stack = `${CANARY.name}: ${CANARY.message}\n    at https://app.example/chunk.js?token=${CANARY.stack}:1:1`;
  Object.assign(error, { response: { body: CANARY.prop }, code: CANARY.errorCode });
  return error;
}

/** 값 안의 모든 문자열. Error 는 열거되지 않는 name·message·stack·cause 까지 본다. 객체의 키도 센다. */
function strings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null || seen.has(value)) return [];
  seen.add(value);
  const hidden = value instanceof Error ? [value.name, value.message, value.stack, (value as { cause?: unknown }).cause] : [];
  return [...hidden, ...Object.keys(value), ...Object.values(value)].flatMap((item) => strings(item, seen));
}

describe('buildSafeRecord', () => {
  it('계약을 통과한 필드를 그대로 남긴다', () => {
    const fields = {
      userId: USER_ID,
      paymentId: 'pay_20261006-ABC',
      orderId: '5O190127TN364715T',
      productId: 'star_candy_100',
      httpStatus: 502,
      errorCode: 'invalid_grant',
      amount: 9900,
      currency: 'KRW',
    };
    expect(buildSafeRecord('envtest.boundary.handled', new TypeError('x'), fields)).toEqual({
      code: 'envtest.boundary.handled',
      errorName: 'TypeError',
      fields,
      droppedFields: [],
    });
  });

  it('넘겨받은 객체를 그대로 쓰지 않고 새로 만든다', () => {
    const fields = { userId: USER_ID };
    const record = buildSafeRecord('envtest.boundary.handled', undefined, fields);
    expect(record.fields).toEqual(fields);
    expect(record.fields).not.toBe(fields);
  });

  it.each([
    ['userId', 'not-a-uuid'],
    ['userId', `${USER_ID}\n`],
    ['userId', ` ${USER_ID}`],
    ['userId', 12345],
    ['paymentId', 'pay/2026'],
    ['paymentId', 'https://pay.example/p?id=1'],
    ['paymentId', 'a'.repeat(65)],
    ['paymentId', ''],
    ['paymentId', 'pay 1'],
    ['paymentId', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln'],
    ['orderId', { id: 'order_1' }],
    ['productId', ['p1']],
    ['httpStatus', '502'],
    ['httpStatus', 99],
    ['httpStatus', 600],
    ['httpStatus', 200.5],
    ['httpStatus', Number.NaN],
    ['amount', '9900'],
    ['amount', Number.POSITIVE_INFINITY],
    ['amount', Number.NaN],
    ['currency', 'krw'],
    ['currency', 'KRWX'],
    ['currency', 'KR'],
  ])('형식에 맞지 않는 %s(%j)는 버리고 이름만 남긴다', (name, value) => {
    const record = buildSafeRecord('envtest.boundary.handled', undefined, { [name]: value });
    expect(record.fields).toEqual({});
    expect(record.droppedFields).toEqual([name]);
  });

  it.each([
    ['0', 0],
    ['음수(환불)', -9900],
    ['소수', 9.99],
  ])('amount 는 유한한 수면 남긴다: %s', (_label, amount) => {
    expect(buildSafeRecord('envtest.boundary.handled', undefined, { amount }).fields).toEqual({ amount });
  });

  it('httpStatus 는 100 과 599 를 포함한다', () => {
    expect(buildSafeRecord('envtest.boundary.handled', undefined, { httpStatus: 100 }).fields).toEqual({ httpStatus: 100 });
    expect(buildSafeRecord('envtest.boundary.handled', undefined, { httpStatus: 599 }).fields).toEqual({ httpStatus: 599 });
  });

  it('표에 없는 errorCode 는 unknown 으로 바꾼다 — 버린 필드로 세지 않는다', () => {
    const record = buildSafeRecord('envtest.boundary.handled', undefined, { errorCode: CANARY.errorCode });
    expect(record.fields).toEqual({ errorCode: 'unknown' });
    expect(record.droppedFields).toEqual([]);
  });

  it('값이 없는 필드(undefined, null)는 버린 것으로 세지 않는다', () => {
    const record = buildSafeRecord('envtest.boundary.handled', undefined, { userId: undefined, paymentId: null, errorCode: null });
    expect(record).toMatchObject({ fields: {}, droppedFields: [] });
  });

  it('정해지지 않은 키는 값도 이름도 싣지 않고 other 로만 남긴다', () => {
    const record = buildSafeRecord('envtest.boundary.handled', undefined, {
      userId: USER_ID,
      [CANARY.key]: 'cnry-value',
      email: 'cnry@example.com',
    });
    expect(record.fields).toEqual({ userId: USER_ID });
    expect(record.droppedFields).toEqual(['other']);
    expect(strings(record).join('\n')).not.toMatch(/cnry/i);
  });

  it.each([
    ['문자열', 'cnry-fields'],
    ['배열', [{ userId: USER_ID }]],
    ['숫자', 1],
  ])('fields 가 객체가 아니면(%s) 통째로 버린다', (_label, fields) => {
    expect(buildSafeRecord('envtest.boundary.handled', undefined, fields)).toMatchObject({ fields: {}, droppedFields: ['fields'] });
  });

  it('fields 를 읽다가 던지면 읽다 만 값까지 버린다', () => {
    const fields = {
      userId: USER_ID,
      get paymentId(): string {
        throw new Error('cnry getter');
      },
    };
    expect(buildSafeRecord('envtest.boundary.handled', undefined, fields)).toMatchObject({ fields: {}, droppedFields: ['fields'] });
  });

  it('취소된 Proxy 가 fields 여도 던지지 않는다', () => {
    const { proxy, revoke } = Proxy.revocable({ userId: USER_ID }, {});
    revoke();

    expect(buildSafeRecord('envtest.boundary.handled', undefined, proxy)).toEqual({
      code: 'envtest.boundary.handled',
      errorName: 'Error',
      fields: {},
      droppedFields: ['fields'],
    });
  });

  it('Symbol 키와 열거되지 않는 키도 정해지지 않은 키로 센다', () => {
    const withSymbol = { userId: USER_ID, [Symbol('cnry-symbol')]: 'cnry-value' };
    const withHidden = Object.defineProperty({ userId: USER_ID }, 'cnryHidden', { value: 'cnry-value', enumerable: false });

    for (const fields of [withSymbol, withHidden]) {
      const record = buildSafeRecord('envtest.boundary.handled', undefined, fields);
      expect(record.fields).toEqual({ userId: USER_ID });
      expect(record.droppedFields).toEqual(['other']);
      expect(strings(record).join('\n')).not.toMatch(/cnry/i);
    }
  });

  it('목록에 없는 사건 코드는 대체 코드로 바꾸고 code 를 버린 필드에 적는다', () => {
    const record = buildSafeRecord(`payment.${CANARY.key}.failed`, undefined, { httpStatus: 'x' });
    expect(record.code).toBe('log.invalid_event_code');
    expect(record.droppedFields).toEqual(['code', 'httpStatus']);
    expect(strings(record).join('\n')).not.toMatch(/cnry/i);
  });

  it('오류에서 쓰는 것은 이름 하나다. 표에 없는 이름은 Error 가 된다', () => {
    const record = buildSafeRecord('envtest.boundary.unhandled', hostileError());
    expect(record).toEqual({ code: 'envtest.boundary.unhandled', errorName: 'Error', fields: {}, droppedFields: [] });
  });

  // 남는 위험(설계 §6.4)을 고정한다. 형식 검사는 값이 비밀인지 가리지 못한다.
  it('형식이 맞는 값은 무엇이든 남는다 — ID 자리에 토큰을 넘기지 않는 것은 호출부의 몫이다', () => {
    const record = buildSafeRecord('envtest.boundary.handled', undefined, { paymentId: 'CANARY_BEARER_91c2' });
    expect(record.fields).toEqual({ paymentId: 'CANARY_BEARER_91c2' });
  });
});

describe('logSafeError', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let logSafeError: typeof import('@/utils/log-safe-error').logSafeError;
  let setSafeErrorListener: typeof import('@/utils/log-safe-error').setSafeErrorListener;

  beforeEach(async () => {
    captureException.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // 운영의 로거는 Console 과 Sentry 두 target 을 쓴다. 싱글턴이 모듈을 불러올 때 환경을 읽으므로 다시 불러온다.
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    ({ logSafeError, setSafeErrorListener } = await import('@/utils/log-safe-error'));
  });

  afterEach(() => {
    vi.doUnmock('@/utils/log-known-errors');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const sentryCall = async () => {
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    const [error, options] = captureException.mock.calls[0] as [Error, Record<string, any>];
    return { error, options };
  };

  it('Console 줄은 함수가 돌아오기 전에 찍힌다', () => {
    logSafeError('envtest.boundary.handled', new Error('x'));

    // await 가 없다. 핸들러가 이 호출 직후에 응답해도 줄은 이미 서버 출력에 있다(설계 §4.3 의 1).
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] ERROR: envtest\.boundary\.handled$/);
  });

  it('원본 오류의 이름·메시지·stack·cause·속성과 계약 밖의 값이 어느 target 에도 없다', async () => {
    logSafeError('envtest.boundary.handled', hostileError(), {
      userId: CANARY.userId,
      paymentId: CANARY.paymentId,
      errorCode: CANARY.errorCode,
      currency: CANARY.currency,
      [CANARY.key]: 'cnry-value',
    } as Record<string, unknown>);

    const sentry = await sentryCall();
    expect(strings(consoleError.mock.calls).join('\n')).not.toMatch(/cnry/i);
    expect(strings([sentry.error, sentry.options]).join('\n')).not.toMatch(/cnry/i);
  });

  it('Console 과 Sentry 가 같은 기록을 받는다', async () => {
    logSafeError('envtest.boundary.handled', new TypeError('cnry-message'), {
      userId: USER_ID,
      paymentId: 'pay_1',
      httpStatus: 502,
      errorCode: 'invalid_grant',
      currency: 'krw',
    });

    const sentry = await sentryCall();
    const logData = consoleError.mock.calls[0][1] as Record<string, any>;
    const expectedContext = {
      userId: USER_ID,
      paymentId: 'pay_1',
      httpStatus: 502,
      errorCode: 'invalid_grant',
      droppedFields: ['currency'],
    };

    expect(logData.message).toBe('envtest.boundary.handled');
    expect(logData.context).toEqual(expectedContext);
    expect(logData.error).toEqual({ name: 'TypeError', message: 'envtest.boundary.handled', stack: sentry.error.stack });

    expect(sentry.error.name).toBe('TypeError');
    expect(sentry.error.message).toBe('envtest.boundary.handled');
    const { timestamp, ...sentryContext } = sentry.options.contexts.log;
    expect(timestamp).toBe(logData.timestamp);
    expect(sentryContext).toEqual(expectedContext);
    expect(sentry.options.contexts.request).toBeUndefined();
    expect(sentry.options.user).toBeUndefined();
  });

  it('stack 은 부른 자리에서 새로 만든다 — 첫 줄은 이름과 사건 코드, 첫 프레임은 호출부다', async () => {
    logSafeError('envtest.boundary.unhandled', hostileError());

    const { error } = await sentryCall();
    const lines = (error.stack ?? '').split('\n');
    expect(lines[0]).toBe('Error: envtest.boundary.unhandled');
    expect(lines[1]).toContain('log-safe-error.test.ts');
    expect(error.stack).not.toContain('at logSafeError');
  });

  it('stack 에는 위치만 싣는다. 함수 이름은 싣지 않는다', async () => {
    logSafeError('envtest.boundary.unhandled', new Error('x'));

    const { error } = await sentryCall();
    const frames = (error.stack ?? '').split('\n').slice(1);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) expect(frame).toMatch(/^ {4}at \S.*:\d+:\d+$/);
  });

  // 함수 이름은 코드가 아니라 값에서 올 수 있다: { [action]() { … } } 의 action 이 요청 값이면 V8 은 그것을 프레임에 적는다.
  it.each([
    [
      '값으로 이름 붙인 메서드',
      (log: () => void) => {
        const name = 'cnryComputedMethod';
        const holder: Record<string, () => void> = {
          [name]() {
            log();
          },
        };
        holder[name]();
      },
    ],
    [
      '값을 키로 삼아 부른 함수',
      (log: () => void) => {
        const holder: Record<string, () => void> = {};
        holder['cnryAliasKey'] = function plain() {
          log();
        };
        holder['cnryAliasKey']();
      },
    ],
    [
      '이름에 줄바꿈과 위치 모양을 넣은 함수',
      (log: () => void) => {
        const name = 'cnryForged\n    at /cnry/forged/location.js:1:2\n    cnryTail';
        const holder: Record<string, () => void> = {
          [name]() {
            log();
          },
        };
        holder[name]();
      },
    ],
    [
      '값으로 이름 붙인 클래스의 메서드',
      (log: () => void) => {
        const name = 'CnryDynamicClass';
        const Dynamic = { [name]: class { run() { log(); } } }[name];
        new Dynamic().run();
      },
    ],
  ])('호출부의 함수 이름이 값에서 온 것이어도 새지 않는다: %s', async (_label, call) => {
    call(() => logSafeError('envtest.boundary.handled', new Error('x')));

    const sentry = await sentryCall();
    expect(strings([consoleError.mock.calls, sentry.error, sentry.options]).join('\n')).not.toMatch(/cnry/i);
    // 위치는 남는다.
    expect(sentry.error.stack).toMatch(/log-safe-error\.test\.ts:\d+:\d+/);
  });

  it.each([
    ['fields', (proxy: object) => [new Error('x'), proxy] as const],
    ['error', (proxy: object) => [proxy, { userId: USER_ID }] as const],
  ])('취소된 Proxy 가 %s 여도 로그 한 줄은 남는다', async (_label, args) => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const [error, fields] = args(proxy);

    expect(() => logSafeError('envtest.boundary.handled', error, fields as Record<string, unknown>)).not.toThrow();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('ERROR: envtest.boundary.handled');
    await sentryCall();
  });

  // 계약 함수 안에서 예상하지 못한 예외가 나도 "가린 로그 한 줄"은 지켜야 한다(설계 §4.3 의 1).
  it('기록을 만들다가 던져도 상수만 든 기록으로 로그 한 줄을 남긴다', async () => {
    vi.resetModules();
    vi.doMock('@/utils/log-known-errors', () => ({
      knownErrorName: () => {
        throw new Error('cnry-internal-failure');
      },
      knownErrorCode: () => 'unknown',
    }));
    const fresh = await import('@/utils/log-safe-error');

    expect(() => fresh.logSafeError('envtest.boundary.handled', new Error('x'), { userId: USER_ID })).not.toThrow();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('ERROR: envtest.boundary.handled');
    const logData = consoleError.mock.calls[0][1] as Record<string, any>;
    expect(logData.context).toEqual({ droppedFields: ['fields'] });
    expect(logData.error.name).toBe('Error');
    expect(strings(consoleError.mock.calls).join('\n')).not.toMatch(/cnry/i);
  });

  it('사건 코드로 Sentry 이슈를 가른다', async () => {
    logSafeError('envtest.boundary.unhandled', new Error('x'));

    const { options } = await sentryCall();
    expect(options.fingerprint).toEqual(['{{ default }}', 'envtest.boundary.unhandled']);
    expect(options.level).toBe('error');
  });

  it('필드가 없으면 버린 필드 목록도 싣지 않는다', async () => {
    logSafeError('envtest.boundary.unhandled', new Error('x'));

    const { options } = await sentryCall();
    expect(Object.keys(options.contexts.log)).toEqual(['timestamp']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['문자열', 'cnry string error'],
    ['숫자', 500],
    ['읽으면 던지는 Proxy', new Proxy({}, { get: () => { throw new Error('cnry proxy'); } })],
  ])('오류가 %s 여도 던지지 않고 남긴다', async (_label, error) => {
    expect(() => logSafeError('envtest.boundary.unhandled', error)).not.toThrow();

    const sentry = await sentryCall();
    expect(sentry.error.name).toBe('Error');
    expect(strings([consoleError.mock.calls, sentry.error, sentry.options]).join('\n')).not.toMatch(/cnry/i);
  });

  it('Sentry 가 던져도 던지지 않는다', async () => {
    captureException.mockImplementationOnce(() => {
      throw new Error('sentry down');
    });

    expect(() => logSafeError('envtest.boundary.unhandled', new Error('x'))).not.toThrow();
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
  });

  it('남길 때마다 등록된 함수를 한 번 부르고, 그 함수가 던져도 던지지 않는다', () => {
    const listener = vi.fn();
    setSafeErrorListener(listener);
    logSafeError('envtest.boundary.handled', new Error('x'));
    logSafeError('envtest.boundary.handled', new Error('x'));
    expect(listener).toHaveBeenCalledTimes(2);

    setSafeErrorListener(() => {
      throw new Error('listener down');
    });
    expect(() => logSafeError('envtest.boundary.handled', new Error('x'))).not.toThrow();

    setSafeErrorListener(undefined);
    expect(() => logSafeError('envtest.boundary.handled', new Error('x'))).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/utils/log-safe-error.test.ts`
Expected: FAIL. `Failed to resolve import "@/utils/log-safe-error"`.

- [ ] **Step 3: 구현한다**

`utils/log-safe-error.ts`:

```ts
/**
 * 결제·인증 경로의 오류 로그 (설계 §4.2).
 *
 * logError 와 달리 넘겨받은 값을 그대로 쓰지 않는다. 계약을 통과한 값으로 **가린 기록을 새로 만들어**
 * Console 과 Sentry 두 target 에 같은 기록을 넘긴다.
 *
 *   - 사건 코드: 닫힌 목록(log-event-codes.ts)에서만 고른다.
 *   - 오류: 이름 하나만 쓴다. 알려진 이름 표에 없으면 'Error' 다. 원본의 message·stack·cause 는 쓰지 않는다.
 *   - stack: 이 함수를 부른 자리에서 새로 만든다. 위치(스크립트 이름·줄·칸)만 싣고 함수 이름은 싣지 않는다 —
 *     함수 이름은 값에서 올 수 있다.
 *   - 필드: 이름이 정해진 여덟 개뿐이다. 형식에 맞지 않으면 버리고 그 이름만 droppedFields 에 남긴다.
 *
 * 형식 검사는 값이 비밀인지 가리지 못한다. 형식이 맞는 토큰을 ID 자리에 넘기면 그대로 남는다(설계 §6.4).
 *
 * 이 파일은 브라우저 번들에도 들어간다(lib/supabase/social/**). 서버 전용 코드(next/server, node:*)를
 * import 하지 않는다. 요청당 한 번의 flush 는 서버 전용 파일 with-safe-errors.ts 가 맡는다.
 */
import { FALLBACK_EVENT_CODE, isLogEventCode, type LogEventCode } from './log-event-codes';
import { knownErrorCode, knownErrorName, type KnownErrorName } from './log-known-errors';
import { logger } from './logger';

export type SafeLogFields = {
  /** 사용자 UUID */
  userId?: string;
  /** [A-Za-z0-9_-]{1,64} */
  paymentId?: string;
  /** [A-Za-z0-9_-]{1,64} */
  orderId?: string;
  /** [A-Za-z0-9_-]{1,64} */
  productId?: string;
  /** 100~599 의 정수 */
  httpStatus?: number;
  /** 알려진 코드 표(log-known-errors.ts)에 있는 값. 표에 없으면 'unknown' 으로 남는다 */
  errorCode?: string;
  /** 유한한 수 */
  amount?: number;
  /** [A-Z]{3} */
  currency?: string;
};

type FieldName = keyof SafeLogFields;

/** droppedFields 에 들어갈 수 있는 이름. 호출부가 넘긴 키 이름을 그대로 싣지 않는다. */
export type DroppedField = FieldName | 'code' | 'fields' | 'other';

export type SafeLogRecord = {
  code: LogEventCode;
  errorName: KnownErrorName;
  fields: SafeLogFields;
  droppedFields: DroppedField[];
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY = /^[A-Z]{3}$/;

const matching = (pattern: RegExp) => (value: unknown) =>
  typeof value === 'string' && pattern.test(value) ? value : undefined;

/** 필드마다 값을 검증해 남길 값을 돌려준다. undefined 는 "버린다"는 뜻이다. */
const FIELD_RULES: { [Name in FieldName]: (value: unknown) => SafeLogFields[Name] | undefined } = {
  userId: matching(UUID),
  paymentId: matching(ID),
  orderId: matching(ID),
  productId: matching(ID),
  httpStatus: (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined,
  errorCode: knownErrorCode,
  amount: (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined),
  currency: matching(CURRENCY),
};

const FIELD_NAMES = Object.keys(FIELD_RULES) as FieldName[];
const FIELD_NAME_SET: ReadonlySet<string> = new Set(FIELD_NAMES);

function readFields(fields: unknown): { fields: SafeLogFields; dropped: DroppedField[] } {
  if (fields === undefined || fields === null) return { fields: {}, dropped: [] };

  try {
    // 여기부터는 무엇이든 던질 수 있다. 취소된 Proxy 는 Array.isArray 에서도 던진다.
    if (typeof fields !== 'object' || Array.isArray(fields)) return { fields: {}, dropped: ['fields'] };
    const source = fields as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    const dropped: DroppedField[] = [];
    for (const name of FIELD_NAMES) {
      const value = source[name];
      // 값이 없는 것은 버린 것이 아니다.
      if (value === undefined || value === null) continue;
      const checked = FIELD_RULES[name](value);
      if (checked === undefined) dropped.push(name);
      else safe[name] = checked;
    }
    // 정해지지 않은 키는 값도 이름도 싣지 않는다. 있었다는 사실만 남긴다. Symbol 키와 열거되지 않는 키도 센다.
    if (Reflect.ownKeys(source).some((key) => typeof key !== 'string' || !FIELD_NAME_SET.has(key))) dropped.push('other');
    return { fields: safe as SafeLogFields, dropped };
  } catch {
    // getter 나 Proxy 가 던졌다. 읽다 만 값은 버린다.
    return { fields: {}, dropped: ['fields'] };
  }
}

/**
 * 넘겨받은 값으로 가린 기록을 새로 만든다. 던지지 않는다.
 * 인자의 타입이 unknown 인 것은 런타임에 무엇이 들어와도 같은 계약을 적용하기 위해서다.
 */
export function buildSafeRecord(code: unknown, error: unknown, fields?: unknown): SafeLogRecord {
  const safeCode = isLogEventCode(code) ? code : FALLBACK_EVENT_CODE;
  const read = readFields(fields);
  return {
    code: safeCode,
    errorName: knownErrorName(error),
    fields: read.fields,
    droppedFields: safeCode === code ? read.dropped : ['code', ...read.dropped],
  };
}

/**
 * 호출 지점의 위치만으로 stack 의 프레임을 만든다.
 *
 * 엔진이 만들어 주는 stack 문자열은 쓰지 않는다. 그 문자열에는 함수 이름이 들어가는데, 함수 이름은 코드가 아니라
 * 값에서 올 수 있다: `{ [action]() { … } }` 의 action 이 요청 값이면 V8 은 그것을 프레임에 적는다. 이름에 줄바꿈을
 * 넣으면 위치처럼 생긴 줄도 만들 수 있어, 문자열을 걸러서는 막지 못한다. 그래서 구조화된 호출 지점(CallSite)에서
 * 스크립트 이름·줄·칸만 꺼낸다. 스크립트 이름은 번들의 것이다.
 *
 * 이 API(V8)가 없는 엔진에서는 프레임을 싣지 않는다. Error.prepareStackTrace 는 잠깐 바꿨다가 되돌린다 —
 * 그 사이에 다른 코드가 끼어들 틈이 없다(동기 구간이다).
 */
function locationFrames(below: (...args: never[]) => unknown): string[] {
  if (typeof Error.captureStackTrace !== 'function') return [];

  const previous = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_error, sites) => sites;
    const holder: { stack?: unknown } = {};
    Error.captureStackTrace(holder, below);
    const sites = holder.stack;
    if (!Array.isArray(sites)) return [];

    const frames: string[] = [];
    for (const site of sites as NodeJS.CallSite[]) {
      const file = site.getScriptNameOrSourceURL() ?? site.getFileName();
      const line = site.getLineNumber();
      if (typeof file !== 'string' || file === '' || /[\r\n]/.test(file) || typeof line !== 'number') continue;
      const column = site.getColumnNumber();
      // 브라우저의 스크립트 주소에는 쿼리가 붙을 수 있다.
      frames.push(`    at ${file.replace(/[?#].*$/, '')}:${line}:${typeof column === 'number' ? column : 0}`);
    }
    return frames;
  } catch {
    return [];
  } finally {
    Error.prepareStackTrace = previous;
  }
}

/** 기록을 만들다가 던져도 가린 로그 한 줄은 남긴다(설계 §4.3 의 1). 여기의 대체 기록은 상수뿐이다. */
function recordFor(code: unknown, error: unknown, fields: unknown): SafeLogRecord {
  try {
    return buildSafeRecord(code, error, fields);
  } catch {
    return {
      code: isLogEventCode(code) ? code : FALLBACK_EVENT_CODE,
      errorName: 'Error',
      fields: {},
      droppedFields: ['fields'],
    };
  }
}

type Listener = () => void;
let onRecorded: Listener | undefined;

/**
 * 가린 기록이 남을 때마다 부를 함수를 등록한다. 서버 전용 경계(with-safe-errors.ts)만 쓴다 —
 * "이 요청에서 오류를 기록했는가"를 알아야 요청당 한 번만 flush 를 걸 수 있다(설계 §4.3).
 */
export function setSafeErrorListener(listener: Listener | undefined): void {
  onRecorded = listener;
}

/**
 * 계약을 통과한 값만 콘솔과 Sentry 로 남긴다. 반환값이 없는 동기 함수이고 던지지 않는다.
 *
 * Console target 은 이 호출이 돌아오기 전에 찍는다(Logger.writeLog 의 첫 await 앞에서 target.write 가 불린다).
 * Sentry 전송은 기다리지 않는다. 핸들러가 끝나기 전에 부르면 SDK 의 route handler 래퍼가 건 flush 가 기다린다.
 */
export function logSafeError(code: LogEventCode, error: unknown, fields?: SafeLogFields): void {
  try {
    const record = recordFor(code, error, fields);

    // stack 은 우리가 만든다: 첫 줄은 표에서 고른 이름과 사건 코드, 나머지는 호출 지점의 위치뿐이다.
    const callSite = new Error(record.code);
    callSite.name = record.errorName;
    callSite.stack = [`${record.errorName}: ${record.code}`, ...locationFrames(logSafeError)].join('\n');

    const context: Record<string, unknown> = { ...record.fields };
    if (record.droppedFields.length > 0) context.droppedFields = record.droppedFields;

    void logger.safeError(record.code, callSite, context)?.catch?.(() => undefined);
  } catch {
    // 로깅 실패가 요청을 깨뜨리면 안 된다.
  }

  try {
    onRecorded?.();
  } catch {
    // 위와 같다.
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/utils/log-safe-error.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add utils/log-safe-error.ts __tests__/utils/log-safe-error.test.ts
git commit -m "feat(logging): 계약을 통과한 값만 남기는 logSafeError 를 더한다"
```

---

### Task 4: 경계 함수 `withSafeErrors`

**Files:**
- Create: `utils/with-safe-errors.ts`
- Modify: `vitest.setup.ts`
- Test: `__tests__/utils/with-safe-errors.test.ts`

**Interfaces:**
- Consumes: Task 3 의 `logSafeError`, `setSafeErrorListener`
- Produces: `withSafeErrors<Args extends unknown[]>(code: LogEventCode, handler: (...args: Args) => Response | Promise<Response>): (...args: Args) => Promise<Response>`, `FLUSH_TIMEOUT_MS = 2000`, `FLUSH_TIMEOUT_LINE = '[sentry] flush timeout'`, `FLUSH_FAILED_LINE = '[sentry] flush failed'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/utils/with-safe-errors.test.ts`:

```ts
// @vitest-environment node
// 서버 전용 코드다. window 가 없는 환경에서 돌려야 next/navigation 이 서버용 unstable_rethrow 를 고른다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  flush: vi.fn(),
  getClient: vi.fn(),
}));

// after 는 Next 의 요청 범위 안에서만 동작한다. 여기서는 등록된 콜백을 받아 두고 직접 돌린다.
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@sentry/nextjs', () => ({ flush: mocks.flush, getClient: mocks.getClient }));
// 공용 setup 은 next/navigation 을 대역으로 바꾼다. 경계 함수는 실제 unstable_rethrow 와 실제 Next 오류로 시험한다.
vi.unmock('next/navigation');

import { createRequire } from 'module';
import { inspect } from 'node:util';

import { DynamicServerError, isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from 'next/dist/client/components/http-access-fallback/http-access-fallback';
import {
  getRedirectError,
  getRedirectStatusCodeFromError,
  getRedirectTypeFromError,
  getURLFromRedirectError,
} from 'next/dist/client/components/redirect';
import { isRedirectError, type RedirectError } from 'next/dist/client/components/redirect-error';
import { unstable_rethrow as nextRethrow } from 'next/dist/client/components/unstable-rethrow.server';
import { isDynamicPostpone } from 'next/dist/server/app-render/dynamic-rendering';
import { isHangingPromiseRejectionError } from 'next/dist/server/dynamic-rendering-utils';
import { isPostpone } from 'next/dist/server/lib/router-utils/is-postpone';
import { BailoutToCSRError, isBailoutToCSRError } from 'next/dist/shared/lib/lazy-dynamic/bailout-to-csr';
import { forbidden, notFound, permanentRedirect, redirect, RedirectType, unauthorized, unstable_rethrow } from 'next/navigation';

import { logSafeError } from '@/utils/log-safe-error';
import { FLUSH_FAILED_LINE, FLUSH_TIMEOUT_LINE, FLUSH_TIMEOUT_MS, withSafeErrors } from '@/utils/with-safe-errors';

const request = () => new Request('http://localhost/api/payment/x?code=cnry-query');

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('던지지 않았다');
}

/** unstable_rethrow(Next 15.5.26)가 그대로 올려보내는 신호의 판정 함수 전부. isNextRouterError 는 앞의 둘을 묶은 것이다. */
const NEXT_SIGNAL_FAMILIES: Array<(value: unknown) => boolean> = [
  isRedirectError,
  isHTTPAccessFallbackError,
  isBailoutToCSRError,
  isDynamicServerError,
  isDynamicPostpone,
  isPostpone,
  isHangingPromiseRejectionError,
];

/** forbidden()·unauthorized() 는 experimental.authInterrupts 가 켜진 빌드에서만 신호를 던진다. */
function caughtWithAuthInterrupts(run: () => unknown): unknown {
  vi.stubEnv('__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS', 'true');
  try {
    return caught(run);
  } finally {
    vi.unstubAllEnvs();
  }
}

const nodeRequire = createRequire(import.meta.url);

/** React 가 던지는 postpone. 이 저장소의 react(18)에는 없어서 Next 가 싣고 다니는 React 의 것을 쓴다. */
function reactPostpone(reason: string): unknown {
  const react = nodeRequire('next/dist/compiled/react-experimental') as { unstable_postpone: (reason: string) => never };
  return caught(() => react.unstable_postpone(reason));
}

/** prerender 가 끝난 뒤의 요청 API 가 내는 거부. Next 는 이 함수의 타입을 내보내지 않는다. */
function hangingPromiseRejection(): Promise<unknown> {
  const { makeHangingPromise } = nodeRequire('next/dist/server/dynamic-rendering-utils') as {
    makeHangingPromise: (signal: AbortSignal, route: string, expression: string) => Promise<never>;
  };
  return makeHangingPromise(AbortSignal.abort(), '/api/payment/x', '`cookies()`').catch((error: unknown) => error);
}

// Next 의 createPostponeReason 이 만드는 문장이다. 그 함수는 내보내지 않으므로 isDynamicPostpone 으로 확인하고 쓴다.
const DYNAMIC_POSTPONE_REASON =
  'Route /api/payment/x needs to bail out of prerendering at this point because it used cookies(). ' +
  'React throws this special object to indicate where. It should not be caught by your own try/catch. ' +
  'Learn more: https://nextjs.org/docs/messages/ppr-caught-error';

/** unstable_rethrow 가 올려보내는 신호의 계열 전부. 값은 Next·React 가 실제로 던지는 것이고, 어느 계열인지는 Next 의 판정 함수로 확인한다. */
const NEXT_SIGNALS: Array<[string, (value: unknown) => boolean, () => unknown]> = [
  ['redirect()', isRedirectError, () => caught(() => redirect('/login'))],
  ['permanentRedirect()', isRedirectError, () => caught(() => permanentRedirect('/login'))],
  ['notFound()', isHTTPAccessFallbackError, () => caught(() => notFound())],
  ['forbidden()', isHTTPAccessFallbackError, () => caughtWithAuthInterrupts(() => forbidden())],
  ['unauthorized()', isHTTPAccessFallbackError, () => caughtWithAuthInterrupts(() => unauthorized())],
  ['클라이언트 렌더링으로 넘기는 신호', isBailoutToCSRError, () => new BailoutToCSRError('cnry bailout')],
  ['동적 렌더링 신호', isDynamicServerError, () => new DynamicServerError('cnry dynamic')],
  ['동적 postpone', isDynamicPostpone, () => new Error(DYNAMIC_POSTPONE_REASON)],
  ['React postpone', isPostpone, () => reactPostpone('cnry postpone')],
  ['prerender 뒤의 거부', isHangingPromiseRejectionError, () => hangingPromiseRejection()],
];

/**
 * 경계가 올려보낸 신호를 Next 가 어느 계열로 보아야 하는가. 던진 값과 같은 계열이다.
 * 메시지로 판정되는 동적 postpone 만 다르다. Next 는 그것을 언제나 React 의 postpone 으로 던지므로(두 표식을 다 가진다),
 * 새 신호에도 두 표식을 다 싣는다 — 던진 값의 $$typeof 는 Next 가 읽지 않으므로 경계도 읽지 않고, 정해 둔 값을 쓴다.
 */
function propagatedFamilies(isFamily: (value: unknown) => boolean): Array<(value: unknown) => boolean> {
  return isFamily === isDynamicPostpone ? [isDynamicPostpone, isPostpone] : [isFamily];
}

/** 신호가 판정된 뒤에야 읽힐 수 있는 속성. Next 가 판정을 끝낸 뒤라면 읽지 않는다. */
const LATE_KEYS = ['message', '$$typeof', 'cause'];

/** 읽으면 다른 오류를 던지는 getter 를 단다. */
function makeUnreadable(value: unknown, key: string): void {
  Object.defineProperty(value as object, key, {
    get() {
      throw new Error(`cnry-late-getter ${key} https://pay.example/cb?code=cnry`);
    },
  });
}

/** 값을 감싸 무엇을 읽는지 적는다. 같은 읽기는 처음 한 번만, 읽은 순서대로 남긴다. */
function recording(target: object): { proxy: object; reads: string[] } {
  const reads: string[] = [];
  const note = (entry: string) => {
    if (!reads.includes(entry)) reads.push(entry);
  };
  const proxy = new Proxy(target, {
    get(inner, key) {
      note(`get ${String(key)}`);
      return Reflect.get(inner, key);
    },
    has(inner, key) {
      note(`has ${String(key)}`);
      return Reflect.has(inner, key);
    },
    getPrototypeOf(inner) {
      note('getPrototypeOf');
      return Reflect.getPrototypeOf(inner);
    },
    ownKeys(inner) {
      note('ownKeys');
      return Reflect.ownKeys(inner);
    },
    getOwnPropertyDescriptor(inner, key) {
      note(`getOwnPropertyDescriptor ${String(key)}`);
      return Reflect.getOwnPropertyDescriptor(inner, key);
    },
  });
  return { proxy, reads };
}

type Outcome = { thrown: unknown } | { response: Response };

/** 경계 밖으로 나온 것. 값을 Promise 의 결과로 그대로 넘기지 않는다 — then 을 읽는다. */
function throughBoundary(value: unknown): Promise<Outcome> {
  return withSafeErrors('envtest.boundary.unhandled', async () => {
    throw value;
  })().then(
    (response) => ({ response }),
    (thrown: unknown) => ({ thrown }),
  );
}

type OwnedSignal = Error & { digest?: string; $$typeof?: symbol };

/** 경계가 만든 신호가 가질 수 있는 속성. 모두 문자열이나 Symbol 이다. */
const OWNED_KEYS = ['$$typeof', 'digest', 'message', 'stack'];

/**
 * 경계가 올려보낸 것은 경계가 새로 만든 신호다. 던진 값도, 그 값의 어느 부분도 아니다.
 * originals 는 던진 값과 그 안에 든 값(cause)이다. 확인한 뒤 올려보낸 신호를 돌려준다.
 */
function freshSignal(outcome: Outcome, originals: unknown[]): OwnedSignal {
  expect('thrown' in outcome, '신호를 올려보내지 않았다').toBe(true);
  const thrown = (outcome as { thrown: unknown }).thrown;
  // 가장 먼저 본다. 던진 값이 그대로 나왔다면 아래의 읽기가 그 값의 getter 를 건드린다.
  expect(originals.includes(thrown), '던진 값을 그대로 올려보냈다').toBe(false);

  expect(Object.prototype.toString.call(thrown)).toBe('[object Error]');
  const signal = thrown as OwnedSignal;
  expect(Object.getPrototypeOf(signal)).toBe(Error.prototype);
  expect(signal.name).toBe('Error');
  // 가진 것은 값 속성 몇 개뿐이다. getter 도, cause 도, 던진 값이 달고 온 다른 속성도 없다.
  expect(Reflect.ownKeys(signal).map(String).filter((key) => !OWNED_KEYS.includes(key))).toEqual([]);
  for (const key of ['$$typeof', 'digest', 'message']) {
    const descriptor = Object.getOwnPropertyDescriptor(signal, key);
    if (descriptor) expect(['string', 'symbol'], key).toContain(typeof descriptor.value);
  }
  // stack 은 첫 줄뿐이다. 엔진이 만든 stack 에는 호출한 함수의 이름이 들어가는데, 이름은 값에서 올 수 있다.
  expect(signal.stack).toBe(`Error: ${signal.message}`);
  expect(inspect(signal, { showHidden: true, depth: 10 })).not.toMatch(/cnry/i);
  // Next 는 이 값을 몇 번을 읽어도 신호로 본다.
  expect(caught(() => nextRethrow(signal)) === signal).toBe(true);
  expect(caught(() => nextRethrow(signal)) === signal).toBe(true);
  return signal;
}

/** Next 가 redirect 신호에서 꺼내 쓰는 값. */
function redirectOf(signal: unknown): { url: string; type: string; status: number } {
  const error = signal as RedirectError;
  return {
    url: getURLFromRedirectError(error),
    type: getRedirectTypeFromError(error),
    status: getRedirectStatusCodeFromError(error),
  };
}

/** 신호에 요청 값처럼 보이는 것을 잔뜩 단다. 판정에 쓰이는 속성은 Next 가 여전히 같은 계열로 보게 둔다. */
function decorate(signal: unknown): void {
  const target = signal as Error & Record<string | symbol, unknown>;
  target.message = `${target.message} cnry-message user@cnry.invalid`;
  target.name = 'CnrySecretName';
  target.stack = 'CnrySecretName: cnry-stack\n    at cnryHandler (https://pay.example/app.js?code=cnry:1:1)';
  target.cause = new Error('cnry-cause');
  target.user = { email: 'user@cnry.invalid' };
  // 예전 Next 는 redirect 신호에 쿠키를 실어 보냈다. 지금은 요청 저장소에서 꺼낸다.
  target.mutableCookies = { session: 'cnry-cookie' };
  target[Symbol('cnry-symbol')] = 'cnry-symbol-value';
  Object.defineProperty(target, 'token', { value: 'cnry-token', enumerable: false });
}

/** digest 가 처음 validReads 번만 redirect() 의 것이고 그 뒤로는 평범한 문자열인 값. 읽은 횟수를 센다. */
function statefulRedirect(validReads: number): { signal: Error; reads: () => number } {
  const signal = caught(() => redirect('/login')) as Error & { digest: string };
  const real = signal.digest;
  let reads = 0;
  Object.defineProperty(signal, 'digest', {
    get() {
      reads += 1;
      return reads <= validReads ? real : 'cnry-ordinary-digest';
    },
  });
  decorate(signal);
  return { signal, reads: () => reads };
}

describe('withSafeErrors', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.after.mockReset();
    mocks.flush.mockReset().mockResolvedValue(true);
    mocks.getClient.mockReset().mockReturnValue({});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 경계가 after 에 건 콜백. 응답이 나간 뒤 Next 가 돌리는 것을 흉내 낸다. */
  const runScheduledFlush = async () => {
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await (mocks.after.mock.calls[0][0] as () => Promise<void>)();
  };

  /** 던진 값이 밖으로 나가지 않고, 가린 로그 한 줄과 고정된 500 으로 끝난다. */
  const expectSafe500 = async (handler: () => Promise<Response>) => {
    // 밖으로 나온 값을 테스트 실행기에 넘기지 않는다. 읽으면 던지는 값이라 실패 보고가 깨진다.
    const response = await withSafeErrors('envtest.boundary.unhandled', handler)().catch(() => null);

    expect(response, '던진 값이 경계 밖으로 나갔다').not.toBeNull();
    if (response === null) return;
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toContain('ERROR: envtest.boundary.unhandled');
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/cnry/i);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  };

  /** 신호를 올려보낸 요청은 기록도 flush 도 남기지 않는다. */
  const expectQuiet = () => {
    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  };

  describe('오류가 없을 때', () => {
    it('인자를 그대로 넘기고 핸들러의 응답을 그대로 돌려준다', async () => {
      const handler = vi.fn(async (_request: Request, _context: { params: Promise<{ id: string }> }) =>
        Response.json({ ok: true }, { status: 201 }),
      );
      const incoming = request();
      const context = { params: Promise.resolve({ id: '1' }) };

      const response = await withSafeErrors('envtest.boundary.unhandled', handler)(incoming, context);

      expect(handler).toHaveBeenCalledWith(incoming, context);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ ok: true });
    });

    it('기록이 없으면 flush 를 걸지 않고 아무것도 찍지 않는다', async () => {
      await withSafeErrors('envtest.boundary.unhandled', async () => Response.json({ ok: true }))();

      expect(mocks.after).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('Promise 가 아닌 응답도 받는다', async () => {
      const response = await withSafeErrors('envtest.boundary.unhandled', () => new Response('ok'))();
      expect(await response.text()).toBe('ok');
    });
  });

  describe('핸들러가 던질 때', () => {
    it('고정된 500 을 돌려주고, 본문과 서버 출력에 원본 메시지가 없다', async () => {
      const handler = async (_request: Request): Promise<Response> => {
        throw new Error('cnry-message https://pay.example/cb?code=cnry-query');
      };

      const response = await withSafeErrors('envtest.boundary.unhandled', handler)(request());

      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ error: 'Internal server error' });

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError.mock.calls[0][0]).toContain('ERROR: envtest.boundary.unhandled');
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/cnry/i);
    });

    it('가린 로그 줄은 응답이 만들어지기 전에 찍힌다', async () => {
      const order: string[] = [];
      consoleError.mockImplementation(() => {
        order.push('log');
      });

      await withSafeErrors('envtest.boundary.unhandled', async () => {
        throw new Error('x');
      })().then(() => order.push('response'));

      expect(order).toEqual(['log', 'response']);
    });

    it('오류의 이름을 표에서 골라 남긴다', async () => {
      await withSafeErrors('envtest.boundary.unhandled', async () => {
        throw new TypeError('cnry');
      })();

      expect((consoleError.mock.calls[0][1] as { error: { name: string } }).error.name).toBe('TypeError');
    });

    it.each([
      ['동기 throw', () => { throw new Error('cnry sync'); }],
      ['문자열', async () => { throw 'cnry string'; }],
      ['null', async () => { throw null; }],
      ['객체', async () => { throw { secret: 'cnry-object' }; }],
      ['Response', async () => { throw new Response('cnry-body', { status: 418 }); }],
    ])('무엇을 던지든(%s) 500 이다', async (_label, handler) => {
      const response = await withSafeErrors('envtest.boundary.unhandled', handler as () => Promise<Response>)();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
      expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/cnry/i);
    });
  });

  // 던진 값은 무엇이든 될 수 있다. 경계가 그 값을 들여다보다가 던지면 예외가 Next 와 Sentry 로 새어 나간다.
  describe('던진 값이 읽기를 방해할 때', () => {
    it('cause 를 읽으면 던지는 오류를 경계 밖으로 내보내지 않는다', async () => {
      const error = new Error('x');
      Object.defineProperty(error, 'cause', {
        get() {
          throw new Error('cnry-cause-getter https://pay.example/cb?code=cnry');
        },
      });

      await expectSafe500(async () => {
        throw error;
      });
    });

    it('cause 가 돌고 도는 오류도 기록하고 500 을 준다', async () => {
      const first = new Error('cnry-first');
      const second = new Error('cnry-second', { cause: first });
      Object.assign(first, { cause: second });

      await expectSafe500(async () => {
        throw first;
      });
    });

    it('cause 가 끝없이 이어지는 오류도 멈춘다', async () => {
      const endless = (): Error => {
        const error = new Error('cnry-endless');
        Object.defineProperty(error, 'cause', { get: endless });
        return error;
      };

      await expectSafe500(async () => {
        throw endless();
      });
    });

    it('읽으면 던지는 Proxy 를 던져도 500 이다', async () => {
      const trap = () => {
        throw new Error('cnry-proxy-trap');
      };
      const hostile = new Proxy(new Error('x'), { get: trap, has: trap, getPrototypeOf: trap, ownKeys: trap });

      await expectSafe500(async () => {
        throw hostile;
      });
    });

    it('취소된 Proxy 를 던져도 500 이다', async () => {
      const { proxy, revoke } = Proxy.revocable(new Error('x'), {});
      revoke();

      await expectSafe500(async () => {
        throw proxy;
      });
    });

    // unstable_rethrow 는 신호를 받으면 그 값을 그대로 던진다. 읽기를 방해하는 값도 자기 자신을 던질 수 있다 —
    // "받은 값이 다시 나왔다"는 것만으로는 신호인지 알 수 없다.
    it.each(['cause', 'digest', 'message', '$$typeof'])('%s 를 읽으면 자기 자신을 던지는 오류를 신호로 보지 않는다', async (key) => {
      const error = new Error('cnry-self-getter https://pay.example/cb?code=cnry');
      Object.defineProperty(error, key, {
        get() {
          throw error;
        },
      });

      await expectSafe500(async () => {
        throw error;
      });
    });

    it('digest 를 읽으면 자기 자신을 던지는 객체(Error 가 아니다)도 500 이다', async () => {
      const hostile = {
        secret: 'cnry-self-object',
        get digest(): string {
          throw hostile;
        },
      };

      await expectSafe500(async () => {
        throw hostile;
      });
    });

    it('읽으면 자기 자신을 던지는 Proxy 를 던져도 500 이다', async () => {
      const trap = (): never => {
        throw hostile;
      };
      const hostile: Error = new Proxy(new Error('cnry-self-proxy'), { get: trap, has: trap, getPrototypeOf: trap, ownKeys: trap });

      await expectSafe500(async () => {
        throw hostile;
      });
    });

    it('cause 사슬 안에서 자기 자신을 던지는 값도 올려보내지 않는다', async () => {
      const inner = new Error('cnry-self-inner');
      Object.defineProperty(inner, 'digest', {
        get() {
          throw inner;
        },
      });
      const wrapped = new Error('cnry-self-wrapped', { cause: inner });

      await expectSafe500(async () => {
        throw wrapped;
      });
    });

    it('cause 사슬 안의 getter 가 바깥 오류를 던져도 올려보내지 않는다', async () => {
      const inner = new Error('cnry-self-inner');
      const outer = new Error('cnry-self-outer https://pay.example/cb?code=cnry', { cause: inner });
      Object.defineProperty(inner, 'cause', {
        get() {
          throw outer;
        },
      });

      await expectSafe500(async () => {
        throw outer;
      });
    });

    it('cause 사슬 안의 redirect() 는 Next 가 하듯 신호로 올려보낸다', async () => {
      const signal = caught(() => redirect('/login'));
      const middle = new Error('middle', { cause: signal });
      const wrapped = new Error('wrapped', { cause: middle });
      // Next 는 사슬 안의 신호를 찾아 던진다.
      expect(caught(() => nextRethrow(wrapped)) === signal).toBe(true);

      const propagated = freshSignal(await throughBoundary(wrapped), [wrapped, middle, signal]);

      expect(redirectOf(propagated)).toEqual({ url: '/login', type: 'replace', status: 307 });
      expectQuiet();
    });
  });

  describe('Next 의 제어 흐름', () => {
    // 올려보내는 것은 던진 값이 아니라 같은 계열의 새 신호다(아래 '올려보내는 신호는 경계가 새로 만든 값이다').
    it.each(NEXT_SIGNALS)('Next 가 %s 로 판정하는 값은 같은 계열의 신호로 올려보낸다', async (_label, isFamily, make) => {
      const signal = await make();
      // 이 값은 Next 의 판정에서 정확히 이 계열 하나다. 다른 계열의 속성에 기대어 통과하지 않는다.
      expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(signal))).toEqual([isFamily]);

      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual(propagatedFamilies(isFamily));
      expectQuiet();
    });

    it.each<[string, () => unknown, { url: string; type: string; status: number }]>([
      ['redirect()', () => caught(() => redirect('/login')), { url: '/login', type: 'replace', status: 307 }],
      [
        'redirect(push)',
        () => caught(() => redirect('/orders/1?tab=a;b&next=%2Fmypage', RedirectType.push)),
        { url: '/orders/1?tab=a;b&next=%2Fmypage', type: 'push', status: 307 },
      ],
      [
        'permanentRedirect()',
        () => caught(() => permanentRedirect('https://pay.example/moved')),
        { url: 'https://pay.example/moved', type: 'replace', status: 308 },
      ],
      // 서버 액션 안의 redirect 가 쓰는 응답 코드다.
      ['303 redirect', () => getRedirectError('/done', RedirectType.push, 303), { url: '/done', type: 'push', status: 303 }],
    ])('%s 의 주소·방식·응답 코드를 그대로 싣는다', async (_label, make, expected) => {
      const signal = make();
      expect(redirectOf(signal)).toEqual(expected);

      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(isRedirectError(propagated)).toBe(true);
      expect(redirectOf(propagated)).toEqual(expected);
      expectQuiet();
    });

    it.each<[string, () => unknown, number]>([
      ['notFound()', () => caught(() => notFound()), 404],
      ['forbidden()', () => caughtWithAuthInterrupts(() => forbidden()), 403],
      ['unauthorized()', () => caughtWithAuthInterrupts(() => unauthorized()), 401],
    ])('%s 의 응답 코드를 그대로 싣는다', async (_label, make, status) => {
      const signal = make();

      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(isHTTPAccessFallbackError(propagated)).toBe(true);
      expect(getAccessFallbackHTTPStatus(propagated as Parameters<typeof getAccessFallbackHTTPStatus>[0])).toBe(status);
      expectQuiet();
    });

    it('기록을 남긴 뒤 redirect() 해도 flush 는 건다', async () => {
      const signal = caught(() => redirect('/login'));

      const outcome: Outcome = await withSafeErrors('envtest.boundary.unhandled', async () => {
        logSafeError('envtest.boundary.handled', new Error('x'));
        throw signal;
      })().then(
        (response) => ({ response }),
        (thrown: unknown) => ({ thrown }),
      );

      expect(isRedirectError(freshSignal(outcome, [signal]))).toBe(true);
      expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    // 경계는 던진 값을 unstable_rethrow 에 바로 넘기지 않고, 속성의 유무와 값을 대신 읽어 주는 객체를 넘긴다.
    // Next 가 다른 속성이나 다른 방식의 읽기를 쓰기 시작하면 여기와 아래 '단락 평가' 테스트가 먼저 알린다.
    it('unstable_rethrow 의 판정은 digest·message·$$typeof 만 읽는다', () => {
      expect(unstable_rethrow).toBe(nextRethrow);

      const read = new Set<string | symbol>();
      const recorder = new Proxy(
        { digest: 'x', message: 'x' },
        {
          get(target, key, receiver) {
            read.add(key);
            return Reflect.get(target, key, receiver);
          },
          has(target, key) {
            read.add(key);
            return Reflect.has(target, key);
          },
        },
      );

      expect(() => nextRethrow(recorder)).not.toThrow();
      expect([...read].map(String).sort()).toEqual(['$$typeof', 'digest', 'message']);
    });

    it('unstable_rethrow 는 객체가 아닌 값을 신호로 보지 않는다', () => {
      const dressed = Object.assign(() => undefined, {
        digest: 'DYNAMIC_SERVER_USAGE',
        message: DYNAMIC_POSTPONE_REASON,
        $$typeof: Symbol.for('react.postpone'),
      });

      for (const value of [dressed, 'NEXT_REDIRECT;replace;/login;307;', 404, Symbol.for('react.postpone'), null, undefined]) {
        expect(() => nextRethrow(value)).not.toThrow();
      }
    });
  });

  // unstable_rethrow 는 판정을 차례로 해 보고, 맞는 것이 나오면 그 값을 던진다. 그 뒤의 속성은 읽지 않는다.
  // 경계가 그보다 더 읽으면, 읽지 않아도 될 속성이 던지는 신호를 Next 는 올려보내는데 경계는 500 으로 바꾼다.
  describe('Next 의 단락 평가', () => {
    /** redirect('/login') 을 같은 값의 새 신호로 올려보냈다. */
    const expectRedirected = (outcome: Outcome, originals: unknown[]) => {
      expect(redirectOf(freshSignal(outcome, originals))).toEqual({ url: '/login', type: 'replace', status: 307 });
      expectQuiet();
    };

    it.each(LATE_KEYS)('redirect() 신호의 %s 가 읽으면 던져도 redirect 로 올려보낸다', async (key) => {
      const signal = caught(() => redirect('/login'));
      makeUnreadable(signal, key);
      // Next 는 digest 만 보고 이 신호를 올려보낸다.
      expect(caught(() => nextRethrow(signal)) === signal).toBe(true);

      expectRedirected(await throughBoundary(signal), [signal]);
    });

    it('redirect() 신호의 message 가 읽으면 자기 자신을 던져도 redirect 로 올려보낸다', async () => {
      const signal = caught(() => redirect('/login'));
      Object.defineProperty(signal as object, 'message', {
        get() {
          throw signal;
        },
      });

      expectRedirected(await throughBoundary(signal), [signal]);
    });

    it('cause 사슬 안의 신호도 판정에 쓰지 않는 속성은 읽지 않는다', async () => {
      const signal = caught(() => redirect('/login'));
      makeUnreadable(signal, 'message');
      makeUnreadable(signal, 'cause');
      const middle = new Error('middle', { cause: signal });
      const wrapped = new Error('wrapped', { cause: middle });
      expect(caught(() => nextRethrow(wrapped)) === signal).toBe(true);

      expectRedirected(await throughBoundary(wrapped), [wrapped, middle, signal]);
    });

    // 계열마다 Next 가 판정에 쓰는 속성이 다르다. 기대를 손으로 적지 않고 Next 에 같은 값을 넘겨 본 결과와 맞춘다.
    it.each(
      NEXT_SIGNALS.flatMap(([label, isFamily, make]) =>
        LATE_KEYS.map((key): [string, string, (value: unknown) => boolean, () => unknown] => [label, key, isFamily, make]),
      ),
    )(
      '%s 신호의 %s 가 읽으면 던질 때 Next 와 같은 판정을 한다',
      async (_label, key, isFamily, make) => {
        const signal = await make();
        makeUnreadable(signal, key);
        // Next 가 이 속성을 읽기 전에 판정을 끝내면 신호가 그대로 나오고, 읽으면 getter 의 오류가 나온다.
        const nextPropagates = caught(() => nextRethrow(signal)) === signal;

        const outcome = await throughBoundary(signal);

        if (nextPropagates) {
          const propagated = freshSignal(outcome, [signal]);
          expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual(propagatedFamilies(isFamily));
          expectQuiet();
        } else {
          expect('response' in outcome && outcome.response.status, '신호가 아닌 값을 올려보냈다').toBe(500);
          expect(consoleError).toHaveBeenCalledTimes(1);
          expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/cnry/i);
          expect(mocks.after).toHaveBeenCalledTimes(1);
        }
      },
    );

    // 새 신호를 만들 때도 던진 값을 더 읽지 않는다. 판정하면서 읽어 둔 값만 쓴다.
    it.each(NEXT_SIGNALS)('%s 신호에서 Next 가 읽는 것만, 같은 순서로 읽는다', async (_label, isFamily, make) => {
      const direct = recording((await make()) as object);
      const directThrown = caught(() => nextRethrow(direct.proxy));
      const directReads = [...direct.reads];
      expect(directThrown === direct.proxy).toBe(true);
      // 판정은 속성의 유무와 값만 본다. 경계가 대신 읽어 주는 것도 이 둘뿐이다.
      expect(directReads.filter((entry) => !/^(has|get) /.test(entry))).toEqual([]);

      const viaBoundary = recording((await make()) as object);
      const outcome = await throughBoundary(viaBoundary.proxy);
      const boundaryReads = [...viaBoundary.reads];

      const propagated = freshSignal(outcome, [viaBoundary.proxy]);
      expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual(propagatedFamilies(isFamily));
      expect(boundaryReads).toEqual(directReads);
      // 올려보낸 신호를 뒤에서 읽어도 던진 값은 다시 읽히지 않는다.
      expect(viaBoundary.reads).toEqual(directReads);
    });
  });

  // 경계는 던진 값을 읽어 신호인지 정한다. 그 값을 그대로 올려보내면 Next 와 SDK 가 그것을 다시 읽는다.
  // 읽을 때마다 달라지는 값은 경계에서는 redirect 였다가 그 뒤로는 평범한 오류가 되어, 메시지·stack·cause 가 그대로 찍힌다.
  // 그래서 판정하면서 읽은 값으로 새 신호를 만들어 올려보낸다. 던진 값과 같은 객체가 아니다.
  describe('올려보내는 신호는 경계가 새로 만든 값이다', () => {
    it.each([1, 2])('digest 가 처음 %d번만 redirect 인 값도 변하지 않는 redirect 로 올려보낸다', async (validReads) => {
      const { signal, reads } = statefulRedirect(validReads);

      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(redirectOf(propagated)).toEqual({ url: '/login', type: 'replace', status: 307 });
      expectQuiet();
      // 뒤에서 Next 와 SDK 가 몇 번을 읽어도 같은 redirect 다. 던진 값은 다시 읽히지 않는다.
      const readsInBoundary = reads();
      for (let round = 0; round < 3; round += 1) {
        expect(isRedirectError(propagated)).toBe(true);
        expect(redirectOf(propagated)).toEqual({ url: '/login', type: 'replace', status: 307 });
      }
      expect(reads()).toBe(readsInBoundary);
      // 던진 값은 이제 redirect 가 아니다. 올려보낸 신호는 그 변화를 따라가지 않는다.
      expect(isRedirectError(signal)).toBe(false);
      expect(isRedirectError(propagated)).toBe(true);
    });

    it.each<[string, () => unknown]>([
      [
        '던지는',
        () => {
          throw new Error('cnry-proxy-later-read https://pay.example/cb?code=cnry');
        },
      ],
      ['다른 값을 주는', () => 'cnry-ordinary-digest'],
    ])('판정에 쓴 읽기 뒤로는 %s Proxy 도 다시 읽지 않는다', async (_label, afterwards) => {
      const real = (caught(() => redirect('/login')) as { digest: string }).digest;
      const trace: string[] = [];
      // 처음 한 번의 'digest' in 과 .digest 만 redirect 처럼 답하고, 그 밖의 모든 읽기는 afterwards 가 답한다.
      const scripted = (entry: string, first?: unknown): unknown => {
        trace.push(entry);
        return first !== undefined && trace.filter((seen) => seen === entry).length === 1 ? first : afterwards();
      };
      const hostile = new Proxy(new Error('cnry-proxy'), {
        has: (_target, key) => scripted(`has ${String(key)}`, key === 'digest' ? true : undefined) as boolean,
        get: (_target, key) => scripted(`get ${String(key)}`, key === 'digest' ? real : undefined),
        getPrototypeOf: () => scripted('getPrototypeOf') as object,
        ownKeys: () => scripted('ownKeys') as Array<string | symbol>,
        getOwnPropertyDescriptor: (_target, key) => scripted(`getOwnPropertyDescriptor ${String(key)}`) as PropertyDescriptor,
      });

      const outcome = await throughBoundary(hostile);
      const readsInBoundary = [...trace];
      const propagated = freshSignal(outcome, [hostile]);

      expect(redirectOf(propagated)).toEqual({ url: '/login', type: 'replace', status: 307 });
      expectQuiet();
      expect(readsInBoundary).toEqual(['has digest', 'get digest']);
      expect(trace).toEqual(readsInBoundary);
    });

    it.each(NEXT_SIGNALS)('%s 신호가 달고 온 메시지·이름·stack·cause·다른 속성은 싣지 않는다', async (_label, isFamily, make) => {
      const signal = await make();
      decorate(signal);
      // 꾸민 뒤에도 Next 는 같은 계열의 신호로 본다.
      expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(signal))).toEqual([isFamily]);
      expect(inspect(signal, { showHidden: true, depth: 10 })).toMatch(/cnry/i);

      // freshSignal 이 올려보낸 신호의 속성·stack·출력 어디에도 꾸민 값이 없는지 본다.
      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual(propagatedFamilies(isFamily));
      expectQuiet();
    });

    it('동적 postpone 의 메시지는 던진 값의 문장이 아니라 정해 둔 문장이다', async () => {
      const signal = new Error(`${DYNAMIC_POSTPONE_REASON} order=cnry-order user@cnry.invalid`);
      expect(isDynamicPostpone(signal)).toBe(true);

      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(isDynamicPostpone(propagated)).toBe(true);
      expect(propagated.message).not.toContain('/api/payment/x');
      expect(propagated.message).not.toContain('cookies()');
    });

    // Next 는 동적 postpone 을 React.unstable_postpone 으로 던진다. 그 값에는 표식이 둘이다: Next 가 보는 문장(message)과
    // React 가 보는 $$typeof. unstable_rethrow 는 문장에서 판정을 끝내고 $$typeof 는 읽지 않는다.
    describe('동적 postpone 의 두 표식', () => {
      /** React 가 postpone 을 알아보는 값. 손으로 적지 않고 React 가 실제로 던진 것에서 꺼낸다. */
      const reactMarker = () => (reactPostpone('x') as { $$typeof: symbol }).$$typeof;

      it('Next 가 실제로 던지는 모양(문장과 $$typeof)은 두 표식을 다 가진 신호로 올려보낸다', async () => {
        const signal = reactPostpone(`${DYNAMIC_POSTPONE_REASON} order=cnry-order`);
        expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(signal))).toEqual([isDynamicPostpone, isPostpone]);

        const propagated = freshSignal(await throughBoundary(signal), [signal]);

        expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual([isDynamicPostpone, isPostpone]);
        expect(propagated.$$typeof).toBe(reactMarker());
        expect(propagated.message).not.toContain('/api/payment/x');
        expectQuiet();
      });

      it('$$typeof 는 던진 값에서 읽지 않는다 — 읽으면 던지는 값이어도 두 표식을 다 싣는다', async () => {
        const signal = reactPostpone(DYNAMIC_POSTPONE_REASON);
        makeUnreadable(signal, '$$typeof');
        // Next 는 문장만 보고 이 신호를 올려보낸다.
        expect(caught(() => nextRethrow(signal)) === signal).toBe(true);

        const propagated = freshSignal(await throughBoundary(signal), [signal]);

        expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual([isDynamicPostpone, isPostpone]);
        expect(propagated.$$typeof).toBe(reactMarker());
        expectQuiet();
      });

      it('$$typeof 자리에 다른 값이 있어도 그 값을 싣지 않는다', async () => {
        const signal = Object.assign(new Error(DYNAMIC_POSTPONE_REASON), { $$typeof: Symbol('cnry-not-postpone') });
        expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(signal))).toEqual([isDynamicPostpone]);

        const propagated = freshSignal(await throughBoundary(signal), [signal]);

        expect(propagated.$$typeof).toBe(reactMarker());
        expectQuiet();
      });

      it('문장이 다른 React postpone 은 React 의 표식만 싣는다', async () => {
        const signal = reactPostpone('cnry postpone');

        const propagated = freshSignal(await throughBoundary(signal), [signal]);

        expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(propagated))).toEqual([isPostpone]);
        expect(propagated.$$typeof).toBe(reactMarker());
        expectQuiet();
      });
    });

    // Next 는 digest 를 느슨하게 읽는다. 뒤에 붙은 것은 보지 않고, 응답 코드는 수로 바꿔 본다.
    // 그 문자열을 그대로 옮기면 신호에 무엇이든 실어 보낼 수 있다. 필요한 값만 꺼내 정해진 모양으로 다시 적는다.
    it.each<[string, () => unknown, string, string]>([
      [
        'redirect 뒤에 붙은 것',
        () => caught(() => redirect('/login')),
        'NEXT_REDIRECT;replace;/login;307;cnry-trailing user@cnry.invalid',
        'NEXT_REDIRECT;replace;/login;307;',
      ],
      ['redirect 의 응답 코드 표기', () => caught(() => redirect('/login')), 'NEXT_REDIRECT;replace;/login;3.07e2;', 'NEXT_REDIRECT;replace;/login;307;'],
      [
        'notFound 뒤에 붙은 것',
        () => caught(() => notFound()),
        'NEXT_HTTP_ERROR_FALLBACK;404;cnry-trailing user@cnry.invalid',
        'NEXT_HTTP_ERROR_FALLBACK;404',
      ],
      ['notFound 의 응답 코드 표기', () => caught(() => notFound()), 'NEXT_HTTP_ERROR_FALLBACK; 4.04e2 ', 'NEXT_HTTP_ERROR_FALLBACK;404'],
    ])('digest 는 그대로 옮기지 않고 다시 적는다(%s)', async (_label, make, loose, canonical) => {
      const signal = make() as { digest: string };
      // Next 가 실제로 만드는 digest 가 다시 적은 모양과 같다.
      expect(signal.digest).toBe(canonical);
      signal.digest = loose;
      // Next 는 느슨한 digest 도 신호로 본다.
      expect(caught(() => nextRethrow(signal)) === signal).toBe(true);

      const propagated = freshSignal(await throughBoundary(signal), [signal]);

      expect(propagated.digest).toBe(canonical);
      expectQuiet();
    });

    it('사슬 안의 신호를 올려보낼 때 감싼 오류도, 안의 값도 나가지 않는다', async () => {
      const { signal } = statefulRedirect(1);
      const middle = new Error('cnry-middle', { cause: signal });
      const wrapped = new Error('cnry-wrapped https://pay.example/cb?code=cnry', { cause: middle });

      const propagated = freshSignal(await throughBoundary(wrapped), [wrapped, middle, signal]);

      expect(redirectOf(propagated)).toEqual({ url: '/login', type: 'replace', status: 307 });
      expectQuiet();
    });

    it('신호는 cause 사슬의 10단계까지 찾는다', async () => {
      const signal = caught(() => redirect('/login'));
      const wrap = (depth: number) => {
        const chain: unknown[] = [signal];
        for (let level = 0; level < depth; level += 1) chain.push(new Error(`cnry-wrapper-${level}`, { cause: chain[chain.length - 1] }));
        return chain;
      };

      const within = wrap(10);
      expect(redirectOf(freshSignal(await throughBoundary(within[10]), within))).toEqual({ url: '/login', type: 'replace', status: 307 });
      expectQuiet();

      const beyond = wrap(11);
      await expectSafe500(async () => {
        throw beyond[11];
      });
    });

    // Next 는 redirect 의 주소를 Location 헤더에 그대로 싣는다. 실을 수 없는 값이면 그 값이 든 오류가 Next 안에서 난다.
    const NUL = String.fromCharCode(0);
    const SOH = String.fromCharCode(1);
    it.each<[string, string, boolean]>([
      ['줄바꿈', '/login\r\nSet-Cookie: session=cnry', true],
      ['Latin-1 밖의 문자', '/로그인?next=cnry', true],
      ['NUL', `/login${NUL}cnry`, true],
      ['그 밖의 제어 문자', `/login${SOH}cnry`, false],
      ['빈 주소', '', false],
      ['공백뿐인 주소', '   ', false],
    ])('Location 에 실을 수 없는 주소(%s)의 redirect 는 올려보내지 않고 500 으로 끝낸다', async (_label, url, headersReject) => {
      const signal = caught(() => redirect(url));
      expect(isRedirectError(signal)).toBe(true);
      if (headersReject) expect(() => new Headers({ Location: url })).toThrow();

      await expectSafe500(async () => {
        throw signal;
      });
    });
  });

  describe('요청당 한 번의 flush', () => {
    it('던진 요청에 한 번 건다', async () => {
      await withSafeErrors('envtest.boundary.unhandled', async () => {
        throw new Error('x');
      })();

      expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    it('핸들러가 스스로 남긴 기록도 센다. 여러 번 남겨도 한 번이다', async () => {
      const helper = async () => {
        await Promise.resolve();
        logSafeError('envtest.boundary.handled', new Error('x'));
      };

      const response = await withSafeErrors('envtest.boundary.unhandled', async () => {
        logSafeError('envtest.boundary.handled', new Error('x'));
        await helper();
        await new Promise((resolve) => setTimeout(resolve, 5));
        logSafeError('envtest.boundary.handled', new Error('x'));
        return Response.json({ ok: true });
      })();

      expect(response.status).toBe(200);
      expect(consoleError).toHaveBeenCalledTimes(3);
      expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    it('동시에 처리 중인 다른 요청의 기록을 세지 않는다', async () => {
      const gate = deferred();
      const recording = withSafeErrors('envtest.boundary.unhandled', async () => {
        await gate.promise;
        logSafeError('envtest.boundary.handled', new Error('x'));
        return Response.json({ who: 'recording' });
      });
      const quiet = withSafeErrors('envtest.boundary.unhandled', async () => {
        await gate.promise;
        return Response.json({ who: 'quiet' });
      });

      const first = recording();
      const second = quiet();
      gate.resolve();
      await second;
      await first;

      expect(mocks.after).toHaveBeenCalledTimes(1);

      mocks.after.mockClear();
      await quiet();
      expect(mocks.after).not.toHaveBeenCalled();
    });

    it('경계가 겹쳐도 한 번이다', async () => {
      const inner = withSafeErrors('envtest.boundary.handled', async () => {
        throw new Error('x');
      });

      // 안쪽 경계가 잡아 남기고, 바깥 핸들러도 남긴다. 둘 다 같은 요청이다.
      const response = await withSafeErrors('envtest.boundary.unhandled', async () => {
        const innerResponse = await inner();
        logSafeError('envtest.boundary.handled', new Error('x'));
        return innerResponse;
      })();

      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledTimes(2);
      expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    it('경계 밖에서 남긴 기록에는 걸지 않는다', () => {
      logSafeError('envtest.boundary.handled', new Error('x'));

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(mocks.after).not.toHaveBeenCalled();
    });

    it('after 를 쓸 수 없는 환경에서도 응답을 돌려준다', async () => {
      // 요청 범위 밖에서 after 를 부르면 Next 가 던진다. 계약 테스트는 핸들러를 직접 부른다.
      mocks.after.mockImplementation(() => {
        throw new Error('`after` was called outside a request scope.');
      });

      const failed = await withSafeErrors('envtest.boundary.unhandled', async () => {
        throw new Error('x');
      })();
      const handled = await withSafeErrors('envtest.boundary.unhandled', async () => {
        logSafeError('envtest.boundary.handled', new Error('x'));
        return Response.json({ ok: true });
      })();

      expect(failed.status).toBe(500);
      expect(handled.status).toBe(200);
      expect(consoleError).toHaveBeenCalledTimes(2);
    });
  });

  describe('flush 의 결과', () => {
    const fail = () =>
      withSafeErrors('envtest.boundary.unhandled', async () => {
        throw new Error('x');
      })();

    it('제한 안에 끝나면 아무것도 찍지 않는다', async () => {
      await fail();
      await runScheduledFlush();

      expect(mocks.flush).toHaveBeenCalledExactlyOnceWith(FLUSH_TIMEOUT_MS);
      expect(FLUSH_TIMEOUT_MS).toBe(2000);
      expect(consoleWarn).not.toHaveBeenCalled();
    });

    it('제한을 넘기면 그 사실 한 줄을 남긴다', async () => {
      mocks.flush.mockResolvedValue(false);

      await fail();
      await runScheduledFlush();

      expect(consoleWarn.mock.calls).toEqual([[FLUSH_TIMEOUT_LINE]]);
      expect(FLUSH_TIMEOUT_LINE).toBe('[sentry] flush timeout');
    });

    it('flush 가 던져도 콜백 밖으로 나가지 않고, 오류 객체를 찍지 않는다', async () => {
      mocks.flush.mockRejectedValue(new Error('cnry flush'));

      await fail();
      await expect(runScheduledFlush()).resolves.toBeUndefined();

      expect(consoleWarn.mock.calls).toEqual([[FLUSH_FAILED_LINE]]);
    });

    it('SDK 가 초기화되지 않았으면 flush 하지 않는다', async () => {
      // DSN 이 없으면 Sentry.init 을 부르지 않는다. 그때 Sentry.flush 는 false 를 준다 — 제한 초과로 읽으면 안 된다.
      mocks.getClient.mockReturnValue(undefined);

      await fail();
      await runScheduledFlush();

      expect(mocks.flush).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다 — 먼저 환경에서 막힌다**

Run: `npx vitest run __tests__/utils/with-safe-errors.test.ts`
Expected: FAIL. `ReferenceError: window is not defined` (`vitest.setup.ts` 의 `Object.defineProperty(window, 'matchMedia', …)`). 공용 setup 이 node 환경을 막고 있다.

- [ ] **Step 3: setup 의 `window` 사용부를 가드로 감싼다**

`// Mock window.matchMedia` 부터 파일 끝까지를 `if (typeof window !== 'undefined') { … }` 로 감싼다. 안의 코드는 들여쓰기만 바뀐다.

```diff
--- a/vitest.setup.ts
+++ b/vitest.setup.ts
@@ -33,39 +33,42 @@ vi.mock('next/headers', () => ({
   headers: () => new Map(),
 }))

-// Mock window.matchMedia
-Object.defineProperty(window, 'matchMedia', {
-  writable: true,
-  value: vi.fn().mockImplementation((query: string) => ({
-    matches: false,
-    media: query,
-    onchange: null,
-    addListener: vi.fn(),
-    removeListener: vi.fn(),
-    addEventListener: vi.fn(),
-    removeEventListener: vi.fn(),
-    dispatchEvent: vi.fn(),
-  })),
-})
+// 아래는 DOM 환경(jsdom)에서만 필요하다. `// @vitest-environment node` 로 도는 서버 코드 테스트에는 window 가 없다.
+if (typeof window !== 'undefined') {
+  // Mock window.matchMedia
+  Object.defineProperty(window, 'matchMedia', {
+    writable: true,
+    value: vi.fn().mockImplementation((query: string) => ({
+      matches: false,
+      media: query,
+      onchange: null,
+      addListener: vi.fn(),
+      removeListener: vi.fn(),
+      addEventListener: vi.fn(),
+      removeEventListener: vi.fn(),
+      dispatchEvent: vi.fn(),
+    })),
+  })

-// Mock IntersectionObserver
-class MockIntersectionObserver {
-  observe = vi.fn()
-  unobserve = vi.fn()
-  disconnect = vi.fn()
-}
-Object.defineProperty(window, 'IntersectionObserver', {
-  writable: true,
-  value: MockIntersectionObserver,
-})
+  // Mock IntersectionObserver
+  class MockIntersectionObserver {
+    observe = vi.fn()
+    unobserve = vi.fn()
+    disconnect = vi.fn()
+  }
+  Object.defineProperty(window, 'IntersectionObserver', {
+    writable: true,
+    value: MockIntersectionObserver,
+  })

-// Mock ResizeObserver
-class MockResizeObserver {
-  observe = vi.fn()
-  unobserve = vi.fn()
-  disconnect = vi.fn()
+  // Mock ResizeObserver
+  class MockResizeObserver {
+    observe = vi.fn()
+    unobserve = vi.fn()
+    disconnect = vi.fn()
+  }
+  Object.defineProperty(window, 'ResizeObserver', {
+    writable: true,
+    value: MockResizeObserver,
+  })
 }
-Object.defineProperty(window, 'ResizeObserver', {
-  writable: true,
-  value: MockResizeObserver,
-})
```

Run: `npx vitest run __tests__/utils/with-safe-errors.test.ts`
Expected: FAIL. 이번에는 `Failed to resolve import "@/utils/with-safe-errors"`.

Run: `npm test`
Expected: 새 테스트 파일 하나만 실패하고 나머지는 그대로다(가드가 jsdom 테스트를 바꾸지 않는다).

- [ ] **Step 4: 구현한다**

`utils/with-safe-errors.ts`:

```ts
/**
 * 결제·인증 route handler 의 경계 (설계 §4.7, §4.3).
 *
 *   export const POST = withSafeErrors('payment.portone.webhook.unhandled', async (request) => { … });
 *
 * 핸들러가 던진 오류를 여기서 잡아 logSafeError 로 남기고 고정된 500 을 돌려준다. 원본 오류는 Next 로
 * 전파되지 않으므로 Next 의 미처리 오류 로그(원본 메시지를 서버 출력에 찍는다)와 onRequestError 에 닿지 않는다.
 *
 * redirect()·notFound() 같은 Next 의 제어 흐름 신호는 오류가 아니므로 올려보낸다. 다만 던진 값을 그대로 올려보내지 않고,
 * 판정에 쓴 값으로 같은 뜻의 신호를 새로 만들어 올려보낸다. 던진 값과 같은 객체가 아니다 — 그 값의 메시지·stack·cause 와
 * 다른 속성은 경계 밖으로 나가지 않는다. redirect 앞에서 cookies() 로 쓴 쿠키는 Next 가 요청 저장소에서 꺼내 싣는다.
 *
 * 오류를 기록한 요청에는 요청당 한 번, 응답 뒤에 Sentry.flush 를 걸어 결과를 본다. SDK 의 route handler 래퍼도
 * 요청마다 flush 를 걸지만 결과를 버리므로 제한 초과를 알 수 없다. 이 경고는 "전역 큐가 제한 안에 비워지지
 * 않았다"는 뜻이고 특정 이벤트의 실패를 가리키지 않는다.
 *
 * 서버 전용이다. after 와 AsyncLocalStorage 를 쓴다.
 */
import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';
import { after } from 'next/server';

import type { LogEventCode } from './log-event-codes';
import { logSafeError, setSafeErrorListener } from './log-safe-error';

/** SDK 의 route handler 래퍼가 쓰는 제한과 같다(@sentry/nextjs 의 flushSafelyWithTimeout). */
export const FLUSH_TIMEOUT_MS = 2000;
export const FLUSH_TIMEOUT_LINE = '[sentry] flush timeout';
export const FLUSH_FAILED_LINE = '[sentry] flush failed';

type RequestRecord = { recorded: boolean };

const requestRecords = new AsyncLocalStorage<RequestRecord>();

// logSafeError 가 불릴 때마다 지금 요청에 표시한다. 경계 밖(브라우저, 감싸지 않은 라우트)에서는 store 가 없다.
setSafeErrorListener(() => {
  const record = requestRecords.getStore();
  if (record) record.recorded = true;
});

async function flushAndReport(): Promise<void> {
  // DSN 이 없으면 SDK 가 초기화되지 않는다(sentry.server.config.js). 그때 flush 는 false 를 준다 — 제한 초과가 아니다.
  if (!Sentry.getClient()) return;
  try {
    if (!(await Sentry.flush(FLUSH_TIMEOUT_MS))) console.warn(FLUSH_TIMEOUT_LINE);
  } catch {
    // after 콜백 밖으로 던지면 Next 가 그 오류 객체를 통째로 찍는다. 고정된 한 줄만 남긴다.
    console.warn(FLUSH_FAILED_LINE);
  }
}

/** cause 사슬을 따라가는 깊이의 상한. 읽을 때마다 새 cause 를 내놓는 값에서도 멈춘다. */
const MAX_CAUSE_DEPTH = 10;

/** 던진 값을 읽다가 예외가 났다는 표식. 그 예외 대신 이것을 던진다 — 원래 예외는 어디로도 내보내지 않는다. */
const UNREADABLE = Symbol('unreadable');

/** 판정하면서 던진 값에서 읽은 속성 값. 읽은 순서대로 들어 있다. */
type ReadValues = ReadonlyMap<string | symbol, unknown>;

/**
 * Next 가 이 값 자체를 제어 흐름 신호(redirect, notFound, 동적 렌더링 신호)로 보는가. 신호면 판정하면서 읽은 값을 돌려준다.
 *
 * 던진 값을 unstable_rethrow 에 바로 넘기지 않는다. unstable_rethrow 는 신호를 받으면 그 값을 그대로 다시 던지는데,
 * 읽기를 방해하는 값도 getter 나 Proxy 에서 자기 자신을 던질 수 있어 "넘긴 값이 다시 나왔다"로는 둘을 가리지 못한다.
 * 그래서 속성의 유무와 값만 대신 읽어 주는 객체를 넘긴다. 그 객체가 다시 나오는 길은 판정을 통과하는 것뿐이다.
 *
 * 무엇을 어떤 순서로 읽을지는 unstable_rethrow 가 정한다. 판정은 차례로 해 보다가 맞는 것이 나오면 거기서 끝나므로,
 * redirect() 신호라면 digest 만 읽는다. 미리 다 읽어 두면 판정에 쓰지 않는 속성이 던지는 신호를 놓친다.
 * 같은 속성은 한 번만 읽어 기억한다. 읽다가 던지는 값은 신호가 아니다.
 */
function readAsControlFlow(value: unknown): ReadValues | null {
  // 판정은 모두 객체만 신호로 본다.
  if (typeof value !== 'object' || value === null) return null;

  const source: object = value;
  const present = new Map<string | symbol, boolean>();
  const values = new Map<string | symbol, unknown>();
  const reading = <Result>(read: () => Result): Result => {
    try {
      return read();
    } catch {
      throw UNREADABLE;
    }
  };
  // 대상이 빈 객체라 Error 가 아니다 — unstable_rethrow 가 cause 를 따라가지 않는다. 사슬은 경계가 따라간다.
  const probe = new Proxy(
    {},
    {
      has(_target, key) {
        if (!present.has(key)) present.set(key, reading(() => Reflect.has(source, key)));
        return present.get(key) === true;
      },
      get(_target, key) {
        if (!values.has(key)) values.set(key, reading(() => Reflect.get(source, key)));
        return values.get(key);
      },
    },
  );

  try {
    unstable_rethrow(probe);
    return null;
  } catch (thrown) {
    return thrown === probe ? values : null;
  }
}

/**
 * unstable_rethrow 가 이 값을 신호로 보는가. 경계가 만든 값에만 쓴다 —
 * getter 가 없는 값이라, 넘긴 값이 다시 나오는 길은 판정을 통과하는 것뿐이다.
 */
function nextRethrows(owned: object): boolean {
  try {
    unstable_rethrow(owned);
    return false;
  } catch (thrown) {
    return thrown === owned;
  }
}

/**
 * 경계가 올려보내는 신호를 만든다. 가진 것은 여기서 정한 문장과 판정에 쓰이는 표식뿐이다.
 * stack 도 정해 둔 한 줄로 바꾼다 — 엔진이 만든 stack 에는 호출한 함수의 이름이 들어가고, 이름은 값에서 올 수 있다(log-safe-error.ts).
 * redirect 가 아닌 신호는 SDK 가 예외로 보낼 수 있다(forbidden, unauthorized 등). 그 이벤트에 실리는 것이 이 문장과 stack 이다.
 */
function ownedSignal(message: string, marks: { digest: string } | { $$typeof: symbol }): Error {
  const signal = new Error(message);
  signal.stack = `Error: ${message}`;
  return Object.assign(signal, marks);
}

/**
 * Next 가 Location 헤더에 그대로 싣는 주소다. 실을 수 없는 값이면 Next 안에서 그 값이 든 오류가 난다.
 * 그런 주소의 redirect 는 올려보내지 않는다.
 */
function isLocationSafe(url: string): boolean {
  // Node 의 http 가 헤더 값으로 받는 문자만 받는다. 줄바꿈·NUL 같은 제어 문자와 Latin-1 밖의 문자는 받지 않는다.
  if (url.trim() === '' || !/^[\t\x20-\x7e\x80-\xff]+$/.test(url)) return false;
  try {
    // Next 가 응답을 만들 때 하는 일이다.
    void new Headers({ Location: url });
    return true;
  } catch {
    return false;
  }
}

/**
 * Next 는 digest 를 느슨하게 읽는다: redirect 는 `NEXT_REDIRECT;방식;주소;응답 코드;` 뒤에 무엇이 붙어도 받고,
 * 응답 코드는 수로 바꿔 본다. 접근 fallback(notFound 등)도 `NEXT_HTTP_ERROR_FALLBACK;응답 코드` 뒤를 보지 않는다.
 * 그 문자열을 그대로 옮기면 무엇이든 실어 보낼 수 있으므로, Next 가 꺼내 쓰는 값만 꺼내 Next 가 만드는 모양으로 다시 적는다.
 * 방식과 응답 코드가 Next 가 받는 값인지는 다시 적은 신호를 unstable_rethrow 에 넘겨 확인한다(normalizedSignal).
 */
function redirectSignal(digest: string): Error | null {
  const parts = digest.split(';');
  if (parts[0] !== 'NEXT_REDIRECT' || parts.length < 4) return null;
  const url = parts.slice(2, -2).join(';');
  if (!isLocationSafe(url)) return null;
  return ownedSignal('NEXT_REDIRECT', { digest: `NEXT_REDIRECT;${parts[1]};${url};${Number(parts[parts.length - 2])};` });
}

function accessFallbackSignal(digest: string): Error | null {
  const parts = digest.split(';');
  if (parts[0] !== 'NEXT_HTTP_ERROR_FALLBACK') return null;
  const canonical = `NEXT_HTTP_ERROR_FALLBACK;${Number(parts[1])}`;
  return ownedSignal(canonical, { digest: canonical });
}

/** digest 가 통째로 정해진 값인 신호(동적 렌더링 신호 등). Next 가 그 값 하나만으로 신호로 볼 때만 만든다. */
function constantDigestSignal(digest: string): Error | null {
  return digest.includes(';') || !nextRethrows({ digest }) ? null : ownedSignal(digest, { digest });
}

/** React 가 postpone 을 알아보는 값. */
const REACT_POSTPONE = Symbol.for('react.postpone');

/** Next 가 동적 postpone 으로 보는 문장. 던진 값의 문장(경로와 호출한 API 가 들어 있다)은 쓰지 않는다. */
const DYNAMIC_POSTPONE_MESSAGE =
  'Route needs to bail out of prerendering at this point because it used a dynamic API. ' +
  'Learn more: https://nextjs.org/docs/messages/ppr-caught-error';

/**
 * 판정하면서 읽은 값으로 새 신호를 만든다. 던진 값은 다시 읽지 않는다.
 *
 * 어느 판정에서 끝났는지는 읽은 흔적으로 안다. unstable_rethrow 는 digest 로 정해지는 신호(redirect, 접근 fallback,
 * 정해진 digest)를 먼저 보고, 그다음에 message(동적 postpone)와 $$typeof(React 의 postpone)를 본다.
 * message 를 읽지 않았다면 digest 에서 끝난 것이다. 읽었다면 값 하나만 실은 객체를 unstable_rethrow 에 넘겨 어느 것인지 묻는다.
 */
function candidateSignal(read: ReadValues): Error | null {
  const digest = read.get('digest');
  const fromDigest = (make: (digest: string) => Error | null) => (typeof digest === 'string' ? make(digest) : null);

  if (!read.has('message')) {
    return fromDigest((value) => redirectSignal(value) ?? accessFallbackSignal(value) ?? constantDigestSignal(value));
  }

  const message = read.get('message');
  if (typeof message === 'string' && nextRethrows({ message })) {
    // Next 는 동적 postpone 을 React 의 postpone 으로 던진다. 던진 값의 $$typeof 는 판정이 읽지 않으므로 정해 둔 값을 싣는다.
    return ownedSignal(DYNAMIC_POSTPONE_MESSAGE, { $$typeof: REACT_POSTPONE });
  }
  const mark = read.get('$$typeof');
  if (typeof mark === 'symbol' && nextRethrows({ $$typeof: mark })) return ownedSignal('React postpone', { $$typeof: mark });
  // prerender 가 끝난 뒤의 거부처럼, digest 로 정해지지만 판정 순서가 뒤인 신호.
  return fromDigest(constantDigestSignal);
}

/**
 * 올려보낼 신호. 던진 값도, 그 값의 일부도 아니다 — 경계가 만든 값이라 뒤에서 누가 몇 번을 읽어도 같다.
 * 던진 값을 그대로 올려보내면 Next 와 SDK 가 그것을 다시 읽는다. 읽을 때마다 달라지는 값은 경계에서는 redirect 였다가
 * 그 뒤로는 평범한 오류가 되어, 메시지·stack·cause 가 그대로 찍힌다.
 *
 * 만든 신호를 unstable_rethrow 가 신호로 보지 않으면(null) 올려보내지 않는다. Location 에 실을 수 없는 주소의 redirect 도 그렇다.
 */
function normalizedSignal(read: ReadValues): Error | null {
  const candidate = candidateSignal(read);
  return candidate !== null && nextRethrows(candidate) ? candidate : null;
}

/**
 * 던진 값과 그 cause 사슬에서 Next 의 제어 흐름 신호를 찾아, 올려보낼 새 신호를 돌려준다.
 * Next 가 하듯 값을 먼저 판정하고, 신호가 아닐 때만 cause 를 읽는다.
 * 읽다가 던지거나, 이미 본 값으로 돌아오거나, 상한에 닿으면 거기서 멈춘다.
 * 던진 값은 무엇이든 될 수 있다 — cause 가 던지는 getter 일 수도, Proxy 일 수도 있다.
 */
function findControlFlow(error: unknown): Error | null {
  const seen: unknown[] = [];
  let current: unknown = error;
  while (seen.length <= MAX_CAUSE_DEPTH) {
    const read = readAsControlFlow(current);
    // Next 라면 이 값을 올려보낸다. 안전한 신호로 옮길 수 없으면 오류로 다룬다 — 사슬을 더 보지 않는다.
    if (read) return normalizedSignal(read);
    seen.push(current);
    let next: unknown;
    try {
      if (!(current instanceof Error) || !('cause' in current)) break;
      next = current.cause;
    } catch {
      break;
    }
    if (seen.includes(next)) break;
    current = next;
  }
  return null;
}

function scheduleFlush(): void {
  try {
    after(flushAndReport);
  } catch {
    // 요청 범위 밖(테스트가 핸들러를 직접 부를 때)이거나 waitUntil 이 없는 환경이다.
    // 가린 로그 한 줄은 이미 남았다(설계 §4.3 의 1). 응답을 깨뜨리지 않는다.
  }
}

export function withSafeErrors<Args extends unknown[]>(
  code: LogEventCode,
  handler: (...args: Args) => Response | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const run = async (): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        // redirect()·notFound() 와 Next 의 동적 렌더링 신호는 오류가 아니다. 같은 뜻의 새 신호를 올려보낸다 — 던진 값은 나가지 않는다.
        // Next 가 하듯 cause 사슬 안의 신호도 찾는다. 찾는 동안 난 예외는 올려보내지 않는다.
        const signal = findControlFlow(error);
        if (signal) throw signal;
        logSafeError(code, error);
        // 본문에 오류 메시지를 넣지 않는다.
        return Response.json({ error: 'Internal server error' }, { status: 500 });
      }
    };

    // 경계가 겹치면 바깥 경계가 flush 를 건다. 요청당 한 번이다.
    if (requestRecords.getStore()) return run();

    const record: RequestRecord = { recorded: false };
    try {
      return await requestRecords.run(record, run);
    } finally {
      if (record.recorded) scheduleFlush();
    }
  };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run __tests__/utils/with-safe-errors.test.ts && npx tsc --noEmit`
Expected: PASS (25건), 타입 오류 없음.

- [ ] **Step 6: 테스트가 실제로 잡는지 본다 (고친 뒤 되돌린다)**

각 줄을 하나씩 바꿔 돌리고 `git checkout -- utils/with-safe-errors.ts` 로 되돌린다. 시제품에서 본 결과다.

| 바꾼 것 | 실패해야 하는 테스트 |
|---|---|
| `unstable_rethrow(error);` 한 줄을 지운다 | `Next 의 제어 흐름` 4건 |
| `if (requestRecords.getStore()) return run();` 한 줄을 지운다 | `경계가 겹쳐도 한 번이다` |
| `if (!Sentry.getClient()) return;` 한 줄을 지운다 | `SDK 가 초기화되지 않았으면 flush 하지 않는다` |
| `scheduleFlush` 의 `try`/`catch` 를 벗긴다 | `after 를 쓸 수 없는 환경에서도 응답을 돌려준다` |
| 500 본문에 `details: String(error)` 를 더한다 | `핸들러가 던질 때` 6건 |

Run (바꿀 때마다): `npx vitest run __tests__/utils/with-safe-errors.test.ts`
Expected: 표의 테스트가 실패한다. 되돌린 뒤에는 25건이 통과한다.

- [ ] **Step 7: 커밋한다**

```bash
git status --short   # utils/with-safe-errors.ts 에 변이가 남아 있지 않은지 본다
git add utils/with-safe-errors.ts vitest.setup.ts __tests__/utils/with-safe-errors.test.ts
git commit -m "feat(logging): route handler 의 예외를 경계에서 잡는 withSafeErrors 를 더한다"
```

---

### Task 5: 전달 테스트 — CI, 실제 SDK

**Files:**
- Test: `__tests__/utils/log-safe-error-delivery.test.ts`

운영 코드를 바꾸지 않는다. 지금 성립하는 성질("핸들러 끝의 flush 가 방금 남긴 기록의 전송을 기다린다")을 고정하는 테스트다. 그래서 처음부터 통과한다 — 대신 틈을 일부러 만들어 테스트가 그것을 잡는지 본다.

- [ ] **Step 1: 테스트를 쓴다**

`__tests__/utils/log-safe-error-delivery.test.ts`:

```ts
// @vitest-environment node
/**
 * 전달 테스트 (설계 §5.2). 실제 Sentry SDK 와 SDK 의 route handler 래퍼를 쓰고, transport 만 손으로 푸는 것으로 바꾼다.
 *
 * 묻는 것: 핸들러가 기록을 남기고 **바로** 응답해도, SDK 가 핸들러 끝에서 waitUntil 에 건 flush 가 그 이벤트의
 * 전송을 기다리는가. SentryLogTarget 은 captureException 앞에서 `await import` 를 한다 — 그 사이에 flush 가
 * 먼저 끝나면 이벤트는 기다림 밖에 남는다(#74 가 걱정한 틈).
 *
 * 실제 서버(next start)에서 같은 것을 재는 것은 `npm run test:envelope` 의 전달 시나리오다. 이 파일은 CI 에서 돈다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const afterTasks: Array<() => Promise<void>> = [];

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => {
    afterTasks.push(task);
  },
}));
vi.unmock('next/navigation');

const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
const globals = globalThis as unknown as Record<symbol, unknown>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Send = { body: string; release: () => void };
type Wait = { promise: Promise<unknown>; settled: boolean };

async function setup() {
  // 운영의 로거(Console + Sentry target)를 쓰려면 모듈을 불러오기 전에 환경을 정해야 한다.
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');

  const Sentry = await import('@sentry/nextjs');
  const sends: Send[] = [];
  const client = new Sentry.NodeClient({
    dsn: 'http://envtestkey@127.0.0.1:9/1',
    integrations: [],
    stackParser: Sentry.defaultStackParser,
    // 전송이 끝나는 때를 테스트가 정한다. 네트워크로는 아무것도 나가지 않는다.
    transport: () =>
      Sentry.createTransport({ recordDroppedEvent: () => undefined }, (request) =>
        new Promise((resolve) => {
          sends.push({ body: String(request.body), release: () => resolve({ statusCode: 200 }) });
        }),
      ),
  });
  Sentry.setCurrentClient(client);
  client.init();

  // Vercel 의 요청 컨텍스트. SDK 의 래퍼는 flush 를 여기의 waitUntil 에 건다.
  const waits: Wait[] = [];
  globals[REQUEST_CONTEXT] = {
    get: () => ({
      waitUntil(promise: Promise<unknown>) {
        const wait: Wait = { promise, settled: false };
        waits.push(wait);
        void promise.finally(() => {
          wait.settled = true;
        });
      },
    }),
  };

  const { withSafeErrors } = await import('@/utils/with-safe-errors');
  const { logSafeError } = await import('@/utils/log-safe-error');
  const { logError } = await import('@/utils/log-error');
  const wrap = (handler: () => Promise<Response>) =>
    Sentry.wrapRouteHandlerWithSentry(handler, { method: 'GET', parameterizedRoute: '/api/delivery' });

  // 래퍼를 한 번 돌려 둔다. 처음 도는 코드는 느려서(모듈 평가, JIT) 그 사이에 늦은 기록이 flush 를 따라잡는다 —
  // 틈이 있어도 가려진다. 실제 서버의 첫 요청은 `npm run test:envelope` 의 전달 시나리오가 잰다.
  await wrap(async () => Response.json({ warm: true }))();
  await Promise.all(waits.map((wait) => wait.promise));
  waits.length = 0;

  return { sends, waits, wrap, withSafeErrors, logSafeError, logError };
}

describe('전달: 핸들러 끝의 flush 가 방금 남긴 기록을 기다린다', () => {
  beforeEach(() => {
    afterTasks.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete globals[REQUEST_CONTEXT];
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['logSafeError', 'logError'] as const)('%s 뒤에 바로 응답해도 flush 는 전송이 끝날 때까지 끝나지 않는다', async (via) => {
    const { sends, waits, wrap, logSafeError, logError } = await setup();

    const handler = wrap(async () => {
      if (via === 'logSafeError') logSafeError('envtest.delivery.handled', new Error('x'));
      else logError('envtest delivery legacy', new Error('envtest delivery legacy'));
      return Response.json({ ok: true });
    });
    const response = await handler();

    // 응답은 전송을 기다리지 않는다.
    expect(response.status).toBe(200);
    // SDK 의 래퍼는 요청마다 한 번 flush 를 건다.
    expect(waits).toHaveLength(1);

    await vi.waitFor(() => expect(sends).toHaveLength(1));
    // 틈이 있었다면 flush 는 빈 큐를 보고 이미 끝났을 것이다.
    await sleep(30);
    expect(waits[0].settled).toBe(false);

    sends[0].release();
    await vi.waitFor(() => expect(waits[0].settled).toBe(true));
    expect(sends[0].body).toContain(via === 'logSafeError' ? 'envtest.delivery.handled' : 'envtest delivery legacy');
  });

  // 보장하지 못하는 것(설계 §4.3 의 3)을 고정한다.
  it('핸들러가 끝난 뒤에 남긴 기록은 그 요청의 flush 가 기다리지 않는다', async () => {
    const { sends, waits, wrap, logSafeError } = await setup();

    await wrap(async () => Response.json({ ok: true }))();
    expect(waits).toHaveLength(1);
    await waits[0].promise;
    expect(sends).toHaveLength(0);

    logSafeError('envtest.delivery.handled', new Error('x'));
    await vi.waitFor(() => expect(sends).toHaveLength(1));
    expect(waits).toHaveLength(1);
    sends[0].release();
  });

  it('경계 함수의 flush 는 전송이 끝나면 조용히 끝난다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sends, waits, wrap, withSafeErrors } = await setup();

    const handler = wrap(
      withSafeErrors('envtest.delivery.unhandled', async () => {
        throw new Error('cnry-message');
      }),
    );
    const response = await handler();

    expect(response.status).toBe(500);
    // flush 를 부르는 곳은 둘이다: SDK 의 래퍼(요청마다)와 경계 함수(오류를 기록한 요청에서만).
    expect(waits).toHaveLength(1);
    expect(afterTasks).toHaveLength(1);

    await vi.waitFor(() => expect(sends).toHaveLength(1));
    expect(sends[0].body).toContain('envtest.delivery.unhandled');
    expect(sends[0].body).not.toMatch(/cnry/i);

    let flushed = false;
    const boundaryFlush = afterTasks[0]().then(() => {
      flushed = true;
    });
    await sleep(30);
    expect(flushed).toBe(false);

    sends[0].release();
    await boundaryFlush;
    await vi.waitFor(() => expect(waits[0].settled).toBe(true));
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 통과를 확인한다**

Run: `for i in 1 2 3 4 5; do npx vitest run __tests__/utils/log-safe-error-delivery.test.ts 2>&1 | grep -E "Tests "; done`
Expected: 다섯 번 모두 `Tests 4 passed (4)`. 한 번이라도 실패하면 재시도로 덮지 않고 원인을 찾는다.

- [ ] **Step 3: 틈을 만들어 실패를 본다 (되돌린다)**

`utils/logger-targets.ts` 의 `const Sentry = await import('@sentry/nextjs');` 바로 앞에 한 줄을 넣는다.

```ts
      await new Promise((resolve) => setTimeout(resolve, 5));
```

Run: `npx vitest run __tests__/utils/log-safe-error-delivery.test.ts`
Expected: FAIL 2건 — `logSafeError 뒤에 바로 응답해도…`, `logError 뒤에 바로 응답해도…` 가 `expected true to be false`(flush 가 빈 큐를 보고 이미 끝났다). 나머지 둘은 통과한다.

Run: `git checkout -- utils/logger-targets.ts && npx vitest run __tests__/utils/log-safe-error-delivery.test.ts`
Expected: PASS (4건).

- [ ] **Step 4: 커밋한다**

```bash
git status --short   # utils/logger-targets.ts 가 바뀌어 있지 않은지 본다
git add __tests__/utils/log-safe-error-delivery.test.ts
git commit -m "test(logging): 핸들러 끝의 flush 가 방금 남긴 기록을 기다리는지 실제 SDK 로 고정한다"
```

---

### Task 6: envelope 판정 모듈 — 가린 기록의 모양과 서버 출력

**Files:**
- Modify: `scripts/envelope-test/analyze.js`
- Test: `__tests__/scripts/envelope-test-analyze.test.ts`

**Interfaces:**
- Produces: `expected.errors[]` 의 규칙에 선택 항목 `type`(예외의 type), `fingerprint`(배열), `logContext`(`contexts.log` 에서 `timestamp` 를 뺀 전부)를 적을 수 있다. `expected.stdout[] = { label, includes, count }` 는 서버 출력에서 `includes` 가 든 줄의 수를 센다.

- [ ] **Step 1: 실패하는 테스트를 더한다**

```diff
--- a/__tests__/scripts/envelope-test-analyze.test.ts
+++ b/__tests__/scripts/envelope-test-analyze.test.ts
@@ -222,3 +222,275 @@ describe('evaluate', () => {
     expect(result.failures).toContain('수신 건수 — 미처리(node): 기대 1건, 실제 0건');
   });
 });
+
+describe('evaluate — 가린 기록의 모양과 서버 출력 (설계 §4.2, §4.3)', () => {
+  const USER_ID = '4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a';
+  const safeExpected = {
+    errors: [
+      {
+        label: '가린 기록',
+        handled: true,
+        valueIncludes: 'envtest.boundary.handled',
+        count: 1,
+        type: 'Error',
+        fingerprint: ['{{ default }}', 'envtest.boundary.handled'],
+        logContext: { userId: USER_ID, httpStatus: 502, errorCode: 'unknown', droppedFields: ['paymentId'] },
+      },
+    ],
+    transactions: [],
+    stdout: [{ label: '가린 로그 줄', includes: 'ERROR: envtest.boundary.handled', count: 1 }],
+  };
+  const safeStdout = [
+    'envtest console cnryC-console',
+    '[2026-10-06T00:00:00.000Z] ERROR: envtest.boundary.handled {',
+    "  message: 'envtest.boundary.handled',",
+    "    stack: 'Error: envtest.boundary.handled\\n' +",
+    '}',
+  ].join('\n');
+  const safeEvent = () => ({
+    exception: { values: [{ type: 'Error', value: 'envtest.boundary.handled', mechanism: { type: 'generic', handled: true } }] },
+    fingerprint: ['{{ default }}', 'envtest.boundary.handled'],
+    // 키 순서는 판정과 무관하다.
+    contexts: { log: { droppedFields: ['paymentId'], errorCode: 'unknown', httpStatus: 502, timestamp: '2026-10-06T00:00:00.000Z', userId: USER_ID } },
+  });
+  const runSafe = (event: Record<string, unknown>, stdout = safeStdout) =>
+    evaluate({
+      envelopes: [envelopeOf('event', event)],
+      stdout,
+      canaries: { absent: canaries.absent, stdoutOnly: canaries.stdoutOnly, unhandled: {} },
+      expected: safeExpected,
+      unhandledLineMarker: 'envtest unhandled',
+    });
+
+  it('모양이 맞고 로그 줄이 기대한 수만큼 있으면 실패가 없다', () => {
+    const result = runSafe(safeEvent());
+    expect(result.failures).toEqual([]);
+    expect(result.counts).toEqual([
+      { label: '가린 기록', expected: '1', actual: 1 },
+      { label: '가린 로그 줄', expected: '1', actual: 1 },
+    ]);
+  });
+
+  it('예외 type 이 기대와 다르면 실패한다 — 표에 없는 오류 이름이 그대로 나간 것이다', () => {
+    const event = safeEvent();
+    event.exception.values[0].type = 'EnvtestSecretName';
+    expect(runSafe(event).failures).toEqual(['가린 기록: 예외 type 이 Error 가 아니다']);
+  });
+
+  it('fingerprint 가 없거나 다르면 실패한다', () => {
+    const missing = safeEvent() as Record<string, unknown>;
+    delete missing.fingerprint;
+    const different = { ...safeEvent(), fingerprint: ['envtest.boundary.handled'] };
+    expect(runSafe(missing).failures).toEqual(['가린 기록: fingerprint 가 기대와 다르다']);
+    expect(runSafe(different).failures).toEqual(['가린 기록: fingerprint 가 기대와 다르다']);
+  });
+
+  it('contexts.log 에 계약 밖의 키가 있으면 실패하고, 값은 보고에 싣지 않는다', () => {
+    const event = safeEvent();
+    Object.assign(event.contexts.log, { email: 'someone@example.com' });
+    expect(runSafe(event).failures).toEqual([
+      '가린 기록: contexts.log 가 기대와 다르다(키: droppedFields, email, errorCode, httpStatus, userId)',
+    ]);
+  });
+
+  it('contexts.log 의 값이 다르거나 빠지면 실패한다', () => {
+    const changed = safeEvent();
+    changed.contexts.log.droppedFields = [];
+    const missing = safeEvent() as { contexts?: unknown };
+    delete missing.contexts;
+    expect(runSafe(changed).failures).toEqual([
+      '가린 기록: contexts.log 가 기대와 다르다(키: droppedFields, errorCode, httpStatus, userId)',
+    ]);
+    expect(runSafe(missing as Record<string, unknown>).failures).toEqual(['가린 기록: contexts.log 가 기대와 다르다(키: 없음)']);
+  });
+
+  it('가린 로그 줄이 없거나 더 많으면 실패한다', () => {
+    const none = runSafe(safeEvent(), 'envtest console cnryC-console');
+    const twice = runSafe(safeEvent(), `${safeStdout}\n${safeStdout}`);
+    expect(none.failures).toEqual(['서버 출력 — 가린 로그 줄: 기대 1줄, 실제 0줄']);
+    expect(twice.failures).toEqual(['서버 출력 — 가린 로그 줄: 기대 1줄, 실제 2줄']);
+  });
+
+  it('모양을 적지 않은 규칙은 예전처럼 건수만 본다', () => {
+    expect(run(clean()).failures).toEqual([]);
+  });
+});
+
+describe('evaluate — 경계가 돌려준 응답 (설계 §4.7)', () => {
+  const SAFE_500 = { status: 500, json: { error: 'Internal server error' } };
+  const safeResponse = () => ({ label: 'boundary-throw', status: 500, body: '{"error":"Internal server error"}', expect: SAFE_500 });
+  const runResponses = (responses: Array<Record<string, unknown>>) =>
+    evaluate({ envelopes: clean(), stdout: stdoutOk, canaries, expected, unhandledLineMarker: 'envtest unhandled', responses });
+
+  it('응답 코드와 본문이 정해진 값이면 실패가 없고, 요청 종류마다 건수를 센다', () => {
+    const result = runResponses([safeResponse(), safeResponse(), { ...safeResponse(), label: 'boundary-hostile' }]);
+
+    expect(result.failures).toEqual([]);
+    expect(result.counts.slice(-2)).toEqual([
+      { label: '응답(boundary-throw)', expected: '2', actual: 2 },
+      { label: '응답(boundary-hostile)', expected: '1', actual: 1 },
+    ]);
+  });
+
+  it('키 순서와 공백은 판정과 무관하다', () => {
+    const expectation = { status: 200, json: { ok: true, order: 1 } };
+    const response = { label: 'boundary-handled', status: 200, body: '{ "order": 1, "ok": true }', expect: expectation };
+    expect(runResponses([response]).failures).toEqual([]);
+  });
+
+  it('응답 코드가 다르면 실패한다', () => {
+    const result = runResponses([{ ...safeResponse(), status: 200 }]);
+
+    expect(result.failures).toEqual(['응답 — boundary-throw: 응답 코드 기대 500, 실제 200']);
+    expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-throw)', expected: '1', actual: 0 }]);
+  });
+
+  // 경계가 뚫리면 Next 가 응답한다. 코드는 같은 500 이고 본문만 다르다.
+  it.each([
+    ['Next 의 기본 500 본문', 'Internal Server Error'],
+    ['빈 본문', ''],
+    ['다른 JSON', '{"error":"Internal server error","detail":"x"}'],
+  ])('본문이 정해진 JSON 이 아니면(%s) 실패한다', (_label, body) => {
+    const result = runResponses([{ ...safeResponse(), body }]);
+
+    expect(result.failures).toEqual(['응답 — boundary-throw: 본문이 정해진 JSON 이 아니다']);
+    expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-throw)', expected: '1', actual: 0 }]);
+  });
+
+  it('본문에 canary 가 있으면 실패하고, 본문은 보고에 싣지 않는다', () => {
+    const result = runResponses([{ ...safeResponse(), body: '{"error":"envtest cnryA-cookie cnryB-marker"}' }]);
+
+    expect(result.failures).toEqual([
+      '응답 — boundary-throw: 본문이 정해진 JSON 이 아니다',
+      '누출(응답 본문) — cookie: boundary-throw',
+      '누출(응답 본문) — marker: boundary-throw',
+    ]);
+  });
+
+  describe('경계가 올려보낸 redirect() 신호', () => {
+    const REDIRECT = { status: 307, location: '/api/envelope-test/redirected', body: '' };
+    const redirected = () => ({
+      label: 'boundary-redirect',
+      url: 'http://127.0.0.1:3000/api/envelope-test/boundary-redirect?code=x',
+      status: 307,
+      location: '/api/envelope-test/redirected',
+      body: '',
+      expect: REDIRECT,
+    });
+
+    it('응답 코드·Location·빈 본문이 맞으면 실패가 없다', () => {
+      const result = runResponses([redirected(), redirected()]);
+
+      expect(result.failures).toEqual([]);
+      expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-redirect)', expected: '2', actual: 2 }]);
+    });
+
+    it('Location 이 절대 주소여도 같은 곳을 가리키면 맞다', () => {
+      const absolute = { ...redirected(), location: 'http://127.0.0.1:3000/api/envelope-test/redirected' };
+      expect(runResponses([absolute]).failures).toEqual([]);
+    });
+
+    // 경계가 신호를 오류로 다루면 307 대신 고정된 500 이 나온다.
+    it('경계가 신호를 오류로 다뤄 500 을 돌려주면 실패한다', () => {
+      const result = runResponses([{ ...redirected(), status: 500, location: null, body: '{"error":"Internal server error"}' }]);
+
+      expect(result.failures).toEqual([
+        '응답 — boundary-redirect: 응답 코드 기대 307, 실제 500',
+        '응답 — boundary-redirect: 본문이 정해진 값이 아니다',
+        '응답 — boundary-redirect: Location 이 기대와 다르다',
+      ]);
+      expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-redirect)', expected: '1', actual: 0 }]);
+    });
+
+    it('응답 코드가 다른 redirect(308)면 실패한다', () => {
+      expect(runResponses([{ ...redirected(), status: 308 }]).failures).toEqual(['응답 — boundary-redirect: 응답 코드 기대 307, 실제 308']);
+    });
+
+    it.each([
+      ['다른 경로', '/api/envelope-test/elsewhere'],
+      ['쿼리가 붙은 주소', '/api/envelope-test/redirected?next=/x'],
+      ['다른 호스트', 'https://envtest.invalid/api/envelope-test/redirected'],
+      ['빈 값', ''],
+      ['없음', null],
+    ])('Location 이 기대와 다르면(%s) 실패한다', (_label, location) => {
+      expect(runResponses([{ ...redirected(), location }]).failures).toEqual(['응답 — boundary-redirect: Location 이 기대와 다르다']);
+    });
+
+    it('본문이 비어 있지 않으면 실패한다', () => {
+      expect(runResponses([{ ...redirected(), body: 'Redirecting...' }]).failures).toEqual(['응답 — boundary-redirect: 본문이 정해진 값이 아니다']);
+    });
+
+    it('Location 에 canary 가 있으면 실패하고, 받은 값은 보고에 싣지 않는다', () => {
+      const result = runResponses([{ ...redirected(), location: '/api/envelope-test/redirected?code=cnryA-cookie' }]);
+
+      expect(result.failures).toEqual(['응답 — boundary-redirect: Location 이 기대와 다르다', '누출(응답 헤더) — cookie: boundary-redirect']);
+    });
+
+    describe('핸들러가 redirect 앞에서 쓴 쿠키', () => {
+      const withCookie = (setCookies: unknown) => ({
+        ...redirected(),
+        label: 'boundary-stateful-1',
+        setCookies,
+        expect: { ...REDIRECT, cookie: { name: 'envtest-boundary', value: 'kept' } },
+      });
+
+      it.each([
+        ['속성이 붙은 쿠키', ['envtest-boundary=kept; Path=/']],
+        ['속성이 없는 쿠키', ['envtest-boundary=kept']],
+        ['다른 쿠키와 함께', ['other=1; Path=/', 'envtest-boundary=kept; Path=/; HttpOnly']],
+      ])('Set-Cookie 에 그 이름과 값이 있으면(%s) 맞다', (_label, setCookies) => {
+        const result = runResponses([withCookie(setCookies)]);
+
+        expect(result.failures).toEqual([]);
+        expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-stateful-1)', expected: '1', actual: 1 }]);
+      });
+
+      it.each([
+        ['Set-Cookie 가 없다', []],
+        ['기록이 없다', undefined],
+        ['값이 다르다', ['envtest-boundary=dropped; Path=/']],
+        ['값의 앞부분만 같다', ['envtest-boundary=kept2; Path=/']],
+        ['이름의 뒷부분만 같다', ['x-envtest-boundary=kept; Path=/']],
+        ['다른 쿠키뿐이다', ['other=1; Path=/']],
+      ])('쿠키가 응답에 없으면(%s) 실패한다', (_label, setCookies) => {
+        const result = runResponses([withCookie(setCookies)]);
+
+        expect(result.failures).toEqual(['응답 — boundary-stateful-1: Set-Cookie 에 envtest-boundary 이 기대한 값으로 없다']);
+        expect(result.counts.slice(-1)).toEqual([{ label: '응답(boundary-stateful-1)', expected: '1', actual: 0 }]);
+      });
+
+      it('Set-Cookie 에 canary 가 있으면 실패하고, 받은 값은 보고에 싣지 않는다', () => {
+        const result = runResponses([withCookie(['envtest-boundary=kept; Path=/', 'session=cnryA-cookie; Path=/'])]);
+
+        expect(result.failures).toEqual(['누출(응답 헤더) — cookie: boundary-stateful-1']);
+      });
+    });
+
+    it('그 요청의 오류 이벤트는 처리했든 아니든 하나도 없어야 한다', () => {
+      const transaction = 'GET /api/envelope-test/boundary-redirect';
+      const withRule = { ...expected, errorFree: [{ label: '올려보낸 redirect 신호', transaction }] };
+      const judge = (envelopes: Envelope[]) =>
+        evaluate({ envelopes, stdout: stdoutOk, canaries, expected: withRule, unhandledLineMarker: 'envtest unhandled' });
+
+      const none = judge(clean());
+      expect(none.failures).toEqual([]);
+      expect(none.counts).toContainEqual({ label: '올려보낸 redirect 신호', expected: '0', actual: 0 });
+
+      // 경계가 신호를 오류로 잡으면 가린 기록의 이벤트가 이 요청의 transaction 이름으로 온다.
+      const safeEvent = {
+        transaction,
+        exception: { values: [{ type: 'Error', value: 'envtest.boundary.unhandled', mechanism: { type: 'generic', handled: true } }] },
+      };
+      const recorded = judge([...clean(), envelopeOf('event', safeEvent), envelopeOf('event', { ...safeEvent })]);
+      expect(recorded.failures).toEqual(['수신 건수 — 올려보낸 redirect 신호: 오류 이벤트 기대 0건, 실제 2건']);
+      expect(recorded.counts).toContainEqual({ label: '올려보낸 redirect 신호', expected: '0', actual: 2 });
+    });
+  });
+
+  it('기대를 적지 않은 응답은 보지 않는다 — 페이지의 HTML 은 요청 주소를 담는다', () => {
+    const result = runResponses([{ label: 'page', status: 200, body: '<html>/ko/vote?code=cnryA-cookie</html>' }]);
+
+    expect(result.failures).toEqual([]);
+    expect(result.counts.map((count) => count.label)).not.toContain('응답(page)');
+  });
+});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-analyze.test.ts`
Expected: FAIL 6건(새 `describe` 의 일곱 가운데 마지막 `모양을 적지 않은 규칙은 예전처럼 건수만 본다` 만 통과한다). 판정이 `type`·`fingerprint`·`logContext`·`stdout` 을 아직 보지 않는다.

- [ ] **Step 3: 구현한다**

```diff
--- a/scripts/envelope-test/analyze.js
+++ b/scripts/envelope-test/analyze.js
@@ -9,6 +9,9 @@
  *   2. 무누출 — 묶음 A 는 envelope 과 표준 출력 어디에도 없다. 묶음 C 는 표준 출력에만 있다.
  *   3. 허용 노출 — 묶음 B 의 marker 는 exception.values[].value 와 Next 의 미처리 오류 줄에만 있다.
  *   4. tripwire 표식은 기대한 이벤트에만 있다. 다른 곳에 있으면 토큰 모양 값이 새다가 가려진 것이다.
+ *   5. 가린 기록(logSafeError)의 이벤트는 정해진 모양이고, 가린 로그 줄이 서버 출력에 기대한 수만큼 있다(설계 §4.2, §4.3).
+ *   6. 경계(withSafeErrors)를 거친 응답은 정해진 코드와 본문(redirect 는 Location)이고, 거기에 canary 가 없다(설계 §4.7).
+ *      경계가 올려보낸 신호의 요청에는 오류 이벤트가 없다.
  */

 const TRIPWIRE_KEY = 'redaction.tripwire';
@@ -113,6 +116,85 @@ const hasFrameVars = (event) =>
     ((value.stacktrace && value.stacktrace.frames) || []).some((frame) => frame && frame.vars !== undefined),
   );

+/** 키 순서와 무관하게 비교하려고 객체의 키를 정렬한다. */
+const canonical = (value) => {
+  if (Array.isArray(value)) return value.map(canonical);
+  if (value && typeof value === 'object') {
+    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
+  }
+  return value;
+};
+
+const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
+
+/**
+ * 가린 기록의 이벤트가 정해진 모양인가 (설계 §4.2). rule 에 적은 항목만 본다.
+ *   type        — 예외의 type(오류 이름). 표에 없는 이름은 'Error' 여야 한다.
+ *   fingerprint — 사건 코드로 이슈를 가른다.
+ *   logContext  — contexts.log 에서 timestamp 를 뺀 나머지 전부. 계약을 통과한 필드만 있어야 한다.
+ */
+function shapeProblems(event, rule) {
+  const problems = [];
+  if (rule.type !== undefined && exceptionValues(event).some((value) => value.type !== rule.type)) {
+    problems.push(`예외 type 이 ${rule.type} 가 아니다`);
+  }
+  if (rule.fingerprint !== undefined && !sameJson(event.fingerprint, rule.fingerprint)) {
+    problems.push('fingerprint 가 기대와 다르다');
+  }
+  if (rule.logContext !== undefined) {
+    const actual = { ...((event.contexts && event.contexts.log) || {}) };
+    delete actual.timestamp;
+    if (!sameJson(actual, rule.logContext)) {
+      problems.push(`contexts.log 가 기대와 다르다(키: ${Object.keys(actual).sort().join(', ') || '없음'})`);
+    }
+  }
+  return problems;
+}
+
+/** Location 헤더는 상대 주소일 수도 절대 주소일 수도 있다. 요청 주소를 기준으로 풀어서 비교한다. */
+function sameLocation(response, expected) {
+  if (typeof response.location !== 'string') return false;
+  try {
+    return new URL(response.location, response.url).href === new URL(expected, response.url).href;
+  } catch {
+    return false;
+  }
+}
+
+/** Set-Cookie 헤더 가운데 이 이름과 값을 쓰는 것이 있는가. 속성(Path 등)은 보지 않는다. */
+function setsCookie(response, cookie) {
+  const pair = `${cookie.name}=${cookie.value}`;
+  return (response.setCookies || []).some((line) => line === pair || line.startsWith(`${pair};`));
+}
+
+/**
+ * 응답이 요청에 적은 기대와 같은가. 경계가 뚫려 Next 가 응답해도 코드는 같은 500 이라 본문까지 본다.
+ *   status   — 응답 코드.
+ *   json     — 본문을 JSON 으로 읽은 값 전부.
+ *   body     — 본문 그대로. redirect 처럼 본문이 없어야 하는 응답에 쓴다.
+ *   location — Location 헤더가 가리키는 주소.
+ *   cookie   — 응답이 써야 하는 쿠키({ name, value }). 핸들러가 redirect 앞에서 쓴 쿠키가 응답까지 가는지 본다.
+ */
+function responseProblems(response) {
+  const problems = [];
+  const { status, json, body, location, cookie } = response.expect;
+  if (response.status !== status) problems.push(`응답 코드 기대 ${status}, 실제 ${response.status}`);
+  if (body !== undefined && response.body !== body) problems.push('본문이 정해진 값이 아니다');
+  if (location !== undefined && !sameLocation(response, location)) problems.push('Location 이 기대와 다르다');
+  if (cookie !== undefined && !setsCookie(response, cookie)) problems.push(`Set-Cookie 에 ${cookie.name} 이 기대한 값으로 없다`);
+  if (json !== undefined) {
+    let actual;
+    let parsed = true;
+    try {
+      actual = JSON.parse(response.body);
+    } catch {
+      parsed = false;
+    }
+    if (!parsed || !sameJson(actual, json)) problems.push('본문이 정해진 JSON 이 아니다');
+  }
+  return problems;
+}
+
 function matchesError(event, rule) {
   if (exceptionValues(event).length === 0) return false;
   if (isHandled(event) !== rule.handled) return false;
@@ -150,7 +232,7 @@ function countsSatisfied(envelopes, expected) {
   );
 }

-function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker }) {
+function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker, responses }) {
   const failures = [];
   const counts = [];
   const errors = payloadsOf(envelopes, 'event');
@@ -171,8 +253,15 @@ function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker }
         }
       }
       if (hasFrameVars(event)) failures.push(`${rule.label}: stack frame 에 vars 가 실렸다`);
+      for (const problem of shapeProblems(event, rule)) failures.push(`${rule.label}: ${problem}`);
     }
   }
+  // 오류 이벤트가 없어야 하는 요청. 처리했든 아니든 그 요청의 이벤트는 하나도 오면 안 된다.
+  for (const rule of expected.errorFree || []) {
+    const actual = errors.filter((event) => event.transaction === rule.transaction).length;
+    counts.push({ label: rule.label, expected: '0', actual });
+    if (actual !== 0) failures.push(`수신 건수 — ${rule.label}: 오류 이벤트 기대 0건, 실제 ${actual}건`);
+  }
   for (const rule of expected.transactions) {
     const matched = transactionsNamed(envelopes, rule.name);
     counts.push({ label: rule.label, expected: `${rule.min} 이상`, actual: matched.length });
@@ -208,6 +297,13 @@ function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker }

   const records = flatten(envelopes);
   const stdoutLines = stdout.split('\n');
+
+  // 서버 출력에 있어야 하는 줄. 가린 로그 한 줄이 실제로 남았는지 센다.
+  for (const rule of expected.stdout || []) {
+    const actual = stdoutLines.filter((line) => line.includes(rule.includes)).length;
+    counts.push({ label: rule.label, expected: `${rule.count}`, actual });
+    if (actual !== rule.count) failures.push(`서버 출력 — ${rule.label}: 기대 ${rule.count}줄, 실제 ${actual}줄`);
+  }
   const reportLeak = (name, hits) => {
     for (const where of summarize(hits)) failures.push(`누출(envelope) — ${name}: ${where}`);
   };
@@ -242,6 +338,25 @@ function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker }
   );
   for (const where of summarize(strayTripwire)) failures.push(`예상하지 않은 tripwire — ${TRIPWIRE_KEY}: ${where}`);

+  // 6. 응답 — 기대를 적은 요청은 응답 코드·본문·Location·쿠키가 정해진 값이고, 거기에 canary 가 없다. 받은 값은 보고에 싣지 않는다.
+  const checked = (responses || []).filter((response) => response.expect);
+  const allCanaries = Object.values(canaries).flatMap((group) => Object.entries(group));
+  for (const label of [...new Set(checked.map((response) => response.label))]) {
+    const group = checked.filter((response) => response.label === label);
+    let matched = 0;
+    for (const response of group) {
+      const problems = responseProblems(response);
+      if (problems.length === 0) matched += 1;
+      for (const problem of problems) failures.push(`응답 — ${label}: ${problem}`);
+      for (const [name, value] of allCanaries) {
+        if (response.body.includes(value)) failures.push(`누출(응답 본문) — ${name}: ${label}`);
+        const headers = [response.location, ...(response.setCookies || [])].filter((header) => typeof header === 'string');
+        if (headers.some((header) => header.includes(value))) failures.push(`누출(응답 헤더) — ${name}: ${label}`);
+      }
+    }
+    counts.push({ label: `응답(${label})`, expected: `${group.length}`, actual: matched });
+  }
+
   return { failures: [...new Set(failures)], counts };
 }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-analyze.test.ts`
Expected: PASS (26건).

- [ ] **Step 5: 커밋한다**

```bash
git add scripts/envelope-test/analyze.js __tests__/scripts/envelope-test-analyze.test.ts
git commit -m "test(envelope): 가린 기록의 모양과 서버 출력의 로그 줄을 판정한다"
```

---

### Task 7: 누출 시나리오에 경계 요청을 더한다 — 경계 없이 실패를 먼저 본다

**Files:**
- Modify: `scripts/envelope-test/routes/_lib/envtest.ts` (`hostileError`)
- Modify: `scripts/envelope-test/scenario.js`
- Create: `scripts/envelope-test/routes/boundary-throw/route.ts`
- Create: `scripts/envelope-test/routes/boundary-handled/route.ts`
- Test: `__tests__/scripts/envelope-test-routes.test.ts`

**Interfaces:**
- Consumes: Task 3 의 `logSafeError`, Task 4 의 `withSafeErrors`, Task 6 의 규칙 항목
- Produces: `scenario.js` 가 `KEPT = { userId, orderId }` 를 내보낸다. 요청 label `boundary-throw`, `boundary-handled`

- [ ] **Step 1: 테스트용 오류와 시나리오를 더한다**

```diff
--- a/scripts/envelope-test/routes/_lib/envtest.ts
+++ b/scripts/envelope-test/routes/_lib/envtest.ts
@@ -28,3 +28,23 @@ export function unhandledMessage(headers: Headers): string {
     `email=${value('email')}`,
   ].join(' ');
 }
+
+/**
+ * 경계 함수와 계약 함수를 시험하는 오류. 이름·메시지·stack·cause 에 요청 헤더의 값을 섞는다.
+ * 이 가운데 어느 것도 Sentry 와 서버 출력에 나오면 안 된다(설계 §4.2).
+ */
+export function hostileError(headers: Headers): Error {
+  const value = (name: string) => headers.get(`x-envtest-boundary-${name}`) ?? 'none';
+  const error = new Error(
+    [
+      `envtest boundary ${value('message')}`,
+      `url=https://envtest.invalid/callback?code=${value('query')}`,
+      `jwt=${value('jwt')}`,
+      `auth=Bearer ${value('bearer')}`,
+    ].join(' '),
+    { cause: new Error(`envtest cause ${value('cause')}`) },
+  );
+  error.name = `Envtest${value('name')}`;
+  error.stack = `${error.name}: envtest boundary\n    at https://envtest.invalid/app.js?code=${value('stack')}:1:1`;
+  return error;
+}
```

```diff
--- a/scripts/envelope-test/scenario.js
+++ b/scripts/envelope-test/scenario.js
@@ -7,11 +7,30 @@
  *   absent     — envelope 과 서버 표준 출력 어디에도 없어야 한다.
  *   stdoutOnly — 테스트 라우트가 console.warn 으로 찍는다. 서버 출력에만 있어야 한다.
  *   unhandled  — 감싸지 않은 예외. marker 만 exception.values[].value 와 Next 의 미처리 오류 줄에 남는다.
+ *
+ * 경계 함수(withSafeErrors)로 감싼 요청의 값은 absent 묶음이다 — 던진 오류의 어떤 것도 어디에도 남지 않는다.
  */

 const REPEAT = 3;
 const TRACE_ID = '0123456789abcdef0123456789abcdef';
 const UNHANDLED_LINE_MARKER = 'envtest unhandled';
+// 테스트 라우트가 쓰는 사건 코드(utils/log-event-codes.ts).
+const BOUNDARY_CODE = 'envtest.boundary.unhandled';
+const HANDLED_CODE = 'envtest.boundary.handled';
+const HOSTILE_CODE = 'envtest.boundary.hostile';
+const SELF_THROW_CODE = 'envtest.boundary.self_throw';
+/** 경계가 오류를 잡았을 때의 응답(utils/with-safe-errors.ts). 본문에 오류의 어떤 것도 없다. */
+const SAFE_500 = { status: 500, json: { error: 'Internal server error' } };
+/** boundary-redirect 라우트가 redirect() 에 넘기는 주소. 요청은 따라가지 않는다(redirect: 'manual'). */
+const REDIRECT_TARGET = '/api/envelope-test/redirected';
+/** boundary-stateful 라우트가 redirect 앞에서 next/headers 의 cookies() 로 쓰는 쿠키. 비밀이 아니다. */
+const STATEFUL_COOKIE = { name: 'envtest-boundary', value: 'kept' };
+
+/** 계약을 통과해 남아야 하는 값. canary 가 아니다 — 이벤트의 contexts.log 와 서버 출력에 있어야 한다. */
+const KEPT = {
+  userId: '4d3c2b1a-0f9e-4d8c-9b7a-6f5e4d3c2b1a',
+  orderId: 'envtest_order_0001',
+};

 const CANARIES = {
   absent: {
@@ -26,6 +45,27 @@ const CANARIES = {
     handledQuery: 'cnryA-handledquery-6f7a8b9c0d',
     upstreamToken: 'cnryA-upstreamtoken-9e8d7c6b5a',
     baggageQuery: 'cnryA-baggagequery-3c2b1a0f9e',
+    // 경계 함수와 계약 함수(설계 §4.2, §4.7). 던진 오류의 이름·메시지·stack·cause 와 계약을 통과하지 못하는 필드 값이다.
+    // 경계가 없으면 Next 의 미처리 오류 줄과 예외 이벤트에, logError 로 남기면 이벤트와 로그 줄에 나온다.
+    boundaryMessage: 'cnryA-boundarymessage-2b3c4d5e6f',
+    boundaryQuery: 'cnryA-boundaryquery-7a8b9c0d1e',
+    boundaryName: 'cnryAboundaryname3f4a5b6c',
+    boundaryStack: 'cnryA-boundarystack-9d8c7b6a5f',
+    boundaryCause: 'cnryA-boundarycause-1e2d3c4b5a',
+    // 형식 위반(. 과 /)이라 버려져야 하는 ID
+    boundaryPaymentId: 'cnryA.boundarypaymentid/6b7c8d9e0f',
+    // 코드처럼 생겼지만 표에 없는 값. 'unknown' 으로 바뀌어야 한다
+    boundaryErrorCode: 'cnryA_boundaryerrorcode_4d5e6f7a8b',
+    boundaryJwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbnJ5QS1ib3VuZGFyeSJ9.Y25yeUEtYm91bmRhcnktc2lnbmF0dXJl',
+    boundaryBearer: 'cnryA7boundarybearer5d7f9b1c3e',
+    // 던진 오류의 cause 를 읽으면 나오는 예외에 든 값. 경계가 cause 를 읽다가 그 예외를 놓치면 밖으로 나간다.
+    boundaryGetter: 'cnryA-boundarygetter-8c7d6e5f4a',
+    // cause 를 읽으면 자기 자신을 던지는 오류의 메시지에 든 값. 경계가 그 오류를 Next 의 신호로 잘못 보면 밖으로 나간다.
+    boundarySelf: 'cnryA-boundaryself-5a4b3c2d1e',
+    // redirect() 신호의 message 를 읽으면 나오는 예외에 든 값. Next 는 그 message 를 읽지 않는다 — 누가 읽으면 드러난다.
+    boundaryRedirect: 'cnryA-boundaryredirect-0e9f8a7b6c',
+    // 읽을 때마다 달라지는 redirect() 신호의 메시지·stack·cause·다른 속성에 든 값. 그 값이 경계 밖으로 나가면 드러난다.
+    boundaryStateful: 'cnryA-boundarystateful-4c5d6e7f8a',
   },
   stdoutOnly: {
     console: 'cnryC-console-0f1e2d3c4b',
@@ -48,6 +88,58 @@ const EXPECTED = {
     // captureRequestError 는 같은 오류를 다시 보내지 않으므로 이 이벤트에는 contexts.nextjs 가 없다.
     { label: '처리되지 않은 예외(node)', handled: false, runtime: 'node', valueIncludes: UNHANDLED_LINE_MARKER, count: REPEAT, tripwire: true },
     { label: '처리되지 않은 예외(edge)', handled: false, runtime: 'edge', valueIncludes: UNHANDLED_LINE_MARKER, count: REPEAT, tripwire: true },
+    // 경계 함수가 잡은 예외. 이벤트의 값은 사건 코드이고 원본 오류의 어떤 것도 없다. tripwire 태그도 없어야 한다
+    // (원본 메시지의 JWT·Bearer 가 이벤트에 닿았다가 가려진 것이 아니라 애초에 닿지 않는다).
+    {
+      label: '경계 함수가 잡은 예외',
+      handled: true,
+      transaction: 'GET /api/envelope-test/boundary-throw',
+      valueIncludes: BOUNDARY_CODE,
+      count: REPEAT,
+      type: 'Error',
+      fingerprint: ['{{ default }}', BOUNDARY_CODE],
+      logContext: {},
+    },
+    // 핸들러가 스스로 남긴 가린 기록. 계약을 통과한 필드만 남는다.
+    {
+      label: '경계 안에서 남긴 가린 기록',
+      handled: true,
+      transaction: 'GET /api/envelope-test/boundary-handled',
+      valueIncludes: HANDLED_CODE,
+      count: REPEAT,
+      type: 'Error',
+      fingerprint: ['{{ default }}', HANDLED_CODE],
+      logContext: { userId: KEPT.userId, orderId: KEPT.orderId, httpStatus: 502, errorCode: 'unknown', droppedFields: ['paymentId'] },
+    },
+    // 던진 값을 들여다보는 것을 방해하는 오류(cause 를 읽으면 던진다)도 경계가 잡아 같은 모양으로 남긴다.
+    {
+      label: '읽기를 방해하는 오류를 경계가 잡는다',
+      handled: true,
+      transaction: 'GET /api/envelope-test/boundary-hostile',
+      valueIncludes: HOSTILE_CODE,
+      count: REPEAT,
+      type: 'Error',
+      fingerprint: ['{{ default }}', HOSTILE_CODE],
+      logContext: {},
+    },
+    // cause 를 읽으면 자기 자신을 던지는 오류. Next 의 신호가 아니므로 경계가 잡아 같은 모양으로 남긴다.
+    {
+      label: '자기 자신을 던지는 오류를 경계가 잡는다',
+      handled: true,
+      transaction: 'GET /api/envelope-test/boundary-self-throw',
+      valueIncludes: SELF_THROW_CODE,
+      count: REPEAT,
+      type: 'Error',
+      fingerprint: ['{{ default }}', SELF_THROW_CODE],
+      logContext: {},
+    },
+  ],
+  // 오류 이벤트가 하나도 없어야 하는 요청. 경계가 redirect() 신호를 오류로 잡아 기록하면 여기서 드러난다.
+  // 이 라우트의 사건 코드는 BOUNDARY_CODE 다 — 가린 로그 줄이 생기면 아래 stdout 의 건수도 어긋난다.
+  errorFree: [
+    { label: '올려보낸 redirect 신호', transaction: 'GET /api/envelope-test/boundary-redirect' },
+    // 읽을 때마다 달라지는 신호. 던진 값이 그대로 나가면 SDK 가 그것을 처리되지 않은 예외로 보낸다.
+    { label: '읽을 때마다 달라지는 redirect 신호', transaction: 'GET /api/envelope-test/boundary-stateful' },
   ],
   // 웹훅 요청(401)의 transaction 은 기대하지 않는다. SDK 가 401·404·3xx 응답의 transaction 을 버린다.
   // 다른 서비스가 시작한 추적(sentry-trace, baggage)을 이어받은 요청. baggage 의 transaction 이름(쿼리 포함)은
@@ -61,6 +153,18 @@ const EXPECTED = {
     // edge 는 SDK 가 SENTRY_TRACES_SAMPLE_RATE 를 스스로 읽어 표본이 켜진다. 운영에서는 꺼져 있다.
     { label: 'edge 라우트의 transaction', name: 'GET /api/envelope-test/edge-throw', min: REPEAT },
     { label: 'middleware 의 transaction(edge)', name: 'middleware GET /ko/vote', min: REPEAT },
+    // 경계가 500 을 돌려준 요청. SDK 는 500 응답의 transaction 을 버리지 않는다.
+    { label: '경계 함수가 잡은 예외의 transaction', name: 'GET /api/envelope-test/boundary-throw', min: REPEAT },
+    { label: '가린 기록을 남긴 요청의 transaction', name: 'GET /api/envelope-test/boundary-handled', min: REPEAT },
+    { label: '읽기를 방해하는 오류의 transaction', name: 'GET /api/envelope-test/boundary-hostile', min: REPEAT },
+    { label: '자기 자신을 던지는 오류의 transaction', name: 'GET /api/envelope-test/boundary-self-throw', min: REPEAT },
+  ],
+  // 가린 로그 한 줄이 서버 출력에 남았는가(설계 §4.3 의 1). Console target 의 첫 줄은 `[시각] ERROR: <사건 코드> {` 다.
+  stdout: [
+    { label: '가린 로그 줄(경계가 잡은 예외)', includes: `ERROR: ${BOUNDARY_CODE}`, count: REPEAT },
+    { label: '가린 로그 줄(가린 기록)', includes: `ERROR: ${HANDLED_CODE}`, count: REPEAT },
+    { label: '가린 로그 줄(읽기를 방해하는 오류)', includes: `ERROR: ${HOSTILE_CODE}`, count: REPEAT },
+    { label: '가린 로그 줄(자기 자신을 던지는 오류)', includes: `ERROR: ${SELF_THROW_CODE}`, count: REPEAT },
   ],
 };

@@ -83,6 +187,25 @@ function buildRequests(base) {
     'x-envtest-email': B.email,
   };

+  const boundary = {
+    ...common,
+    'x-envtest-boundary-message': A.boundaryMessage,
+    'x-envtest-boundary-query': A.boundaryQuery,
+    'x-envtest-boundary-jwt': A.boundaryJwt,
+    'x-envtest-boundary-bearer': A.boundaryBearer,
+    'x-envtest-boundary-name': A.boundaryName,
+    'x-envtest-boundary-stack': A.boundaryStack,
+    'x-envtest-boundary-cause': A.boundaryCause,
+    'x-envtest-boundary-payment-id': A.boundaryPaymentId,
+    'x-envtest-boundary-error-code': A.boundaryErrorCode,
+    'x-envtest-boundary-getter': A.boundaryGetter,
+    'x-envtest-boundary-self': A.boundarySelf,
+    'x-envtest-boundary-redirect': A.boundaryRedirect,
+    'x-envtest-boundary-stateful': A.boundaryStateful,
+    'x-envtest-user-id': KEPT.userId,
+    'x-envtest-order-id': KEPT.orderId,
+  };
+
   const round = [
     { label: 'page', url: `${base}/ko/vote?code=${A.pageQuery}`, init: { headers: common } },
     {
@@ -115,9 +238,29 @@ function buildRequests(base) {
     },
     { label: 'throw', url: `${base}/api/envelope-test/throw?code=${B.requestQuery}`, init: { headers: unhandled } },
     { label: 'edge-throw', url: `${base}/api/envelope-test/edge-throw?code=${B.requestQuery}`, init: { headers: unhandled } },
+    // 경계로 감싼 라우트는 응답도 본다(expect). 경계가 뚫려 Next 가 응답해도 코드는 같은 500 이다.
+    { label: 'boundary-throw', url: `${base}/api/envelope-test/boundary-throw?code=${A.boundaryQuery}`, init: { headers: boundary }, expect: SAFE_500 },
+    { label: 'boundary-handled', url: `${base}/api/envelope-test/boundary-handled?code=${A.boundaryQuery}`, init: { headers: boundary }, expect: { status: 200, json: { ok: true } } },
+    { label: 'boundary-hostile', url: `${base}/api/envelope-test/boundary-hostile?code=${A.boundaryQuery}`, init: { headers: boundary }, expect: SAFE_500 },
+    { label: 'boundary-self-throw', url: `${base}/api/envelope-test/boundary-self-throw?code=${A.boundaryQuery}`, init: { headers: boundary }, expect: SAFE_500 },
+    // 경계가 올려보낸 redirect() 신호는 Next 가 307 로 바꾼다. 본문은 없다.
+    {
+      label: 'boundary-redirect',
+      url: `${base}/api/envelope-test/boundary-redirect?code=${A.boundaryQuery}`,
+      init: { headers: boundary },
+      expect: { status: 307, location: REDIRECT_TARGET, body: '' },
+    },
+    // digest 가 처음 1번(또는 2번)만 redirect 인 신호. 경계가 새로 만든 신호가 올라가므로 응답은 변함없이 307 이다.
+    // 라우트가 redirect 앞에서 쓴 쿠키도 응답에 실린다.
+    ...[1, 2].map((reads) => ({
+      label: `boundary-stateful-${reads}`,
+      url: `${base}/api/envelope-test/boundary-stateful?reads=${reads}&code=${A.boundaryQuery}`,
+      init: { headers: boundary },
+      expect: { status: 307, location: REDIRECT_TARGET, body: '', cookie: STATEFUL_COOKIE },
+    })),
   ];

   return Array.from({ length: REPEAT }, () => round).flat();
 }

-module.exports = { REPEAT, UNHANDLED_LINE_MARKER, CANARIES, EXPECTED, buildRequests };
+module.exports = { REPEAT, UNHANDLED_LINE_MARKER, CANARIES, KEPT, EXPECTED, buildRequests };
```

- [ ] **Step 2: 라우트를 "수정 전의 모습"으로 먼저 둔다**

경계가 없고, 지금의 호출부처럼 `logError` 에 오류 객체와 값을 그대로 넘긴다. 이 두 파일은 커밋하지 않는다.

`scripts/envelope-test/routes/boundary-throw/route.ts`:

```ts
import { envelopeTestDisabled, hostileError, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// (수정 전의 모습) 경계 함수 없이 던진다. 오류가 SDK 의 래퍼와 Next 의 미처리 오류 로그에 닿는다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw hostileError(request.headers);
}
```

`scripts/envelope-test/routes/boundary-handled/route.ts`:

```ts
import { logError } from '@/utils/log-error';
import { envelopeTestDisabled, hostileError, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// (수정 전의 모습) 지금의 호출부처럼 logError 에 오류 객체와 값을 그대로 넘긴다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const header = (name: string) => request.headers.get(`x-envtest-${name}`) ?? undefined;
  logError('envtest boundary handled', hostileError(request.headers), {
    userId: header('user-id'),
    orderId: header('order-id'),
    paymentId: header('boundary-payment-id'),
    errorCode: header('boundary-error-code'),
    httpStatus: 502,
  });

  return Response.json({ ok: true });
}
```

- [ ] **Step 3: 실패를 본다**

Run: `npm run test:envelope`
Expected: 종료 코드 1, 실패 20건. 시제품에서 본 출력이다.

```
[envelope]   경계 함수가 잡은 예외: 0건 (기대 3)
[envelope]   경계 안에서 남긴 가린 기록: 0건 (기대 3)
[envelope]   가린 로그 줄(경계가 잡은 예외): 0건 (기대 3)
[envelope]   가린 로그 줄(가린 기록): 0건 (기대 3)

[envelope] 실패 20건
  - 수신 건수 — 경계 함수가 잡은 예외: 기대 3건, 실제 0건
  - 수신 건수 — 경계 안에서 남긴 가린 기록: 기대 3건, 실제 0건
  - 서버 출력 — 가린 로그 줄(경계가 잡은 예외): 기대 3줄, 실제 0줄
  - 서버 출력 — 가린 로그 줄(가린 기록): 기대 3줄, 실제 0줄
  - 누출(envelope) — boundaryMessage: event exception.values[].value ×3
  - 누출(표준 출력) — boundaryMessage
  - 누출(표준 출력) — boundaryQuery
  - 누출(envelope) — boundaryName: event exception.values[].type ×6
  - 누출(envelope) — boundaryName: transaction spans[].data.error.type ×3
  - 누출(표준 출력) — boundaryName
  - 누출(표준 출력) — boundaryStack
  - 누출(envelope) — boundaryCause: event exception.values[].value ×3
  - 누출(표준 출력) — boundaryCause
  - 누출(envelope) — boundaryPaymentId: event contexts.log.paymentId ×3
  - 누출(표준 출력) — boundaryPaymentId
  - 누출(envelope) — boundaryErrorCode: event contexts.log.errorCode ×3
  - 누출(표준 출력) — boundaryErrorCode
  - 누출(표준 출력) — boundaryJwt
  - 누출(표준 출력) — boundaryBearer
  - 예상하지 않은 tripwire — redaction.tripwire: event tags.redaction.tripwire(key) ×3
```

읽는 법: 오류의 **이름**이 예외의 type 과 span 의 `error.type` 으로, **cause** 가 이어진 예외로 나간다. 메시지의 URL 쿼리와 stack 의 주소는 PR 1 의 규칙이 Sentry 쪽에서는 지우지만 서버 출력에는 그대로 찍힌다. JWT·Bearer 는 가려졌지만 tripwire 가 붙었다 — 가려진 누출이다.

- [ ] **Step 4: 라우트를 경계 함수와 계약 함수로 바꾼다**

`scripts/envelope-test/routes/boundary-throw/route.ts`:

```ts
import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, hostileError, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싼 라우트. 던진 오류가 Next 의 미처리 오류 로그와 SDK 의 래퍼에 닿지 않아야 한다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw hostileError(request.headers);
});
```

`scripts/envelope-test/routes/boundary-handled/route.ts`:

```ts
import { logSafeError } from '@/utils/log-safe-error';
import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, hostileError, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 핸들러가 스스로 기록을 남기고 정상 응답한다. 계약을 통과한 필드는 남고, 통과하지 못한 값은 어디에도 없어야 한다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const header = (name: string) => request.headers.get(`x-envtest-${name}`) ?? undefined;
  logSafeError('envtest.boundary.handled', hostileError(request.headers), {
    userId: header('user-id'),
    orderId: header('order-id'),
    // 형식에 맞지 않는 값 → 버려지고 이름만 droppedFields 에 남는다.
    paymentId: header('boundary-payment-id'),
    // 표에 없는 값 → 'unknown' 이 된다.
    errorCode: header('boundary-error-code'),
    httpStatus: 502,
  });

  return Response.json({ ok: true });
});
```

교차 리뷰에서 추가한 읽기를 방해하는 오류의 라우트:

`scripts/envelope-test/routes/boundary-hostile/route.ts`:

```ts
import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계가 던진 값을 들여다보는 것을 방해하는 오류. cause 를 읽으면 요청 값이 든 예외를 던진다.
// 그 예외가 경계 밖으로 나가면 Next 의 미처리 오류 로그와 SDK 의 래퍼에 닿는다.
export const GET = withSafeErrors('envtest.boundary.hostile', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const secret = request.headers.get('x-envtest-boundary-getter') ?? 'none';
  const error = new Error('envtest boundary hostile');
  Object.defineProperty(error, 'cause', {
    get() {
      throw new Error(`envtest cause getter ${secret}`);
    },
  });
  throw error;
});
```

- [ ] **Step 5: 라우트 목록 테스트를 고친다**

`scripts/envelope-test/routes/boundary-self-throw/route.ts` (자기 재투척 회귀 검증):

```typescript
import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// cause 를 읽으면 자기 자신을 던지는 오류. unstable_rethrow 는 신호를 받으면 그 값을 그대로 던지므로,
// 경계가 "넘긴 값이 다시 나왔다"는 것만으로 신호라고 보면 이 오류를 Next 로 올려보낸다.
// 그러면 메시지에 든 요청 값이 Next 의 미처리 오류 로그와 SDK 의 래퍼에 닿는다.
export const GET = withSafeErrors('envtest.boundary.self_throw', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const error = new Error(`envtest boundary self throw ${request.headers.get('x-envtest-boundary-self') ?? 'none'}`);
  Object.defineProperty(error, 'cause', {
    get() {
      throw error;
    },
  });
  throw error;
});
```

`scripts/envelope-test/routes/boundary-redirect/route.ts` (Next 단락 평가의 실제 서버 회귀 검증):

```typescript
import { redirect } from 'next/navigation';

import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// redirect() 가 던지는 신호. Next 는 digest 만 보고 이 신호를 응답(307)으로 바꾼다 — message 는 읽지 않는다.
// 경계가 판정에 쓰지 않는 message 까지 읽으면 getter 의 예외를 만나 신호를 오류로 다루고 500 을 돌려준다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const secret = request.headers.get('x-envtest-boundary-redirect') ?? 'none';
  try {
    redirect('/api/envelope-test/redirected');
  } catch (signal) {
    Object.defineProperty(signal as object, 'message', {
      get() {
        throw new Error(`envtest redirect message ${secret}`);
      },
    });
    throw signal;
  }
});
```

`scripts/envelope-test/routes/boundary-stateful/route.ts` (상태 변화 신호·리다이렉트 쿠키의 실제 서버 회귀 검증):

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 읽을 때마다 달라지는 redirect() 신호. digest 는 처음 몇 번(?reads=1|2)만 redirect 의 것이고 그 뒤로는 평범한 문자열이다.
// 경계가 이 값을 그대로 올려보내면, 경계에서는 redirect 였던 것이 SDK 의 래퍼와 Next 가 다시 읽을 때는 평범한 오류가 된다.
// 그러면 메시지·stack·cause 에 든 요청 값이 예외 이벤트와 Next 의 미처리 오류 로그에 찍힌다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const secret = request.headers.get('x-envtest-boundary-stateful') ?? 'none';
  const validReads = new URL(request.url).searchParams.get('reads') === '2' ? 2 : 1;
  // redirect 앞에서 쓴 쿠키는 Next 가 요청 저장소에서 꺼내 응답에 싣는다. 신호 객체에 실려 가지 않는다.
  (await cookies()).set('envtest-boundary', 'kept', { path: '/' });

  try {
    redirect('/api/envelope-test/redirected');
  } catch (signal) {
    const hostile = signal as Error & { digest: string; user?: unknown };
    const real = hostile.digest;
    let reads = 0;
    Object.defineProperty(hostile, 'digest', {
      get() {
        reads += 1;
        return reads <= validReads ? real : `envtest ordinary digest ${secret}`;
      },
    });
    hostile.message = `envtest stateful message ${secret}`;
    hostile.stack = `Error: envtest stateful\n    at https://envtest.invalid/app.js?code=${secret}:1:1`;
    hostile.cause = new Error(`envtest stateful cause ${secret}`);
    hostile.user = { email: `${secret}@envtest.invalid` };
    throw hostile;
  }
});
```

`__tests__/scripts/envelope-test-routes.test.ts` (교차 리뷰 수정까지 반영한 최종 파일):

```ts
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = process.cwd();
const sourceDir = path.join(root, 'scripts/envelope-test/routes');
const targetDir = path.join(root, 'app/api/envelope-test');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [path.relative(root, full)];
  });

describe('envelope 테스트용 라우트', () => {
  // readdir 의 순서는 파일시스템마다 다르다(CI 의 ext4 는 정렬해 주지 않는다).
  const files = walk(sourceDir).sort();
  const routeFiles = files.filter((file) => path.basename(file) === 'route.ts');

  it('원본은 라우트가 아닌 자리에 있고, 저장소의 app/ 에는 테스트용 라우트가 없다', () => {
    expect(routeFiles).toEqual([
      'scripts/envelope-test/routes/boundary-handled/route.ts',
      'scripts/envelope-test/routes/boundary-hostile/route.ts',
      'scripts/envelope-test/routes/boundary-redirect/route.ts',
      'scripts/envelope-test/routes/boundary-self-throw/route.ts',
      'scripts/envelope-test/routes/boundary-stateful/route.ts',
      'scripts/envelope-test/routes/boundary-throw/route.ts',
      'scripts/envelope-test/routes/delivery-control/route.ts',
      'scripts/envelope-test/routes/delivery-plain/route.ts',
      'scripts/envelope-test/routes/delivery-safe/route.ts',
      'scripts/envelope-test/routes/edge-throw/route.ts',
      'scripts/envelope-test/routes/handled/route.ts',
      'scripts/envelope-test/routes/throw/route.ts',
    ]);
    // 실행기가 테스트 빌드 동안만 복사해 둔다. 여기에 남아 있으면 보통 빌드에 들어간다.
    expect(fs.existsSync(targetDir), 'app/api/envelope-test 가 남아 있다. 지운다').toBe(false);
  });

  it('실행기가 원본을 복사하고, 빌드가 끝나면 지운다', () => {
    const { TEST_ROUTE_SOURCE, TEST_ROUTE_TARGET } = require(path.join(root, 'scripts/envelope-test/build-switch.js')) as {
      TEST_ROUTE_SOURCE: string;
      TEST_ROUTE_TARGET: string;
    };
    expect(path.join(root, TEST_ROUTE_SOURCE)).toBe(sourceDir);
    expect(path.join(root, TEST_ROUTE_TARGET)).toBe(targetDir);

    const runner = fs.readFileSync(path.join(root, 'scripts/envelope-test/run.js'), 'utf8');
    expect(runner).toMatch(/installTestRoutes\(\);\s+routesInstalled = true;\s+try \{\s+await build\(\);\s+\} finally \{\s+removeTestRoutes\(\);/);
  });

  it('모든 라우트가 ENVELOPE_TEST 를 런타임에서도 확인한다', () => {
    for (const file of routeFiles) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source, file).toContain('envelopeTestDisabled()');
    }
    const helper = fs.readFileSync(path.join(sourceDir, '_lib/envtest.ts'), 'utf8');
    expect(helper).toContain("process.env.ENVELOPE_TEST === '1'");
  });

  it('비밀처럼 보이는 값을 코드에 두지 않는다 — 실행기가 요청 헤더로 넘긴다', () => {
    for (const file of files) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(/cnry|eyJ/);
    }
  });

  it('경계를 시험하는 라우트만 withSafeErrors 로 내보낸다', () => {
    const wrapped = routeFiles.filter((file) => /export const GET = withSafeErrors\('envtest\.[a-z_.]+',/.test(fs.readFileSync(path.join(root, file), 'utf8')));
    expect(wrapped).toEqual([
      'scripts/envelope-test/routes/boundary-handled/route.ts',
      'scripts/envelope-test/routes/boundary-hostile/route.ts',
      'scripts/envelope-test/routes/boundary-redirect/route.ts',
      'scripts/envelope-test/routes/boundary-self-throw/route.ts',
      'scripts/envelope-test/routes/boundary-stateful/route.ts',
      'scripts/envelope-test/routes/boundary-throw/route.ts',
      'scripts/envelope-test/routes/delivery-safe/route.ts',
    ]);
    // 나머지는 감싸지 않은 채로 둔다. 감싸지 않은 라우트의 동작(미처리 오류, flush 한계)을 고정하는 것이 목적이다.
    for (const file of routeFiles.filter((route) => !wrapped.includes(route))) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toContain('with-safe-errors');
    }
  });
});

describe('envelope 테스트 시나리오', () => {
  const { CANARIES, EXPECTED, KEPT, REPEAT, buildRequests } = require(
    path.join(root, 'scripts/envelope-test/scenario.js'),
  ) as {
    CANARIES: Record<'absent' | 'stdoutOnly' | 'unhandled', Record<string, string>>;
    EXPECTED: {
      errors: Array<{ count: number }>;
      errorFree: Array<{ label: string; transaction: string }>;
      transactions: Array<{ min: number; name: string }>;
      traceHeaders: Array<{ min: number }>;
      stdout: Array<{ count: number; includes: string }>;
    };
    KEPT: { userId: string; orderId: string };
    REPEAT: number;
    buildRequests: (base: string) => Array<{
      label: string;
      url: string;
      init: { headers: Record<string, string>; body?: string };
      expect?: { status: number; json?: unknown; location?: string; body?: string; cookie?: { name: string; value: string } };
    }>;
  };

  it('canary 값이 서로 겹치지 않는다', () => {
    const values = Object.values(CANARIES).flatMap((group) => Object.values(group));
    for (const value of values) {
      expect(values.filter((other) => other.includes(value)), value).toHaveLength(1);
    }
  });

  it('모든 canary 가 요청 어딘가에 실린다', () => {
    const sent = JSON.stringify(buildRequests('http://127.0.0.1:3000'));
    for (const value of Object.values(CANARIES).flatMap((group) => Object.values(group))) {
      expect(sent, value).toContain(value);
    }
  });

  it('종류마다 REPEAT 번 보내고, 기대 건수가 그와 같다', () => {
    const requests = buildRequests('http://127.0.0.1:3000');
    const labels = [...new Set(requests.map((request) => request.label))];
    expect(labels).toEqual(['page', 'webhook', 'handled', 'throw', 'edge-throw', 'boundary-throw', 'boundary-handled', 'boundary-hostile', 'boundary-self-throw', 'boundary-redirect', 'boundary-stateful-1', 'boundary-stateful-2']);
    for (const label of labels) {
      expect(requests.filter((request) => request.label === label)).toHaveLength(REPEAT);
    }
    for (const rule of EXPECTED.errors) expect(rule.count).toBe(REPEAT);
    for (const rule of EXPECTED.transactions) expect(rule.min).toBe(REPEAT);
    for (const rule of EXPECTED.traceHeaders) expect(rule.min).toBe(REPEAT);
    for (const rule of EXPECTED.stdout) expect(rule.count).toBe(REPEAT);
  });

  it('남아야 하는 값은 계약의 형식을 통과하고 canary 와 겹치지 않는다', () => {
    expect(KEPT.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(KEPT.orderId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    const sent = JSON.stringify(buildRequests('http://127.0.0.1:3000'));
    for (const value of Object.values(KEPT)) {
      expect(sent, value).toContain(value);
      expect(value).not.toMatch(/cnry/i);
    }
  });

  it('가린 로그 줄의 기대가 테스트 라우트가 쓰는 사건 코드를 가리킨다', () => {
    const sources = walk(sourceDir)
      .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
      .join('\n');
    for (const rule of EXPECTED.stdout) {
      const code = rule.includes.replace('ERROR: ', '');
      expect(sources, code).toContain(`'${code}'`);
    }
  });

  it('경계로 감싼 라우트의 요청은 응답 기대를 싣고, 실행기가 응답을 판정에 넘긴다', () => {
    const expectations = Object.fromEntries(
      buildRequests('http://127.0.0.1:3000')
        .filter((request) => request.label.startsWith('boundary-'))
        .map((request) => [request.label, request.expect]),
    );
    const safe500 = { status: 500, json: { error: 'Internal server error' } };
    const statefulRedirect = {
      status: 307,
      location: '/api/envelope-test/redirected',
      body: '',
      cookie: { name: 'envtest-boundary', value: 'kept' },
    };
    expect(expectations).toEqual({
      'boundary-throw': safe500,
      'boundary-handled': { status: 200, json: { ok: true } },
      'boundary-hostile': safe500,
      'boundary-self-throw': safe500,
      'boundary-redirect': { status: 307, location: '/api/envelope-test/redirected', body: '' },
      'boundary-stateful-1': statefulRedirect,
      'boundary-stateful-2': statefulRedirect,
    });

    const runner = fs.readFileSync(path.join(root, 'scripts/envelope-test/run.js'), 'utf8');
    // redirect 를 따라가면 307 과 Location 을 볼 수 없다.
    expect(runner).toContain("fetch(request.url, { redirect: 'manual', ...request.init })");
    expect(runner).toMatch(
      /responses\.push\(\{\s*label: request\.label,\s*url: request\.url,\s*status: response\.status,\s*location: response\.headers\.get\('location'\),\s*setCookies: response\.headers\.getSetCookie\(\),\s*body,\s*expect: request\.expect,\s*\}\);/,
    );
    expect(runner).toMatch(/evaluate\(\{[^}]*\bresponses,\s*\}\)/);
  });

  it('redirect 를 올려보내는 라우트는 실제 redirect() 를 쓰고, 그 요청에는 오류 이벤트도 transaction 도 기대하지 않는다', () => {
    const route = fs.readFileSync(path.join(sourceDir, 'boundary-redirect/route.ts'), 'utf8');
    expect(route).toContain("import { redirect } from 'next/navigation';");
    expect(route).toContain("redirect('/api/envelope-test/redirected');");
    // 판정에 쓰지 않는 message 를 읽으면 던진다.
    expect(route).toMatch(/Object\.defineProperty\(signal as object, 'message', \{\s*get\(\) \{\s*throw new Error\(/);

    const transaction = 'GET /api/envelope-test/boundary-redirect';
    expect(EXPECTED.errorFree).toContainEqual({ label: '올려보낸 redirect 신호', transaction });
    // SDK 는 3xx 응답의 transaction 을 버린다.
    expect(EXPECTED.transactions.map((rule) => rule.name)).not.toContain(transaction);
  });

  it('읽을 때마다 달라지는 신호의 라우트는 실제 redirect() 와 cookies() 를 쓰고, 두 요청 모두 오류 이벤트를 기대하지 않는다', () => {
    const route = fs.readFileSync(path.join(sourceDir, 'boundary-stateful/route.ts'), 'utf8');
    expect(route).toContain("import { cookies } from 'next/headers';");
    expect(route).toContain("import { redirect } from 'next/navigation';");
    // 쿠키는 redirect 앞에서 쓴다. 신호 객체에 싣지 않는다.
    expect(route).toMatch(/\(await cookies\(\)\)\.set\('envtest-boundary', 'kept', \{ path: '\/' \}\);\s+try \{\s+redirect\('\/api\/envelope-test\/redirected'\);/);
    expect(route).not.toContain('mutableCookies');
    // digest 는 처음 몇 번만 redirect 의 것이다.
    expect(route).toMatch(/Object\.defineProperty\(hostile, 'digest', \{\s*get\(\) \{\s*reads \+= 1;\s*return reads <= validReads \? real : /);

    const urls = buildRequests('http://127.0.0.1:3000')
      .filter((request) => request.label.startsWith('boundary-stateful-'))
      .map((request) => new URL(request.url));
    expect([...new Set(urls.map((url) => `${url.pathname} reads=${url.searchParams.get('reads')}`))]).toEqual([
      '/api/envelope-test/boundary-stateful reads=1',
      '/api/envelope-test/boundary-stateful reads=2',
    ]);

    const transaction = 'GET /api/envelope-test/boundary-stateful';
    expect(EXPECTED.errorFree).toContainEqual({ label: '읽을 때마다 달라지는 redirect 신호', transaction });
    expect(EXPECTED.errorFree).toHaveLength(2);
    expect(EXPECTED.transactions.map((rule) => rule.name)).not.toContain(transaction);
  });

  it('전달 시나리오의 요청이 실제 테스트 라우트를 가리킨다', () => {
    const { STEPS } = require(path.join(root, 'scripts/envelope-test/delivery.js')) as { STEPS: Array<{ path: string }> };
    for (const step of STEPS) {
      const route = step.path.split('?')[0].replace('/api/envelope-test/', '');
      expect(fs.existsSync(path.join(sourceDir, route, 'route.ts')), step.path).toBe(true);
    }
  });

  it('실행기가 두 시나리오를 모두 돌린다', () => {
    const runner = fs.readFileSync(path.join(root, 'scripts/envelope-test/run.js'), 'utf8');
    expect(runner).toContain("if (only !== 'delivery') codes.push(await runLeak(track));");
    expect(runner).toContain("if (only !== 'leak') codes.push(await runDeliveryScenario(track));");
  });

  it('package.json 에 실행 스크립트가 있다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:envelope']).toBe('node scripts/envelope-test/run.js');
  });
});
```

Run: `npx vitest run __tests__/scripts/envelope-test-routes.test.ts && npx tsc --noEmit`
Expected: PASS (11건), 타입 오류 없음.

- [ ] **Step 6: 통과를 본다**

Run: `npm run test:envelope`
Expected: 종료 코드 0. 건수 줄에 아래가 있고 실패가 없다.

```
[envelope] 누출 시나리오 — 요청 24건: page 200, webhook 401, handled 200, throw 500, edge-throw 500, boundary-throw 500, boundary-handled 200, boundary-hostile 500
[envelope] 받은 envelope 89건(항목 89건)
[envelope]   웹훅 서명 실패(logError): 3건 (기대 3)
[envelope]   테스트 라우트의 logError: 3건 (기대 3)
[envelope]   처리되지 않은 예외(node): 3건 (기대 3)
[envelope]   처리되지 않은 예외(edge): 3건 (기대 3)
[envelope]   경계 함수가 잡은 예외: 3건 (기대 3)
[envelope]   경계 안에서 남긴 가린 기록: 3건 (기대 3)
[envelope]   읽기를 방해하는 오류를 경계가 잡는다: 3건 (기대 3)
[envelope]   페이지 transaction: 3건 (기대 3 이상)
[envelope]   밖으로 부르는 요청의 transaction: 3건 (기대 3 이상)
[envelope]   처리되지 않은 예외의 transaction(node): 3건 (기대 3 이상)
[envelope]   edge 라우트의 transaction: 6건 (기대 3 이상)
[envelope]   middleware 의 transaction(edge): 3건 (기대 3 이상)
[envelope]   경계 함수가 잡은 예외의 transaction: 3건 (기대 3 이상)
[envelope]   가린 기록을 남긴 요청의 transaction: 3건 (기대 3 이상)
[envelope]   읽기를 방해하는 오류의 transaction: 3건 (기대 3 이상)
[envelope]   이어받은 추적의 envelope 헤더: 6건 (기대 3 이상)
[envelope]   가린 로그 줄(경계가 잡은 예외): 3건 (기대 3)
[envelope]   가린 로그 줄(가린 기록): 3건 (기대 3)
[envelope]   가린 로그 줄(읽기를 방해하는 오류): 3건 (기대 3)
[envelope] 누출 시나리오 통과: 건수가 맞고 canary 가 허용된 곳에만 있다.
```

- [ ] **Step 7: 커밋한다**

```bash
git status --short --untracked-files=all   # app/api/envelope-test 가 남아 있지 않은지, next-env.d.ts·tsconfig.json 이 바뀌지 않았는지 본다
git add scripts/envelope-test/routes/_lib/envtest.ts scripts/envelope-test/scenario.js scripts/envelope-test/routes/boundary-throw/route.ts scripts/envelope-test/routes/boundary-handled/route.ts __tests__/scripts/envelope-test-routes.test.ts
git commit -m "test(envelope): 경계 함수로 감싼 요청을 누출 시나리오에 더한다"
```

---

### Task 8: 전달 시나리오 — 실제 서버

**Files:**
- Create: `scripts/envelope-test/harness.js`
- Create: `scripts/envelope-test/delivery.js`
- Create: `scripts/envelope-test/routes/_lib/delivery-probe.ts`
- Create: `scripts/envelope-test/routes/delivery-plain/route.ts`, `delivery-safe/route.ts`, `delivery-control/route.ts`
- Modify: `scripts/envelope-test/run.js`
- Test: `__tests__/scripts/envelope-test-delivery.test.ts`, `__tests__/scripts/envelope-test-routes.test.ts`

**Interfaces:**
- Produces (`harness.js`): `sleep`, `listen`, `freePort`, `decode`, `startNext(nextBin, root, env, output)`, `waitFor(check, timeoutMs, what?)`, `waitUntilReady(next, output)`
- Produces (`delivery.js`): `STEPS`, `NORMAL_DELAY_MS = 300`, `SLOW_DELAY_MS = 2600`, `RESPONSE_BUDGET_MS = 1000`, `FLUSH_TIMEOUT_LINE`, `evaluateDelivery(observations): { failures: string[] }`, `runDelivery({ root, nextBin, onServer }): Promise<{ observations, stdout }>`
- 측정 방법: 테스트 라우트가 요청 헤더 `x-envtest-probe: install` 을 받으면 `globalThis[Symbol.for('@vercel/request-context')]` 에 기록만 하는 `waitUntil` 을 단다. SDK 의 래퍼가 건 flush 의 등록 시각과 끝난 시각이 남는다. 수집기는 **오류 이벤트에** 답하는 시간을 300ms(정상)·2600ms(제한 초과)로 바꾸고, 그 밖의 envelope(`client_report` 등)에는 바로 답한다.

- [ ] **Step 1: 판정의 실패하는 테스트를 쓴다**

`__tests__/scripts/envelope-test-delivery.test.ts`:

```ts
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

type Step = {
  phase: 'normal' | 'no-context' | 'slow';
  label: string;
  path: string;
  probe?: 'install' | 'remove';
  status: number;
  events: number;
  safeLines: number;
  line: string | null;
  timeoutLines: number;
};
type Observation = {
  step: Step;
  status: number;
  sentAt: number;
  receivedAt: number;
  events: Array<{ arrivedAt: number; respondedAt: number | null }>;
  waits: Array<{ registeredAt: number; settledAt: number | null }>;
  safeLines: number;
  matchingLines: number;
  timeoutLines: number;
};

const require = createRequire(import.meta.url);
const { STEPS, NORMAL_DELAY_MS, SLOW_DELAY_MS, RESPONSE_BUDGET_MS, FLUSH_TIMEOUT_LINE, evaluateDelivery } = require(
  path.join(process.cwd(), 'scripts/envelope-test/delivery.js'),
) as {
  STEPS: Step[];
  NORMAL_DELAY_MS: number;
  SLOW_DELAY_MS: number;
  RESPONSE_BUDGET_MS: number;
  FLUSH_TIMEOUT_LINE: string;
  evaluateDelivery: (observations: Observation[]) => { failures: string[] };
};

/** 기대대로 돈 실행의 관측. 시각은 요청을 보낸 때를 0 으로 둔 ms 다. */
function clean(step: Step): Observation {
  const delay = step.phase === 'slow' ? SLOW_DELAY_MS : NORMAL_DELAY_MS;
  const events = Array.from({ length: step.events }, () => ({ arrivedAt: 12, respondedAt: 12 + delay }));
  // 보통 단계의 flush 는 전송이 끝난 뒤에, 느린 단계의 flush 는 제한(2000ms)에서 끝난다.
  const settledAt = step.phase === 'slow' ? 2010 : 12 + delay + 3;
  return {
    step,
    status: step.status,
    sentAt: 0,
    receivedAt: 8,
    events,
    waits: step.phase === 'no-context' ? [] : [{ registeredAt: 6, settledAt }],
    safeLines: step.safeLines,
    matchingLines: step.line === null ? 0 : step.safeLines,
    timeoutLines: step.timeoutLines,
  };
}

const run = (change?: (observations: Observation[]) => void) => {
  const observations = STEPS.map(clean);
  change?.(observations);
  return evaluateDelivery(observations).failures;
};

const of = (observations: Observation[], phase: Step['phase'], match: (step: Step) => boolean = () => true) => {
  const found = observations.find((observation) => observation.step.phase === phase && match(observation.step));
  if (!found) throw new Error(`단계가 없다: ${phase}`);
  return found;
};

describe('전달 시나리오의 단계', () => {
  it('세 사례를 모두 담는다: 정상, 요청 컨텍스트 없음, 제한 초과', () => {
    expect([...new Set(STEPS.map((step) => step.phase))]).toEqual(['normal', 'no-context', 'slow']);
    expect(new Set(STEPS.map((step) => step.label)).size).toBe(STEPS.length);
  });

  it('첫 요청이 가짜 요청 컨텍스트를 달고 기록을 남긴다 — 서버의 첫 요청이 곧 측정 대상이다', () => {
    expect(STEPS[0]).toMatchObject({ phase: 'normal', probe: 'install', events: 1 });
  });

  it('수집기의 지연이 flush 제한(2초)의 양쪽에 있고, 응답 예산은 제한보다 짧다', () => {
    expect(NORMAL_DELAY_MS).toBeLessThan(2000);
    expect(SLOW_DELAY_MS).toBeGreaterThan(2000);
    expect(RESPONSE_BUDGET_MS).toBeLessThan(2000);
    expect(FLUSH_TIMEOUT_LINE).toBe('[sentry] flush timeout');
  });

  it('제한 초과 줄은 느린 단계에서 경계가 오류를 기록한 요청에만 기대한다', () => {
    for (const step of STEPS) {
      const boundaryRecorded = step.path.includes('/delivery-safe') && step.events > 0;
      expect(step.timeoutLines, step.label).toBe(step.phase === 'slow' && boundaryRecorded ? 1 : 0);
    }
    // 여러 번 남겨도 한 줄이고, 감싸지 않은 라우트는 느려도 남기지 않는다.
    expect(STEPS.some((step) => step.phase === 'slow' && step.events === 3 && step.timeoutLines === 1)).toBe(true);
    expect(STEPS.some((step) => step.phase === 'slow' && step.path.includes('/delivery-plain') && step.timeoutLines === 0)).toBe(true);
  });
});

describe('evaluateDelivery', () => {
  it('기대대로 돈 실행은 실패가 없다', () => {
    expect(run()).toEqual([]);
  });

  it('관측이 빠진 단계를 실패로 본다 — 아무것도 재지 않은 실행이 통과하지 않는다', () => {
    expect(evaluateDelivery([]).failures).toHaveLength(STEPS.length);
    expect(run((observations) => observations.pop())).toEqual([`${STEPS[STEPS.length - 1].label}: 관측이 없다`]);
  });

  it('응답 코드, 이벤트 수, 로그 줄 수가 다르면 실패한다', () => {
    const failures = run((observations) => {
      const target = of(observations, 'normal', (step) => step.events === 3);
      target.status = 500;
      target.events.pop();
      target.safeLines = 2;
      target.matchingLines = 2;
    });
    expect(failures).toEqual([
      '경계 안의 기록 세 번: 응답 코드 기대 200, 실제 500',
      '경계 안의 기록 세 번: 오류 이벤트 기대 3건, 실제 2건',
      '경계 안의 기록 세 번: 로그 줄 기대 3줄, 실제 2줄',
      "경계 안의 기록 세 번: 'ERROR: envtest.delivery.handled' 줄 기대 3줄, 실제 2줄",
    ]);
  });

  it('flush 가 전송 완료보다 먼저 끝나면 실패한다 — #74 가 걱정한 틈이다', () => {
    const failures = run((observations) => {
      const target = of(observations, 'normal');
      target.waits[0].settledAt = 9;
    });
    expect(failures).toEqual([`${STEPS[0].label}: flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다`]);
  });

  it('응답이 전송 완료를 기다렸으면 실패한다', () => {
    const failures = run((observations) => {
      const target = of(observations, 'normal');
      target.receivedAt = target.events[0].respondedAt as number;
      target.waits[0].settledAt = target.receivedAt + 5;
    });
    expect(failures).toEqual([`${STEPS[0].label}: 응답이 전송 완료보다 늦었다 — 응답이 전송을 기다렸다`]);
  });

  it('flush 가 같은 ms 에 끝난 것은 실패가 아니다', () => {
    expect(
      run((observations) => {
        const target = of(observations, 'normal');
        target.waits[0].settledAt = target.events[0].respondedAt;
      }),
    ).toEqual([]);
  });

  it('SDK 래퍼의 flush 가 요청당 한 번이 아니면 실패한다', () => {
    const none = run((observations) => {
      of(observations, 'normal').waits = [];
    });
    const twice = run((observations) => {
      const target = of(observations, 'normal');
      target.waits.push({ ...target.waits[0] });
    });
    expect(none).toEqual([`${STEPS[0].label}: waitUntil 등록 기대 1건, 실제 0건`]);
    expect(twice).toEqual([`${STEPS[0].label}: waitUntil 등록 기대 1건, 실제 2건`]);
  });

  it('끝나지 않은 flush 와 답하지 못한 이벤트를 실패로 본다', () => {
    const unsettled = run((observations) => {
      of(observations, 'normal').waits[0].settledAt = null;
    });
    const unanswered = run((observations) => {
      of(observations, 'normal').events[0].respondedAt = null;
    });
    expect(unsettled).toEqual([`${STEPS[0].label}: waitUntil 에 건 flush 가 끝나지 않았다`]);
    expect(unanswered).toEqual([`${STEPS[0].label}: 수집기가 답하지 못한 이벤트가 있다`]);
  });

  it('요청 컨텍스트가 없는데 waitUntil 에 걸린 것이 있으면 실패한다', () => {
    const failures = run((observations) => {
      of(observations, 'no-context').waits = [{ registeredAt: 6, settledAt: 300 }];
    });
    expect(failures).toEqual(['요청 컨텍스트 없음: 요청 컨텍스트가 없는데 waitUntil 에 1건이 걸렸다']);
  });

  it('제한 초과 줄의 수가 기대와 다르면 실패한다', () => {
    const missing = run((observations) => {
      of(observations, 'slow', (step) => step.timeoutLines === 1).timeoutLines = 0;
    });
    const duplicated = run((observations) => {
      of(observations, 'slow', (step) => step.events === 3).timeoutLines = 3;
    });
    const unexpected = run((observations) => {
      of(observations, 'slow', (step) => step.path.includes('/delivery-plain')).timeoutLines = 1;
    });
    expect(missing).toEqual(["제한 초과: 경계가 잡은 예외: '[sentry] flush timeout' 기대 1줄, 실제 0줄"]);
    expect(duplicated).toEqual(["제한 초과: 경계 안의 기록 세 번: '[sentry] flush timeout' 기대 1줄, 실제 3줄"]);
    expect(unexpected).toEqual(["제한 초과: 경계 없는 라우트: '[sentry] flush timeout' 기대 0줄, 실제 1줄"]);
  });

  it('느린 단계에서 응답이 늦거나 flush 가 전송 완료까지 기다렸으면 실패한다', () => {
    const slowResponse = run((observations) => {
      of(observations, 'slow').receivedAt = 2100;
    });
    const waited = run((observations) => {
      const target = of(observations, 'slow');
      target.waits[0].settledAt = (target.events[0].respondedAt as number) + 1;
    });
    expect(slowResponse).toEqual(['제한 초과: 경계가 잡은 예외: 응답이 2100ms 걸렸다 — flush 가 응답을 늦췄다']);
    expect(waited).toEqual(['제한 초과: 경계가 잡은 예외: 제한을 넘겼는데 flush 가 전송 완료까지 기다렸다']);
  });
});
```

Run: `npx vitest run __tests__/scripts/envelope-test-delivery.test.ts`
Expected: FAIL. `Cannot find module '…/scripts/envelope-test/delivery.js'`.

- [ ] **Step 2: 같이 쓰는 것을 `harness.js` 로 옮긴다**

`scripts/envelope-test/harness.js`:

```js
'use strict';

/**
 * envelope 테스트의 두 시나리오(누출 run.js, 전달 delivery.js)가 같이 쓰는 것: 포트, 압축 풀기, next start, 기다리기.
 */

const { spawn } = require('child_process');
const http = require('http');
const zlib = require('zlib');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

async function freePort() {
  const probe = http.createServer();
  const port = await listen(probe, '127.0.0.1');
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Sentry SDK 가 보낸 envelope 본문의 압축을 푼다. */
function decode(body, encoding) {
  if (encoding === 'gzip') return zlib.gunzipSync(body);
  if (encoding === 'br') return zlib.brotliDecompressSync(body);
  if (encoding === 'deflate') return zlib.inflateSync(body);
  return body;
}

/** next start 를 띄우고 표준 출력·오류를 output 배열에 쌓는다. */
function startNext(nextBin, root, env, output) {
  const child = spawn(nextBin, ['start', '-p', env.PORT], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  return child;
}

/** check 가 참이 될 때까지 기다린다. what 을 주면 시간 초과에서 던지고, 주지 않으면 false 를 돌려준다. */
async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(100);
  }
  if (what) throw new Error(`시간 초과: ${what}`);
  return false;
}

/** next start 가 요청을 받을 준비가 될 때까지 기다린다. 요청을 보내지 않는다 — 첫 요청은 시나리오의 것이어야 한다. */
function waitUntilReady(next, output) {
  return waitFor(
    () => {
      if (next.exitCode !== null) throw new Error(`next start 가 종료됐다(코드 ${next.exitCode})\n${output.join('')}`);
      return output.join('').includes('Ready in');
    },
    60_000,
    'next start 준비',
  );
}

module.exports = { sleep, listen, freePort, decode, startNext, waitFor, waitUntilReady };
```

- [ ] **Step 3: 전달 시나리오를 쓴다**

`scripts/envelope-test/delivery.js`:

```js
'use strict';

/**
 * 전달 시나리오 (설계 §4.3, §5.2). 실제 Next 서버(next start)에서 잰다.
 *
 * 로컬 수집기가 오류 이벤트에 답하는 시간을 조절해 세 가지를 본다.
 *   normal     — 수집기가 300ms 뒤에 답한다. 핸들러가 기록을 남기고 바로 응답해도, SDK 의 route handler 래퍼가
 *                waitUntil 에 건 flush 는 전송이 끝난 뒤에 끝난다. 응답은 전송을 기다리지 않는다.
 *   no-context — Vercel 요청 컨텍스트가 없다. waitUntil 에 아무것도 걸리지 않는다. 가린 로그 한 줄은 남는다.
 *   slow       — 수집기가 flush 제한(2초)보다 늦게 답한다. 경계 함수로 감싼 라우트는 오류를 기록한 요청마다
 *                `[sentry] flush timeout` 을 정확히 한 줄 남긴다. 감싸지 않은 라우트와 기록이 없는 요청은 남기지 않는다.
 *
 * 늦추는 것은 오류 이벤트뿐이다. SDK 는 flush 할 때 표본에서 빠진 transaction 의 집계(client_report)도 보낸다.
 * 그것까지 늦추면 flush 가 그 응답을 기다린다 — 이벤트가 flush 보다 늦게 큐에 들어가도 둘의 끝이 몇 ms 차이로만
 * 갈려서 틈을 놓칠 수 있다(captureException 앞에 5ms 지연을 넣은 실행에서 다섯 가운데 하나가 0ms 로 겹쳤다).
 *
 * 판정(evaluateDelivery)은 순수 함수다 — 단위 테스트(__tests__/scripts/envelope-test-delivery.test.ts)가 CI 에서 돈다.
 * 실행(runDelivery)은 run.js 가 부른다.
 */

const http = require('http');
const { parseEnvelope } = require('./analyze');
const { sleep, listen, freePort, decode, startNext, waitFor, waitUntilReady } = require('./harness');

const NORMAL_DELAY_MS = 300;
/** SDK 의 flush 제한(2000ms)보다 길다. */
const SLOW_DELAY_MS = 2600;
/** 느린 단계에서 응답이 이보다 오래 걸리면 flush 가 응답을 늦춘 것이다. */
const RESPONSE_BUDGET_MS = 1000;
const FLUSH_TIMEOUT_LINE = '[sentry] flush timeout';
/** 이 시나리오의 라우트가 남기는 로그 줄은 모두 이 문자열로 시작하는 사건 코드나 메시지를 쓴다. */
const SAFE_LINE_PREFIX = 'ERROR: envtest';

const PLAIN = '/api/envelope-test/delivery-plain';
const SAFE = '/api/envelope-test/delivery-safe';
const CONTROL = '/api/envelope-test/delivery-control';

const HANDLED_LINE = 'ERROR: envtest.delivery.handled';
const UNHANDLED_LINE = 'ERROR: envtest.delivery.unhandled';

/**
 * 보낼 요청과 기대. 순서가 뜻을 갖는다 — 첫 요청은 서버가 뜬 뒤의 첫 요청이다(모듈이 처음 로드된다).
 *   probe      — 'install' 이면 핸들러가 Vercel 요청 컨텍스트의 가짜를 달고, 'remove' 면 뗀다.
 *   events     — 이 요청이 수집기로 보낼 오류 이벤트의 수.
 *   safeLines  — 서버 출력에 새로 생길 로그 줄의 수. line 은 그 줄에 들어 있어야 하는 문자열이다.
 *   timeoutLines — 새로 생길 `[sentry] flush timeout` 줄의 수.
 */
const STEPS = [
  { phase: 'normal', label: '서버의 첫 요청: logError 뒤 바로 응답', path: `${PLAIN}?via=logError`, probe: 'install', status: 200, events: 1, safeLines: 1, line: 'ERROR: envtest delivery legacy', timeoutLines: 0 },
  { phase: 'normal', label: 'logSafeError 뒤 바로 응답(경계 없음)', path: PLAIN, status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계가 잡은 예외', path: `${SAFE}?mode=throw`, status: 500, events: 1, safeLines: 1, line: UNHANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계 안의 기록 한 번', path: `${SAFE}?mode=handled`, status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계 안의 기록 세 번', path: `${SAFE}?mode=multi`, status: 200, events: 3, safeLines: 3, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'normal', label: '경계 안, 기록 없음', path: `${SAFE}?mode=ok`, status: 200, events: 0, safeLines: 0, line: null, timeoutLines: 0 },
  { phase: 'no-context', label: '요청 컨텍스트 없음', path: PLAIN, probe: 'remove', status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
  { phase: 'slow', label: '제한 초과: 경계가 잡은 예외', path: `${SAFE}?mode=throw`, probe: 'install', status: 500, events: 1, safeLines: 1, line: UNHANDLED_LINE, timeoutLines: 1 },
  { phase: 'slow', label: '제한 초과: 경계 안의 기록 세 번', path: `${SAFE}?mode=multi`, status: 200, events: 3, safeLines: 3, line: HANDLED_LINE, timeoutLines: 1 },
  { phase: 'slow', label: '제한 초과: 경계 안, 기록 없음', path: `${SAFE}?mode=ok`, status: 200, events: 0, safeLines: 0, line: null, timeoutLines: 0 },
  { phase: 'slow', label: '제한 초과: 경계 없는 라우트', path: PLAIN, status: 200, events: 1, safeLines: 1, line: HANDLED_LINE, timeoutLines: 0 },
];

/**
 * 관측한 것을 기대와 맞춰 본다. 관측 하나의 모양:
 *   { step, status, sentAt, receivedAt, events: [{ arrivedAt, respondedAt }], waits: [{ registeredAt, settledAt }],
 *     safeLines, matchingLines, timeoutLines }
 * 시각은 모두 같은 기계의 Date.now() 다(실행기와 서버가 한 기계에서 돈다).
 */
function evaluateDelivery(observations) {
  const failures = [];
  const seen = new Set(observations.map((observation) => observation.step.label));
  for (const step of STEPS) {
    if (!seen.has(step.label)) failures.push(`${step.label}: 관측이 없다`);
  }

  for (const observation of observations) {
    const { step } = observation;
    const fail = (message) => failures.push(`${step.label}: ${message}`);

    if (observation.status !== step.status) fail(`응답 코드 기대 ${step.status}, 실제 ${observation.status}`);
    if (observation.events.length !== step.events) fail(`오류 이벤트 기대 ${step.events}건, 실제 ${observation.events.length}건`);
    if (observation.safeLines !== step.safeLines) fail(`로그 줄 기대 ${step.safeLines}줄, 실제 ${observation.safeLines}줄`);
    if (step.line !== null && observation.matchingLines !== step.safeLines) {
      fail(`'${step.line}' 줄 기대 ${step.safeLines}줄, 실제 ${observation.matchingLines}줄`);
    }
    if (observation.timeoutLines !== step.timeoutLines) {
      fail(`'${FLUSH_TIMEOUT_LINE}' 기대 ${step.timeoutLines}줄, 실제 ${observation.timeoutLines}줄`);
    }

    if (step.phase === 'no-context') {
      if (observation.waits.length !== 0) fail(`요청 컨텍스트가 없는데 waitUntil 에 ${observation.waits.length}건이 걸렸다`);
      continue;
    }

    // SDK 의 route handler 래퍼는 요청마다 한 번 flush 를 건다. 경계 함수의 flush 는 after 로 가므로 여기에 잡히지 않는다.
    if (observation.waits.length !== 1) {
      fail(`waitUntil 등록 기대 1건, 실제 ${observation.waits.length}건`);
      continue;
    }
    const [wait] = observation.waits;
    if (wait.settledAt === null) {
      fail('waitUntil 에 건 flush 가 끝나지 않았다');
      continue;
    }
    const responded = observation.events.map((event) => event.respondedAt);
    if (responded.some((at) => at === null)) {
      fail('수집기가 답하지 못한 이벤트가 있다');
      continue;
    }

    if (step.phase === 'normal') {
      if (responded.some((at) => observation.receivedAt >= at)) fail('응답이 전송 완료보다 늦었다 — 응답이 전송을 기다렸다');
      if (responded.some((at) => wait.settledAt < at)) {
        fail('flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다');
      }
    }
    if (step.phase === 'slow') {
      const took = observation.receivedAt - observation.sentAt;
      if (took >= RESPONSE_BUDGET_MS) fail(`응답이 ${took}ms 걸렸다 — flush 가 응답을 늦췄다`);
      if (responded.some((at) => wait.settledAt >= at)) fail('제한을 넘겼는데 flush 가 전송 완료까지 기다렸다');
    }
  }

  return { failures };
}

/**
 * 답하는 시간을 조절할 수 있는 로컬 수집기. 오류 이벤트가 든 envelope 에는 state.delayMs 뒤에 답하고,
 * 그 밖의 것(client_report 등)에는 바로 답한다. state.delayMs 를 바꾸면 그 뒤에 도착한 envelope 부터 적용된다.
 */
function createDelaySink(state) {
  return http.createServer((req, res) => {
    const arrival = { arrivedAt: Date.now(), respondedAt: null, kinds: null };
    state.arrivals.push(arrival);
    const delayMs = state.delayMs;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const envelope = parseEnvelope(decode(Buffer.concat(chunks), req.headers['content-encoding']));
        arrival.kinds = envelope.items.map((item) => item.type);
      } catch {
        arrival.kinds = ['undecodable'];
      }
      const respond = () => {
        arrival.respondedAt = Date.now();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      };
      if (arrival.kinds.includes('event')) setTimeout(respond, delayMs);
      else respond();
    });
  });
}

const countLines = (output, needle) => output.join('').split('\n').filter((line) => line.includes(needle)).length;

/**
 * 시나리오를 돌려 관측을 모은다. 서버를 따로 띄운다 — 첫 요청이 측정 대상이어야 하고, 표본을 꺼 오류 이벤트만 받는다.
 * 돌려주는 값: { observations, stdout }
 */
async function runDelivery({ root, nextBin, onServer }) {
  const state = { delayMs: NORMAL_DELAY_MS, arrivals: [] };
  const output = [];
  const sink = createDelaySink(state);
  let next;

  try {
    const sinkPort = await listen(sink, '127.0.0.1');
    const port = String(await freePort());
    next = startNext(
      nextBin,
      root,
      {
        ...process.env,
        NODE_ENV: 'production',
        ENVELOPE_TEST: '1',
        PORT: port,
        SENTRY_DSN: `http://envtestkey@127.0.0.1:${sinkPort}/1`,
        NEXT_PUBLIC_SENTRY_DSN: '',
        // transaction 을 받지 않는다. 수집기에 오는 것을 오류 이벤트로 좁혀 요청과 맞추기 쉽게 한다.
        SENTRY_TRACES_SAMPLE_RATE: '0',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      output,
    );
    if (onServer) onServer(next);
    await waitUntilReady(next, output);

    const base = `http://127.0.0.1:${port}`;
    const quiet = () => state.arrivals.every((arrival) => arrival.respondedAt !== null);
    const observations = [];

    for (const step of STEPS) {
      state.delayMs = step.phase === 'slow' ? SLOW_DELAY_MS : NORMAL_DELAY_MS;
      // 앞 단계의 확인 요청이 건 waitUntil 과 이 요청의 것이 같은 ms 에 찍히지 않게 띄운다.
      await sleep(20);

      const before = {
        arrivals: state.arrivals.length,
        safe: countLines(output, SAFE_LINE_PREFIX),
        matching: step.line === null ? 0 : countLines(output, step.line),
        timeout: countLines(output, FLUSH_TIMEOUT_LINE),
      };
      const eventsSince = () =>
        state.arrivals.slice(before.arrivals).filter((arrival) => arrival.kinds !== null && arrival.kinds.includes('event'));

      const sentAt = Date.now();
      const response = await fetch(`${base}${step.path}`, { headers: step.probe ? { 'x-envtest-probe': step.probe } : {} });
      await response.arrayBuffer();
      const receivedAt = Date.now();

      // 늦게 출발하는 envelope 을 기다린 뒤, 기대한 이벤트가 다 오고 수집기가 모두 답할 때까지 기다린다.
      await sleep(200);
      await waitFor(() => eventsSince().length >= step.events && quiet(), 15_000);
      // 느린 단계에서는 flush 제한이 지날 때까지 기다려야 "줄이 없다"를 말할 수 있다.
      if (step.phase === 'slow') await sleep(Math.max(0, receivedAt + SLOW_DELAY_MS - Date.now()));
      await sleep(400);

      const probe = await (await fetch(`${base}${CONTROL}`)).json();
      observations.push({
        step,
        status: response.status,
        sentAt,
        receivedAt,
        events: eventsSince().map(({ arrivedAt, respondedAt }) => ({ arrivedAt, respondedAt })),
        // 핸들러가 끝날 때 건 것이다. 응답을 받은 시각보다 늦을 수 없다(여유 20ms).
        waits: probe.waits.filter((wait) => wait.registeredAt >= sentAt && wait.registeredAt <= receivedAt + 20),
        safeLines: countLines(output, SAFE_LINE_PREFIX) - before.safe,
        matchingLines: step.line === null ? 0 : countLines(output, step.line) - before.matching,
        timeoutLines: countLines(output, FLUSH_TIMEOUT_LINE) - before.timeout,
      });
    }

    return { observations, stdout: output.join('') };
  } finally {
    if (next && next.exitCode === null) next.kill('SIGTERM');
    sink.close();
  }
}

module.exports = {
  STEPS,
  NORMAL_DELAY_MS,
  SLOW_DELAY_MS,
  RESPONSE_BUDGET_MS,
  FLUSH_TIMEOUT_LINE,
  evaluateDelivery,
  runDelivery,
};
```

Run: `npx vitest run __tests__/scripts/envelope-test-delivery.test.ts`
Expected: PASS (15건).

- [ ] **Step 4: 탐침과 테스트 라우트를 쓴다**

`scripts/envelope-test/routes/_lib/delivery-probe.ts`:

```ts
/**
 * 전달 시나리오(scripts/envelope-test/delivery.js)용 탐침.
 *
 * SDK 의 route handler 래퍼는 핸들러가 끝날 때 flush 를 Vercel 요청 컨텍스트의 waitUntil 에 건다. 로컬 next start 에는
 * 그 컨텍스트가 없으므로 같은 자리(`Symbol.for('@vercel/request-context')`)에 기록만 하는 가짜를 둔다.
 * Next 의 after() 는 다른 자리(`@next/request-context`)를 쓰므로 이 가짜의 영향을 받지 않는다.
 *
 * 라우트마다 모듈이 따로 묶일 수 있어 상태를 globalThis 에 둔다.
 */
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
const WAITS = Symbol.for('envtest.delivery.waits');

type Wait = { registeredAt: number; settledAt: number | null };

const globals = globalThis as unknown as Record<symbol, unknown>;

function waits(): Wait[] {
  if (!Array.isArray(globals[WAITS])) globals[WAITS] = [];
  return globals[WAITS] as Wait[];
}

function install(): void {
  const recorded = waits();
  globals[REQUEST_CONTEXT] = {
    get: () => ({
      waitUntil(promise: Promise<unknown>) {
        const wait: Wait = { registeredAt: Date.now(), settledAt: null };
        recorded.push(wait);
        const settle = () => {
          wait.settledAt = Date.now();
        };
        void Promise.resolve(promise).then(settle, settle);
      },
    }),
  };
}

/**
 * 요청 헤더가 시키면 가짜 컨텍스트를 달거나 뗀다. 핸들러의 첫 줄에서 부른다 —
 * 서버가 뜬 뒤의 첫 요청이 곧 측정 대상이 되게 하려는 것이다.
 */
export function applyProbeHeader(headers: Headers): void {
  const command = headers.get('x-envtest-probe');
  if (command === 'install') install();
  if (command === 'remove') delete globals[REQUEST_CONTEXT];
}

export function readProbe(): { installed: boolean; waits: Wait[] } {
  return { installed: REQUEST_CONTEXT in globals, waits: waits().map((wait) => ({ ...wait })) };
}
```

`scripts/envelope-test/routes/delivery-plain/route.ts`:

```ts
import { logError } from '@/utils/log-error';
import { logSafeError } from '@/utils/log-safe-error';
import { applyProbeHeader } from '../_lib/delivery-probe';
import { envelopeTestDisabled } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싸지 않은 라우트. 기록을 남기고 바로 응답한다 — SDK 의 래퍼가 건 flush 가 그 이벤트를 기다리는지 본다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;
  applyProbeHeader(request.headers);

  if (new URL(request.url).searchParams.get('via') === 'logError') {
    logError('envtest delivery legacy', new Error('envtest delivery legacy'));
  } else {
    logSafeError('envtest.delivery.handled', new Error('envtest delivery'));
  }

  return Response.json({ ok: true });
}
```

`scripts/envelope-test/routes/delivery-safe/route.ts`:

```ts
import { logSafeError } from '@/utils/log-safe-error';
import { withSafeErrors } from '@/utils/with-safe-errors';
import { applyProbeHeader } from '../_lib/delivery-probe';
import { envelopeTestDisabled } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싼 라우트. mode 로 고른다: throw(던진다), handled(기록 한 번), multi(기록 세 번), 그 밖(기록 없음).
export const GET = withSafeErrors('envtest.delivery.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;
  applyProbeHeader(request.headers);

  const mode = new URL(request.url).searchParams.get('mode');
  if (mode === 'throw') throw new Error('envtest delivery throw');
  const records = mode === 'multi' ? 3 : mode === 'handled' ? 1 : 0;
  for (let index = 0; index < records; index += 1) {
    logSafeError('envtest.delivery.handled', new Error('envtest delivery'));
  }

  return Response.json({ ok: true });
});
```

`scripts/envelope-test/routes/delivery-control/route.ts`:

```ts
import { readProbe } from '../_lib/delivery-probe';
import { envelopeTestDisabled } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 탐침이 기록한 waitUntil 등록을 실행기에 돌려준다. 기록을 남기지 않는다.
export async function GET(): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  return Response.json(readProbe());
}
```

- [ ] **Step 5: 실행기가 두 시나리오를 돌리게 한다**

`scripts/envelope-test/run.js` 전체를 아래로 바꾼다. 달라지는 것: `sleep`·`listen`·`freePort`·`decode`·`startNext`·`waitFor` 를 `harness.js` 에서 가져온다, 누출 시나리오를 `runLeak` 으로 묶는다, 그 뒤에 `runDeliveryScenario` 를 돌린다, `--only=leak|delivery` 를 받는다. 빌드와 정리(`installTestRoutes` → `build` → `removeTestRoutes`)는 그대로다.

```js
#!/usr/bin/env node
'use strict';

/**
 * envelope 테스트 실행기 (설계 §5.1, §5.2).
 *
 * 실제 Next 서버(Production 빌드, next start)에 실제 요청을 보내고, SDK 가 실제로 내보낸 envelope 을
 * 로컬 수집기로 받는다. 운영 Sentry 로는 아무것도 보내지 않는다. 시나리오는 둘이다.
 *   누출(leak)     — canary 를 넣은 요청을 보내고 envelope 과 서버 출력에서 찾는다(scenario.js, analyze.js).
 *   전달(delivery) — 수집기가 답하는 시간을 조절해, 응답 뒤의 flush 가 무엇을 기다리는지 잰다(delivery.js).
 *
 *   npm run test:envelope                    # 테스트 빌드를 만들고 둘 다 돌린다
 *   npm run test:envelope -- --skip-build    # 이미 만든 .next-envtest 를 다시 쓴다
 *   npm run test:envelope -- --only=leak     # 하나만 돌린다(leak | delivery)
 *
 * 빌드가 Supabase 조회에 의존하므로 CI 에서는 돌리지 않는다. 판정 로직(analyze.js, delivery.js)의 단위 테스트만 CI 에서 돈다.
 * Sentry SDK 를 올리거나 sentry.*.config.js, utils/logger*.ts, utils/log-safe-error.ts, utils/with-safe-errors.ts 를
 * 고치면 다시 돌린다.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { parseEnvelope, evaluate, countsSatisfied } = require('./analyze');
const { TEST_DIST_DIR, TEST_ROUTE_SOURCE, TEST_ROUTE_TARGET } = require('./build-switch');
const { evaluateDelivery, runDelivery } = require('./delivery');
const { sleep, listen, freePort, decode, startNext, waitFor, waitUntilReady } = require('./harness');
const { CANARIES, EXPECTED, UNHANDLED_LINE_MARKER, buildRequests } = require('./scenario');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, TEST_DIST_DIR, 'envelope-test');
const NEXT_BIN = path.join(ROOT, 'node_modules', '.bin', 'next');
const ROUTE_SOURCE = path.join(ROOT, TEST_ROUTE_SOURCE);
const ROUTE_TARGET = path.join(ROOT, TEST_ROUTE_TARGET);
// distDir 이 다르면 Next 가 빌드 중에 이 두 파일을 고친다. 빌드가 끝나면 되돌린다.
const FILES_NEXT_REWRITES = ['next-env.d.ts', 'tsconfig.json'];

const skipBuild = process.argv.includes('--skip-build');
const only = (process.argv.find((arg) => arg.startsWith('--only=')) || '--only=all').slice('--only='.length);
if (!['all', 'leak', 'delivery'].includes(only)) {
  console.error(`[envelope] --only 는 leak 또는 delivery 다: ${only}`);
  process.exit(2);
}

/** 로컬 Sentry 수집기. 받은 envelope 을 그대로 풀어 배열에 쌓는다. */
function createSink(envelopes) {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        envelopes.push(parseEnvelope(decode(Buffer.concat(chunks), req.headers['content-encoding'])));
      } catch (error) {
        envelopes.push({ header: { __decodeError: String(error) }, items: [] });
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
}

/** 서버가 밖으로 부르는 요청을 받아 주는 가짜 외부 서버. */
function createUpstream() {
  return http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
}

function snapshotFiles() {
  return FILES_NEXT_REWRITES.map((name) => ({ name, content: fs.readFileSync(path.join(ROOT, name)) }));
}

function restoreFiles(snapshot) {
  for (const { name, content } of snapshot) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) fs.writeFileSync(file, content);
  }
}

/** 테스트용 라우트를 app/ 에 복사한다. 빌드가 끝나면 지운다 — 저장소의 app/ 에는 없어야 한다. */
function installTestRoutes() {
  if (fs.existsSync(ROUTE_TARGET)) {
    throw new Error(`${TEST_ROUTE_TARGET} 가 이미 있다. 이전 실행이 남긴 것이면 지우고 다시 실행한다.`);
  }
  fs.cpSync(ROUTE_SOURCE, ROUTE_TARGET, { recursive: true });
}

function removeTestRoutes() {
  fs.rmSync(ROUTE_TARGET, { recursive: true, force: true });
}

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(NEXT_BIN, ['build'], {
      cwd: ROOT,
      stdio: 'inherit',
      // DSN 을 비워 빌드 중의 오류가 운영 Sentry 로 가지 않게 한다. NEXT_PUBLIC_ 값은 빌드에 박힌다.
      env: { ...process.env, ENVELOPE_TEST: '1', SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '', NEXT_TELEMETRY_DISABLED: '1' },
    });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`next build 가 실패했다(코드 ${code})`))));
  });
}

function report(failures) {
  if (failures.length === 0) return 0;
  console.error(`\n[envelope] 실패 ${failures.length}건`);
  for (const failure of failures) console.error(`  - ${failure}`);
  return 1;
}

/** 누출 시나리오. canary 를 넣은 요청을 보내고 envelope 과 서버 출력에서 찾는다. */
async function runLeak(track) {
  const envelopes = [];
  const output = [];
  const sink = createSink(envelopes);
  const upstream = createUpstream();
  let next;

  try {
    // DSN 은 127.0.0.1, 가짜 외부 서버는 localhost 로 부른다. SDK 는 DSN 의 호스트 문자열이 들어간
    // 주소로 가는 요청에 span 을 만들지 않는다(isSentryRequestUrl).
    const sinkPort = await listen(sink, '127.0.0.1');
    const upstreamPort = await listen(upstream, 'localhost');
    const port = String(await freePort());

    next = track(
      startNext(
        NEXT_BIN,
        ROOT,
        {
          ...process.env,
          NODE_ENV: 'production',
          ENVELOPE_TEST: '1',
          PORT: port,
          SENTRY_DSN: `http://envtestkey@127.0.0.1:${sinkPort}/1`,
          NEXT_PUBLIC_SENTRY_DSN: '',
          SENTRY_TRACES_SAMPLE_RATE: '1',
          ENVELOPE_TEST_UPSTREAM: `http://localhost:${upstreamPort}`,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        output,
      ),
    );
    await waitUntilReady(next, output);

    const statuses = [];
    const responses = [];
    for (const request of buildRequests(`http://127.0.0.1:${port}`)) {
      const response = await fetch(request.url, { redirect: 'manual', ...request.init });
      const body = Buffer.from(await response.arrayBuffer()).toString('utf8');
      statuses.push(`${request.label} ${response.status}`);
      // redirect 는 따라가지 않는다(redirect: 'manual'). 응답 코드와 Location, Set-Cookie 를 그대로 본다.
      responses.push({
        label: request.label,
        url: request.url,
        status: response.status,
        location: response.headers.get('location'),
        setCookies: response.headers.getSetCookie(),
        body,
        expect: request.expect,
      });
    }

    // SDK 는 응답 뒤에 내보낸다. 기대한 건수가 다 올 때까지 기다리고, 늦게 오는 것을 조금 더 받는다.
    await waitFor(() => countsSatisfied(envelopes, EXPECTED), 30_000);
    await sleep(3_000);

    const stdout = output.join('');
    const result = evaluate({
      envelopes,
      stdout,
      canaries: CANARIES,
      expected: EXPECTED,
      unhandledLineMarker: UNHANDLED_LINE_MARKER,
      responses,
    });

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'envelopes.jsonl'), envelopes.map((envelope) => JSON.stringify(envelope)).join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, 'stdout.log'), stdout);
    // 기대를 적은 요청의 응답만 남긴다. 페이지의 HTML 은 크고 판정에 쓰지 않는다.
    fs.writeFileSync(path.join(OUT_DIR, 'responses.json'), JSON.stringify(responses.filter((response) => response.expect), null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ statuses, ...result }, null, 2));

    const itemCount = envelopes.reduce((sum, envelope) => sum + envelope.items.length, 0);
    console.log(`\n[envelope] 누출 시나리오 — 요청 ${statuses.length}건: ${[...new Set(statuses)].join(', ')}`);
    console.log(`[envelope] 받은 envelope ${envelopes.length}건(항목 ${itemCount}건)`);
    for (const count of result.counts) {
      console.log(`[envelope]   ${count.label}: ${count.actual}건 (기대 ${count.expected})`);
    }

    const code = report(result.failures);
    if (code === 0) console.log('[envelope] 누출 시나리오 통과: 건수가 맞고 canary 가 허용된 곳에만 있다.');
    return code;
  } finally {
    if (next && next.exitCode === null) next.kill('SIGTERM');
    sink.close();
    upstream.close();
  }
}

/** 전달 시나리오. 서버를 새로 띄운다 — 서버의 첫 요청이 측정 대상이다. */
async function runDeliveryScenario(track) {
  const { observations, stdout } = await runDelivery({ root: ROOT, nextBin: NEXT_BIN, onServer: track });
  const result = evaluateDelivery(observations);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'delivery-stdout.log'), stdout);
  fs.writeFileSync(path.join(OUT_DIR, 'delivery.json'), JSON.stringify({ observations, ...result }, null, 2));

  console.log(`\n[envelope] 전달 시나리오 — 요청 ${observations.length}건`);
  for (const observation of observations) {
    const [wait] = observation.waits;
    const responded = observation.events.map((event) => event.respondedAt).filter((at) => at !== null);
    const parts = [
      `${observation.status}`,
      `응답 ${observation.receivedAt - observation.sentAt}ms`,
      `이벤트 ${observation.events.length}건`,
      wait && wait.settledAt !== null ? `flush ${wait.settledAt - wait.registeredAt}ms` : `waitUntil ${observation.waits.length}건`,
      wait && wait.settledAt !== null && responded.length > 0 ? `전송 완료 대비 ${wait.settledAt - Math.max(...responded)}ms` : null,
      `로그 ${observation.safeLines}줄`,
      `제한 초과 ${observation.timeoutLines}줄`,
    ].filter(Boolean);
    console.log(`[envelope]   ${observation.step.label}: ${parts.join(', ')}`);
  }

  const code = report(result.failures);
  if (code === 0) console.log('[envelope] 전달 시나리오 통과: flush 가 전송을 기다리고, 제한 초과가 경계에서만 한 줄씩 남는다.');
  return code;
}

async function main() {
  const snapshot = snapshotFiles();
  const servers = new Set();
  const track = (child) => {
    servers.add(child);
    return child;
  };
  let routesInstalled = false;

  const cleanup = () => {
    for (const child of servers) {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
    if (routesInstalled) removeTestRoutes();
    routesInstalled = false;
    restoreFiles(snapshot);
  };
  // Ctrl+C 로 끊어도 복사한 라우트와 Next 가 고친 파일이 남지 않게 한다.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      cleanup();
      process.exit(130);
    });
  }

  try {
    if (!skipBuild) {
      installTestRoutes();
      routesInstalled = true;
      try {
        await build();
      } finally {
        removeTestRoutes();
        routesInstalled = false;
        restoreFiles(snapshot);
      }
    }
    if (!fs.existsSync(path.join(ROOT, TEST_DIST_DIR, 'BUILD_ID'))) {
      throw new Error(`${TEST_DIST_DIR} 에 빌드가 없다. --skip-build 없이 다시 실행한다.`);
    }

    const codes = [];
    if (only !== 'delivery') codes.push(await runLeak(track));
    if (only !== 'leak') codes.push(await runDeliveryScenario(track));
    console.log(`\n[envelope] 결과 파일: ${OUT_DIR}`);
    return Math.max(...codes);
  } finally {
    cleanup();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[envelope] 실행 실패: ${error.stack || error}`);
    process.exit(2);
  },
);
```

- [ ] **Step 6: 라우트 목록 테스트를 고친다**

최종 라우트 목록 테스트는 Task 7 의 Step 5 에 있다. 전달 라우트 셋과 `boundary-hostile` 을 포함한 실제 파일로 동기화했다.

Run: `npx vitest run __tests__/scripts && npx tsc --noEmit && node --check scripts/envelope-test/run.js`
Expected: PASS, 타입 오류 없음.

- [ ] **Step 7: 틈을 만들어 전달 시나리오의 실패를 본다 (되돌린다)**

Task 5 의 Step 3 과 같은 한 줄을 `utils/logger-targets.ts` 에 넣고 빌드한다.

Run: `npm run test:envelope -- --only=delivery`
Expected: 종료 코드 1, 실패 7건. 실행에서 본 출력이다.

```
[envelope]   서버의 첫 요청: logError 뒤 바로 응답: 200, 응답 328ms, 이벤트 1건, flush 22ms, 전송 완료 대비 -311ms, 로그 1줄, 제한 초과 0줄
[envelope]   logSafeError 뒤 바로 응답(경계 없음): 200, 응답 6ms, 이벤트 1건, flush 2ms, 전송 완료 대비 -306ms, 로그 1줄, 제한 초과 0줄
[envelope]   경계가 잡은 예외: 500, 응답 7ms, 이벤트 1건, flush 2ms, 전송 완료 대비 -306ms, 로그 1줄, 제한 초과 0줄
[envelope]   경계 안의 기록 한 번: 200, 응답 10ms, 이벤트 1건, flush 8ms, 전송 완료 대비 -301ms, 로그 1줄, 제한 초과 0줄
[envelope]   경계 안의 기록 세 번: 200, 응답 6ms, 이벤트 3건, flush 2ms, 전송 완료 대비 -307ms, 로그 3줄, 제한 초과 0줄

[envelope] 실패 7건
  - 서버의 첫 요청: logError 뒤 바로 응답: flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다
  - logSafeError 뒤 바로 응답(경계 없음): flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다
  - 경계가 잡은 예외: flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다
  - 경계 안의 기록 한 번: flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다
  - 경계 안의 기록 세 번: flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다
  - 제한 초과: 경계가 잡은 예외: '[sentry] flush timeout' 기대 1줄, 실제 0줄
  - 제한 초과: 경계 안의 기록 세 번: '[sentry] flush timeout' 기대 1줄, 실제 0줄
```

flush 는 빈 큐를 보고 2~22ms 에 끝났고, 이벤트는 그 뒤 약 300ms 에 전송을 마쳤다. 경계 함수의 flush 도 이벤트가 큐에 들어가기 전에 돌아 제한 초과 줄을 남기지 못했다.

수집기가 모든 envelope 에 늦게 답하던 처음 구현에서는 이 단계가 4건만 실패했다(다섯 번째는 0ms 로 겹쳤다). 그래서 수집기를 고쳤다(위의 실행 결과).

Run: `git checkout -- utils/logger-targets.ts`

- [ ] **Step 8: 두 시나리오의 통과를 본다**

Run: `npm run test:envelope`
Expected: 종료 코드 0. 누출 시나리오는 Task 7 의 Step 6 과 같다(단락 평가 수정 뒤 30건), 전달 시나리오는 아래 모양이다(실행에서 본 출력. ms 값은 실행마다 조금 다르다).

```
[envelope] 전달 시나리오 — 요청 11건
[envelope]   서버의 첫 요청: logError 뒤 바로 응답: 200, 응답 356ms, 이벤트 1건, flush 326ms, 전송 완료 대비 1ms, 로그 1줄, 제한 초과 0줄
[envelope]   logSafeError 뒤 바로 응답(경계 없음): 200, 응답 6ms, 이벤트 1건, flush 304ms, 전송 완료 대비 2ms, 로그 1줄, 제한 초과 0줄
[envelope]   경계가 잡은 예외: 500, 응답 11ms, 이벤트 1건, flush 305ms, 전송 완료 대비 1ms, 로그 1줄, 제한 초과 0줄
[envelope]   경계 안의 기록 한 번: 200, 응답 19ms, 이벤트 1건, flush 310ms, 전송 완료 대비 0ms, 로그 1줄, 제한 초과 0줄
[envelope]   경계 안의 기록 세 번: 200, 응답 20ms, 이벤트 3건, flush 311ms, 전송 완료 대비 1ms, 로그 3줄, 제한 초과 0줄
[envelope]   경계 안, 기록 없음: 200, 응답 4ms, 이벤트 0건, flush 1ms, 로그 0줄, 제한 초과 0줄
[envelope]   요청 컨텍스트 없음: 200, 응답 5ms, 이벤트 1건, waitUntil 0건, 로그 1줄, 제한 초과 0줄
[envelope]   제한 초과: 경계가 잡은 예외: 500, 응답 9ms, 이벤트 1건, flush 2003ms, 전송 완료 대비 -601ms, 로그 1줄, 제한 초과 1줄
[envelope]   제한 초과: 경계 안의 기록 세 번: 200, 응답 17ms, 이벤트 3건, flush 2005ms, 전송 완료 대비 -601ms, 로그 3줄, 제한 초과 1줄
[envelope]   제한 초과: 경계 안, 기록 없음: 200, 응답 7ms, 이벤트 0건, flush 2ms, 로그 0줄, 제한 초과 0줄
[envelope]   제한 초과: 경계 없는 라우트: 200, 응답 5ms, 이벤트 1건, flush 2004ms, 전송 완료 대비 -600ms, 로그 1줄, 제한 초과 0줄
[envelope] 전달 시나리오 통과: flush 가 전송을 기다리고, 제한 초과가 경계에서만 한 줄씩 남는다.
```

설계 §5.2 의 사례와 맞춰 읽는다. 사례 1(정상): flush 가 전송 완료 뒤 0~2ms 에 끝나고, 응답은 전송을 기다리지 않는다. 서버의 첫 요청도 같다. 기록이 없는 요청의 flush 는 1ms 에 끝난다 — 기다릴 것이 없다. 사례 2(제한 초과): flush 가 약 2.0초에 끝나고(전송 완료보다 약 0.6초 앞), `[sentry] flush timeout` 은 경계가 오류를 기록한 요청에만 한 줄씩 — 세 번 남겨도 한 줄, 기록이 없으면 0줄, 감싸지 않은 라우트는 0줄. 사례 3(요청 컨텍스트 없음): `waitUntil` 에 걸린 것이 없고 로그 한 줄은 남는다.

- [ ] **Step 9: 커밋한다**

```bash
git status --short --untracked-files=all   # utils/logger-targets.ts 가 바뀌어 있지 않은지, app/api/envelope-test 가 없는지 본다
git add scripts/envelope-test/harness.js scripts/envelope-test/delivery.js scripts/envelope-test/run.js scripts/envelope-test/routes/_lib/delivery-probe.ts scripts/envelope-test/routes/delivery-plain/route.ts scripts/envelope-test/routes/delivery-safe/route.ts scripts/envelope-test/routes/delivery-control/route.ts __tests__/scripts/envelope-test-delivery.test.ts __tests__/scripts/envelope-test-routes.test.ts
git commit -m "test(envelope): 전달 시나리오를 실제 서버에서 잰다"
```

---

### Task 9: 설계서와 주석을 실측에 맞춘다

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md`
- Modify: `utils/log-error.ts` (머리말 주석만)
- Modify: 이 계획 문서(`실행 결과` 절을 더한다)

- [ ] **Step 1: 설계서를 고친다**

| 자리 | 바꾸는 것 |
|---|---|
| 상태 줄(5행) 끝 | "PR 2(계약 함수·경계 함수·전달)의 구현 계획은 `docs/superpowers/plans/2026-10-06-log-safe-error-contract-and-boundary.md` 다. PR 2 를 준비하며 잰 결과로 §2.3·§4.2·§4.3·§4.7·§5.2·§8 을 고쳤다(§10.7). **`await import` 로 인한 전달의 틈은 없었다.**" 를 더한다 |
| §2.3 의 셋째 불릿 | "초안은 여기서 틈을 하나 가정했다: `logError` 가 동기로 돌아오고 `captureException` 은 `await import` 뒤에 불리므로 그 순서가 SDK 의 flush 호출보다 늦을 수 있다는 것이다. **2026-10-06 에 재 보니 틈은 없다**(§4.3 의 2, §5.2). 서버 번들에서 동적 import 는 마이크로태스크만으로 풀리고, flush 는 처리 중인 이벤트를 1ms 타이머로 처음 확인한다. 타이머는 마이크로태스크가 다 돈 뒤에 온다." 로 바꾼다 |
| §4.2 끝 | "구현에서 정한 것" 불릿을 더한다: 목록에 없는 사건 코드는 `log.invalid_event_code` 로 남긴다 / `droppedFields` 에는 정해진 필드 이름과 `code`·`fields`·`other` 만 들어간다 / `undefined`·`null` 은 버린 것으로 세지 않는다 / Sentry 이벤트의 fingerprint 에 사건 코드를 더한다(경계가 잡은 예외는 stack 이 모두 같다) / 표의 초기값과 그 기준(이 계획의 "설계와 달라지는 것" 5번) / `logSafeError` 는 기존 `Logger` 를 거쳐 두 target 에 같은 `LogEntry` 를 넘긴다 |
| §4.3 의 2번 첫 불릿(정적 import) | "**`SentryLogTarget` 은 바꾸지 않는다.** 초안은 `await import` 를 정적 import 로 바꿔 이벤트가 큐에 들어가는 시점을 앞당기려 했다. 재 보니 그럴 필요가 없다(§5.2). 핸들러가 기록을 남기고 바로 응답해도 SDK 가 핸들러 끝에서 건 flush 는 그 이벤트의 전송까지 기다린다. 순서가 구조로 정해져 있기 때문이다: (1) 서버 번들에서 `import('@sentry/nextjs')` 는 `Promise.resolve().then(require)` 이거나 청크를 동기 `require` 로 올린 뒤의 `then` 이어서 마이크로태스크만으로 풀린다. (2) `client.flush` 는 처리 중인 이벤트 수를 1ms 타이머로 처음 확인하고, `captureException` 은 호출 즉시 그 수를 올린다. 이 순서는 CI 테스트(`__tests__/utils/log-safe-error-delivery.test.ts`)와 실제 서버의 전달 시나리오가 고정한다 — `captureException` 앞에 5ms 타이머를 넣으면 둘 다 실패한다." 로 바꾼다(실제 글은 타이머와 마이크로태스크의 순서, event processor 에 관한 문장을 더했다) |
| §4.3 의 2번, `after` 불릿 뒤 | 불릿 둘을 더한다: "`Sentry.flush(2000)` 의 2초는 처리 대기와 전송 대기에 각각 적용된다. 실측에서는 제한 초과 때 약 2.0초에 끝났다. 오류를 기록한 요청은 응답 뒤에 인스턴스를 그만큼 더 붙잡는다." / "SDK 가 초기화되지 않았으면(DSN 없음) flush 하지 않는다. 그때 `Sentry.flush` 는 `false` 를 주는데 제한 초과가 아니다." |
| §4.3 의 2번 마지막 불릿(`log-error.ts` 는 브라우저 번들에도…) | "`log-safe-error.ts` 도 브라우저 번들에 들어간다(`lib/supabase/social/**`). `after` 와 `AsyncLocalStorage` 는 서버 전용 파일 `utils/with-safe-errors.ts` 에만 둔다. 경계가 '이 요청에서 기록이 있었는가'를 알도록 `logSafeError` 는 등록된 함수 하나를 부른다 — 브라우저에는 등록하는 코드가 없다(런타임 분기가 아니라 파일 분리)." 로 바꾼다 |
| §4.3 의 3번 | 끝에 "핸들러가 끝난 뒤에 남긴 기록(기다리지 않은 Promise 가 나중에 실패하는 경우)도 여기에 든다. 그 요청의 flush 는 이미 끝났다." 를 더한다 |
| §4.7 "결제·인증 라우트" 끝 | "구현에서 정한 것" 불릿: `redirect()`·`notFound()`·동적 렌더링 신호는 `unstable_rethrow` 로 올려보낸다 / 고정 응답은 500, 본문 `{ "error": "Internal server error" }` / 경계가 겹치면 바깥 경계가 flush 를 한 번 건다 / `after` 를 쓸 수 없으면(요청 범위 밖) flush 없이 응답만 돌려준다 |
| §5.1 | "PR 2 가 더한 것" 불릿: 경계로 감싼 요청 둘(`boundary-throw`, `boundary-handled`), 가린 기록의 모양 판정(type, fingerprint, `contexts.log`)과 서버 출력의 줄 수. 경계 없이 `logError` 에 값을 넘긴 모습에서는 실패 20건(Task 7 의 목록 요약), 경계와 계약 함수로 바꾼 뒤 0건 |
| §5.2 전체 | 아래 Step 2 의 글로 바꾼다 |
| §6.4 | "정적 import 로 서버 번들이 달라진다" 줄을 지운다. 두 줄을 더한다: "`unstable_rethrow` 는 이름대로 안정 API 가 아니다 \| 실제 Next 오류(redirect, notFound, DynamicServerError)로 도는 단위 테스트가 Next 를 올릴 때 달라진 동작을 드러낸다" / "경계가 잡은 예외는 원본 메시지와 stack 을 잃는다 \| 결정 3 에서 받아들였다. 부족하면 라우트 안의 단계마다 사건 코드를 나눠 `logSafeError` 를 부른다" |
| §8 확인한 사실 | 줄을 더한다: 틈이 없다는 것과 근거(실제 서버 측정, 빌드 산출물의 두 가지 모양, `client.js` 의 줄 번호) / `after` 콜백의 flush 가 로컬 `next start` 에서 응답 뒤에 끝까지 돈다(제한 초과 줄 실측) / `after()` 는 요청 범위 밖에서 던진다 / DSN 이 없으면 `Sentry.flush()` 는 `false` 다 / 오류의 이름은 예외의 type 과 span 의 `error.type` 으로, cause 는 이어진 예외로 나간다(Task 7 의 실패 목록) |
| §8 남은 가정 | "`await import` 때문에…" 줄을 지운다. "`after()` 안의 flush 가 Vercel 에서…" 의 확인 방법을 "PR 3 배포 뒤(경계로 감싼 라우트가 처음 생긴다)…" 로 고친다. "가린 기록의 이벤트가 Sentry 에서 사건 코드별 이슈로 갈린다" 줄을 더한다 |
| §10 끝 | "### 10.7 PR 2 를 준비하고 구현하면서 달라진 것 (2026-10-06)" 을 더한다. 이 계획의 "설계와 달라지는 것" 표를 옮기고, 전달 시나리오의 수집기를 고친 일을 적는다 |

- [ ] **Step 2: §5.2 를 다시 쓴다**

```markdown
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
```

- [ ] **Step 3: `utils/log-error.ts` 머리말의 "알려진 한계"를 고친다**

```ts
 * 알려진 한계:
 * - 전송을 직접 기다리지 않는다. route handler 안에서 핸들러가 끝나기 전에 부른 것은
 *   SDK 의 래퍼가 끝에서 건 flush(2초 제한)가 기다린다(2026-10-06 실측, 설계 §4.3).
 *   핸들러가 끝난 뒤에 부른 것과 Vercel 요청 컨텍스트 밖에서 부른 것은 기다리는 것이 없다.
 * - 호출부가 넘긴 값(메시지, 오류의 name·message·stack·cause, context)을 그대로 콘솔과
 *   Sentry 로 보낸다. SDK 가 스스로 붙이던 헤더·쿠키·쿼리는 #119 가 껐다.
 *   값을 가려 남겨야 하는 경로(결제·인증)에는 logSafeError(log-safe-error.ts)를 쓴다.
```

- [ ] **Step 4: 이 계획에 `실행 결과` 절을 더한다**

머리말 아래에 실행하면서 계획과 달라진 것(무엇, 계획, 실제, 이유)을 표로 적는다. 달라진 것이 없으면 그렇게 적는다. envelope 테스트의 실제 출력과 테스트 수를 적는다.

- [ ] **Step 5: 커밋한다**

```bash
git add docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md docs/superpowers/plans/2026-10-06-log-safe-error-contract-and-boundary.md utils/log-error.ts
git commit -m "docs(logging): 전달 실측과 PR 2 의 구현을 설계서에 반영한다"
```

---

### Task 10: 전체 검증, PR, 교차 리뷰

**Files:** 없음(검증과 PR).

- [ ] **Step 1: CI 가 도는 것을 로컬에서 돌린다**

Run: `npx tsc --noEmit && npm run lint && npm test && TZ=UTC npm test`
Expected: 타입 검사·lint 통과. 두 번 모두 `Test Files 204 passed (204)`, `Tests 3387 passed | 6 expected fail | 1 skipped (3394)`.

- [ ] **Step 2: 마지막 커밋에서 envelope 테스트를 다시 돌린다**

Run: `npm run test:envelope`
Expected: 종료 코드 0, 두 시나리오 통과. 출력의 건수 줄과 전달 시나리오의 줄을 PR 본문에 옮긴다.

- [ ] **Step 3: 빠진 문서와 남은 파일이 없는지 본다**

Run: `git status --short --untracked-files=all && git diff --stat origin/main...HEAD`
Expected: 작업 트리가 깨끗하다. 바뀐 파일이 "파일 구조"의 목록과 같다. `app/`, `lib/`, `components/`, `sentry.*.config.js`, `next.config.js` 가 없다.

- [ ] **Step 4: PR 을 만든다**

```bash
git push -u origin feat/log-redaction-contract
gh pr create --title "feat(logging): 계약을 통과한 값만 남기는 logSafeError 와 경계 함수 withSafeErrors (B-P4 PR 2)" --body-file <본문 파일>
```

본문에 넣을 것: 무엇을 더했고 무엇을 바꾸지 않았는가(호출부는 PR 3·4), 설계와 달라진 것 일곱 가지, 전달 실측(틈 없음과 그 이유), envelope 테스트의 출력(경계 없이 20건 실패 → 0건, 지연 5ms 에서 5건 실패 → 0건), 남는 한계, 머지 뒤 확인(운영 호출부가 없으므로 배포 성공과 5xx·Sentry 신규 이슈만 본다), `Refs #73, #74`.

PR 을 만든 뒤 전역 지침의 Vercel Preview 조회를 돌린다(이 레포는 Preview 가 없어 URL 이 나오지 않는다).

- [ ] **Step 5: 교차 리뷰를 받는다**

사용량 게이트(`ROUTER_CLAUDE_SOURCE=auto route-fresh.sh auto high auto auto`)를 통과하면 Codex `gpt-6-sol`/high 읽기 전용 리뷰어를 Orca 로 띄운다. `dispatchAllowed=false` 면 작업자를 만들지 않고 사유를 보고한다. 리뷰어에게는 요구사항(설계 §4.2·§4.3·§4.7·§5.2 와 이 계획의 Global Constraints·Review Focus), diff, 테스트 결과만 준다. 지적은 실패하는 테스트를 먼저 쓰고 고친 뒤 원 리뷰어가 한 번 재검증한다. 판정을 읽은 뒤 Dispatch 를 정산한다.

- [ ] **Step 6: 사용자에게 머지 승인을 요청한다**

리뷰 판정, 테스트 수, envelope 출력, 남는 한계를 보고한다. 승인 전에는 머지하지 않는다.

## 머지 (사용자 승인 뒤)

squash 머지한다. 머지가 곧 Production 배포다. 이 PR 은 운영 코드의 호출부를 바꾸지 않으므로 운영의 동작은 그대로여야 한다. 배포 뒤에 볼 것: 배포 성공, main CI, `/api/envelope-test/*` 가 404(테스트 라우트가 운영 산출물에 없다), 30분 동안의 5xx 와 Sentry 신규 이슈. 워크트리와 브랜치를 정리한다.

## Self-Review

**1. 설계 범위.**

| 설계 | 작업 |
|---|---|
| §4.2 닫힌 사건 코드, 오류 이름 표, 오류 코드 표 | Task 1 |
| §4.2 가린 기록을 새로 만든다, 필드 형식, `droppedFields`, 호출 지점의 stack, 두 target 이 같은 기록 | Task 2, Task 3 |
| §4.2 lint 로 `logError`·`console.*` 금지, 전수 조사 표 | 이 PR 이 아니다(§6.1: PR 3·4) |
| §4.3 의 1 가린 로그 한 줄(동기) | Task 3(`Console 줄은 함수가 돌아오기 전에 찍힌다`), Task 4(`가린 로그 줄은 응답이 만들어지기 전에 찍힌다`), Task 7(서버 출력의 줄 수) |
| §4.3 의 2 요청당 한 번의 flush, 제한 초과 줄 | Task 4, Task 8 |
| §4.3 의 2 정적 import | 하지 않는다. Task 9 가 설계서를 고친다 |
| §4.3 의 3 보장하지 못하는 것 | Task 5(핸들러 뒤의 기록), Task 8(요청 컨텍스트 없음) |
| §4.7 경계 함수, 고정 500, 본문에 메시지 없음 | Task 4, Task 7 |
| §4.7·§5.1 경계로 감싼 테스트 요청, 원본 메시지가 출력과 envelope 에 없다 | Task 7 |
| §5.2 사례 1·2·3 | Task 8(실제 서버), Task 5(CI) |
| §5.3 계약 함수의 단위 테스트(canary 를 코드·이름·stack·cause 에) | Task 1, Task 3 |
| §5.3 fixture 테스트(대표 오류 다섯 가지) | 호출부가 생기는 PR 3·4. 이 PR 은 계약 수준에서 "통과한 필드는 남는다"를 Task 3 과 Task 7(`logContext`)로 본다 |
| §5.3 결제 계약 테스트 17건, `it.fails` 6건 | Task 10 Step 1(전체 테스트) |

**2. 자리 표시.** 없다. 코드 단계에는 코드가, 실행 단계에는 명령과 기대 출력이 있다. Task 9 의 설계서 수정은 바꿀 자리와 넣을 글을 적었다.

**3. 이름과 타입.** `logSafeError(code, error, fields)`, `buildSafeRecord`, `setSafeErrorListener`, `withSafeErrors(code, handler)`, `Logger.safeError(code, error, context)`, `LogEntry.fingerprint`, `FLUSH_TIMEOUT_LINE`, `evaluateDelivery(observations)`, `runDelivery({ root, nextBin, onServer })`, `STEPS` 가 정의한 작업과 쓰는 작업에서 같다. 테스트 라우트가 쓰는 사건 코드 넷은 Task 1 의 목록에 있다.

**4. Review Focus.** 다섯 줄 모두 테스트가 있다(위 목록의 작업 표시). 여섯 번째로 볼 만한 것 — 형식이 맞는 토큰이 ID 자리로 들어오는 경우 — 는 막을 수 없는 한계라 "남는다"를 고정하는 테스트를 Task 3 에 뒀다.
