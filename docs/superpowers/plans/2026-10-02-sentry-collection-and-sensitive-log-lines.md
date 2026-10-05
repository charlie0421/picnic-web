# Sentry 수집 축소와 민감 로그 줄 삭제 (B-P4 의 PR 1 · PR 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버·edge 의 Sentry SDK 가 스스로 붙이던 쿠키·헤더·IP·쿼리와 console breadcrumb 을 이벤트에서 없애고(PR 1), OAuth code 와 결제 토큰을 Vercel 로그에 찍는 줄과 웹훅 본문 에코를 지운다(PR 1b).

**Architecture:** 수집을 끈다(`requestDataIntegration` 의 `include`, `Console` 제외). 남는 URL·쿼리와 토큰 모양 값은 순수 함수 모듈 `lib/sentry/scrub.ts` 하나가 `beforeSend`·`beforeSendTransaction`·`beforeSendSpan` 세 곳에서 처리한다. 검증의 중심은 실제 Next 서버(`next start`)가 실제로 내보낸 envelope 을 로컬 수집기로 받아 canary 를 찾는 스크립트(`npm run test:envelope`)다. 테스트용 라우트의 원본은 `scripts/envelope-test/routes/` 에 있고, 실행기가 테스트 빌드를 만드는 동안만 `app/api/envelope-test/` 로 복사한다.

**Tech Stack:** Next 15.5.26 (App Router, webpack), `@sentry/nextjs` 9.47.1, vitest 4 (jsdom), Node 24, CommonJS 스크립트(`scripts/`).

**Spec:** `docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md` (§4.1, §4.4, §4.5, §4.7, §5.1, §6.1 의 PR 1 · 1b). 결정 1·3·6·8 은 2026-10-02 에 권장대로 확정됐다(§9).

**실행 방식:** Native. 조정자가 이 세션에서 직접 구현하고, PR 마다 Codex(`gpt-6-sol`/high, 읽기 전용)가 고위험 교차 리뷰를 한다. 작업들이 같은 모듈의 함수 이름과 이벤트 모양을 공유해 나눠 맡기기 어렵고, Claude 주간 사용률이 90% 를 넘어 하위 에이전트를 띄우지 않는다. 머지는 사용자 승인 뒤에 한다.

## 실행 결과 (2026-10-02)

이 계획은 실행됐다. PR 1 은 `fix/sentry-collection-scope`(#119), PR 1b 는 `fix/remove-sensitive-log-lines`(#118)다. 아래 본문의 파일 블록은 실행이 끝난 뒤의 실제 파일과 같게 맞췄다. 실행하면서 계획과 달라진 것:

| 무엇 | 계획 | 실제 | 이유 |
|---|---|---|---|
| 테스트용 라우트를 가르는 방법 (Task 1·4) | `pageExtensions` 에 `envtest.ts` 를 더하고 `app/api/envelope-test/**/route.envtest.ts` 로 둔다 | 원본을 `scripts/envelope-test/routes/**/route.ts` 에 두고 실행기가 빌드 동안만 `app/api/envelope-test/` 로 복사했다가 지운다. `nextConfigOverrides` 는 `distDir` 만 바꾼다 | Next 15.5 가 확장자가 두 겹인 edge 라우트에 client reference manifest 를 만들지 않아 빌드가 실패했다 |
| console canary (Task 4) | `console.log` | `console.warn` | 운영 빌드는 `compiler.removeConsole` 로 `console.log` 를 지운다 |
| 처리되지 않은 예외의 `request_path` (Task 2·4) | 있어야 하고 쿼리가 없어야 한다 | 있으면 쿼리가 없어야 한다 | 라우트 핸들러의 오류는 SDK 의 라우트 래퍼가 잡아 `contexts.nextjs` 가 없다 |
| 웹훅 transaction (Task 4) | 3건 이상 | 기대하지 않는다. 대신 예외를 던진 요청, edge 라우트, middleware 의 transaction 을 기대한다 | SDK 가 401 응답의 transaction 을 버린다 |
| `collection.test.ts` 의 환경 (Task 3) | `// @vitest-environment node` | 기본(jsdom) | 공용 setup 파일이 `window` 를 쓴다 |
| 가리는 순회의 범위 (Task 5) | 이벤트 전체 | `sdkProcessingMetadata` 를 건너뛴다 | SDK 내부 자료의 `Authorization` 헤더를 토큰으로 보고 태그를 붙였다. green 실행의 "기대하지 않은 tripwire" 검사가 잡았다 |
| `postbuild` 를 고정하던 기존 테스트 (Task 1) | 언급 없음 | `__tests__/scripts/verify-rendering-modes.test.ts` 의 단언을 "렌더링 모드 검사가 먼저, `next-sitemap` 이 마지막"으로 고쳤다 | 전체 테스트를 돌리지 않고 넘어가 Task 4 에서야 발견했다 |

envelope 테스트의 결과: 수정 전 실패 70건(건수 아홉 종류는 모두 맞음) → 수정 뒤 0건. 테스트 수는 3,027건 → 3,154건(PR 1), 3,034건(PR 1b). `it.fails` 6건은 그대로다.

**교차 리뷰 (2026-10-05).** Codex `gpt-6-sol`/high, 읽기 전용. 지적마다 수정 전에 실패하는 테스트를 먼저 썼다.

| PR | 회차와 판정 | 고친 것 |
|---|---|---|
| PR 1 (#119) | 1차 REQUEST_CHANGES → 재검증 REQUEST_CHANGES → 두 번째 확인 **APPROVE** | DSC(envelope 헤더 `trace`)를 가린 사본으로 바꾼다. JWT 세 덩어리 최소 길이 10·2·0, Bearer 는 16자 이상. URL·요청 이름을 담는 키는 `/` 없이도 `?`·`#` 뒤를 버린다(`transaction` 포함). envelope 시나리오에 추적을 이어받는 요청을 더했다 |
| PR 1b (#118) | 1차 REQUEST_CHANGES → 재검증 **APPROVE** | OAuth 콜백 프록시의 catch 가 오류 객체(메시지에 `code` 가 든 주소) 대신 오류 이름만 `logError` 에 넘긴다. `logError` 를 mock 하지 않는 테스트를 더했다 |

리뷰 반영 뒤 테스트 수: PR 1 은 3,163건(envelope 테스트 통과, 이어받은 추적 6건), PR 1b 는 3,035건. 자세한 지적은 각 PR 본문과 설계서 §10.6 에 있다.

**PR 1b 의 전제가 틀렸던 것.** 계획과 설계서는 콜백의 `console.log` 줄이 "Vercel 로그로 나간다"고 썼다. 운영 빌드는 `console.log` 를 지우므로 운영에서는 나가지 않는다(설계서 §2.2). PR 1b 의 로그 줄 삭제는 운영의 출력을 바꾸지 않는다. 운영에서 실제로 나가던 것은 웹훅의 `receivedBody` 다.

**머지와 Production 확인 (2026-10-05).** 사용자 승인 뒤 #116 → #118 → #119 순서로 squash 머지했다. Preview 배포가 없어 머지가 곧 Production 배포다. 하나를 배포하고 확인한 뒤 다음으로 넘어갔다.

| PR | 머지 커밋 | Production 에서 확인한 것 |
|---|---|---|
| #116 (문서) | `b98d1f7c` | 배포 성공. 콜백 응답이 머지 전과 같다 |
| #118 (PR 1b) | `9ee8cfc3` | 배포 성공. 콜백 세 라우트를 표식 값으로 부른 12건(GET·POST, `returnTo` 유무와 외부 주소, 값이 없는 경우)의 상태 코드와 `Location` 이 머지 전 기준선과 모두 같다. 2시간 동안 5xx 0건, Sentry 신규 이슈 0건 |
| #119 (PR 1) | `c78c692e` | 배포 성공, main CI 통과. `/api/envelope-test/*` 세 경로는 404(테스트 라우트가 운영 산출물에 없다). 콜백 응답 동일. 새 릴리스 `picnic-web@20261005.1652.001` 의 transaction 에서 아래 전후 차이를 봤다. 배포 뒤 5xx 0건, Sentry 신규 이슈 0건 |

#119 의 전후 차이는 `GET /api/popups` 의 span 으로 봤다(Sentry span 검색).

| span 의 값 | 이전 릴리스 `picnic-web@20261002.0331.001` | 새 릴리스 |
|---|---|---|
| Supabase 호출(`http.client`)의 `url.full`·`http.url` | `…/rest/v1/popup?select=*&deleted_at=is.null&…` (쿼리 전체) | `…/rest/v1/popup` |
| 같은 span 의 `http.query`·`url.query` | 있다 | 없다 |
| 요청(`http.server`)의 `http.target` | `/api/popups` (쿼리 없는 요청) | `/api/popups` — `?cnry_q=…` 를 붙여 보낸 요청 4건 모두 쿼리가 없다 |

확인하지 못한 것: 이벤트의 `request` 블록(헤더·쿠키)은 span 검색에 나오지 않는다. 새 릴리스에는 아직 오류 이벤트가 없어 Sentry MCP 로 이벤트 원문을 열 수 없었고, Sentry 화면은 로그인이 필요해 보지 못했다. 헤더·쿠키·IP 가 실리지 않는다는 근거는 로컬 envelope 테스트(누출 0건)다. 새 릴리스의 서버 오류 이벤트가 생기면 `request` 에 `url`·`method` 만 있는지, breadcrumb 에 `console` 범주가 없는지, `redaction.tripwire` 태그가 붙었는지 본다.

확인 중에 본 이번 변경과 무관한 것: `/sitemap.xml` 이 `ENOENT: scandir '/var/task/app/[lang]'` 을 `error` 로 찍는다(응답은 200). 이전 배포에서도 3일간 44건 나던 기존 문제다.

## Global Constraints

- 머지는 곧 Production 배포다(Preview 없음). **머지는 사용자 승인 뒤에만 한다.**
- 로컬 `next build`·`next start` 는 운영 Sentry 로 보고하지 않게 한다: 일반 빌드는 `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=`, envelope 테스트는 DSN 을 로컬 수집기로 돌린다.
- `npm run build` 뒤에는 `public/sitemap*.xml`·`public/robots.txt` 를 `git checkout -- public/` 로 되돌린다.
- `instrumentation-client.ts` 를 바꾸지 않는다(브라우저는 PR 5).
- 결제 로직을 바꾸지 않는다. 결제 계약 테스트 17건과 `it.fails` 6건은 그대로 통과해야 한다.
- `sentry.server.config.js` 의 기존 `beforeSend` 필터(개발용 오류, API 404)와 `httpIntegration` 옵션을 유지한다. 계약 테스트가 `ignoreIncomingRequests:` 가 8칸 들여쓰기에 있기를 요구한다(`__tests__/sentry-config-contract.test.ts`).
- edge 설정에 `tracesSampleRate`·`tracesSampler`·`sampleRate` 를 넣지 않는다(`__tests__/sentry-edge-config.test.ts`).
- 헤더·쿠키 값을 키 이름으로 골라 지우는 코드를 두지 않는다. 수집을 끄고, 이벤트의 `request` 는 `url`·`method` 만 남긴다.
- DB 스키마·마이그레이션 변경 없음.
- CI(UTC 러너): `npx tsc --noEmit`, `npm run lint`, `npm test` 가 통과해야 한다.
- 커밋은 Conventional Commits. 문서(`docs/`)는 `docs/log-redaction-design` 브랜치(PR #116)에 커밋한다.
- 모든 PR 은 고위험(개인정보·인증·결제)이다. Codex `gpt-6-sol`/high 교차 리뷰를 받는다.

## Review Focus

설계가 함의하지만 놓치기 쉬운 입력과 실패 양상이다. 각 줄의 테스트는 괄호의 작업에 있다.

1. **길이를 믿을 수 없는 입력.** 예외 메시지와 요청 경로는 외부 입력이다. 수십만 자여도 가리기가 선형 시간에 끝나야 한다 — 표본에 잡힌 요청 하나가 서버를 붙잡으면 안 된다. (Task 5: 길이 20만의 입력 아홉 가지)
2. **경로가 없는 쿼리 조각과 fragment.** `?code=…`, `callback?code=…`, `…/cb#access_token=…` 도 지워져야 한다. 반대로 `What is this?`, `a = ?`, `Object.?` 는 그대로여야 한다. (Task 5)
3. **가리기 자체의 실패.** 값을 읽다가 throw 하는 이벤트는 보내지 않고 버린다. `beforeSend` 가 throw 하면 SDK 가 그 오류를 다시 보고해 원본이 새는 길이 된다. (Task 5)
4. **아무것도 받지 못한 실행.** 수집기 포트가 틀리거나 DSN 이 비면 envelope 이 0건이다. 그때 "canary 가 없다"로 통과하면 안 된다. (Task 2: 건수 단언)
5. **tripwire 가 누출을 숨기는 경우.** 토큰 모양 canary 가 새더라도 tripwire 가 먼저 가리면 canary 검색으로는 보이지 않는다. 기대하지 않은 곳의 tripwire 표식을 실패로 본다. (Task 2)
6. **`SENTRY_TRACES_SAMPLE_RATE` 의 범위 밖 값.** `2`, `-1`, `abc`, 빈 값이면 기본 표본율을 유지한다. (Task 3)

## 파일 구조

PR 1 (`fix/sentry-collection-scope`, 워크트리 `../picnic-web-sentry-collection`)

| 파일 | 역할 |
|---|---|
| `scripts/envelope-test/build-switch.js` (신규) | `ENVELOPE_TEST=1` 일 때의 `distDir`, Vercel 빌드 차단, 테스트 라우트의 원본·복사 위치, 라우트 목록에서 테스트 라우트 찾기 |
| `scripts/verify-no-test-routes.js` (신규) | postbuild: 운영 산출물에 테스트 라우트가 없는지 검사 |
| `scripts/envelope-test/analyze.js` (신규) | envelope 파싱, canary 검색, 건수·허용 노출 판정 (순수 함수) |
| `scripts/envelope-test/scenario.js` (신규) | canary 값, 보낼 요청, 기대 건수 |
| `scripts/envelope-test/run.js` (신규) | 빌드, 수집기·`next start` 기동, 요청, 판정, 결과 파일 |
| `scripts/envelope-test/routes/_lib/envtest.ts` (신규) | 테스트 라우트의 공통 코드 |
| `scripts/envelope-test/routes/{handled,throw,edge-throw}/route.ts` (신규) | 테스트 라우트의 원본. 실행기가 테스트 빌드 동안만 `app/api/envelope-test/` 로 복사한다 |
| `lib/sentry/collection.ts` (신규) | 수집 옵션: `REQUEST_DATA_INCLUDE`, `withoutConsole`, `resolveTracesSampleRate` |
| `lib/sentry/scrub.ts` (신규) | `scrubEvent`, `scrubSpan`, `stripUrlQueries`, `redactTokenShapes` |
| `sentry.server.config.js`, `sentry.edge.config.js` (수정) | 수집 축소와 훅 연결 |
| `next.config.js`, `package.json`, `.gitignore` (수정) | 빌드 스위치, `test:envelope`, postbuild, `.next-envtest` |
| `__tests__/scripts/envelope-test-*.test.ts`, `__tests__/lib/sentry/*.test.ts`, `__tests__/sentry-server-config.test.ts`, `__tests__/sentry-edge-config.test.ts` | 단위 테스트 |

PR 1b (`fix/remove-sensitive-log-lines`, 워크트리 `../picnic-web-sensitive-log-lines`)

| 파일 | 역할 |
|---|---|
| `app/api/auth/v1/callback/route.ts`, `app/api/payment/portone/callback/route.ts`, `app/api/payment/toss/result/route.ts` (수정) | URL·쿼리·토큰을 찍는 `console.log` 삭제 |
| `app/api/payment/portone/webhook/route.ts` (수정) | 400 응답의 `receivedBody` 삭제 |
| `__tests__/api/callback-log-redaction.test.ts` (신규), `__tests__/api/payment/portone-webhook-contract.test.ts` (수정) | 테스트 |

## 설계에서 구체화한 것

구현하면서 정해야 했던 것이다. 설계서의 해당 절에도 같은 내용을 적는다(Task 7).

- **URL 규칙의 적용 범위.** 설계 §4.1 은 대상 필드를 나열하되 "목록을 추측으로 닫지 않는다"고 했다. 구현은 이벤트의 **모든 문자열**에 같은 규칙을 건다: 공백으로 나눈 토큰에서 `?`·`#` 앞에 `/` 가 있거나 바로 뒤가 `키=` 모양이면 그 뒤를 버린다. 필드 이름 목록이 없으므로 SDK 가 새 속성을 만들어도 같은 규칙을 탄다. 값 전체가 쿼리인 네 속성(`url.query`·`http.query`·`url.fragment`·`http.fragment`)은 어디에 있든 키째로 지운다.
- **`event.request` 는 `url`·`method` 만 남긴다.** `include` 옵션이 첫 번째 방어선이고 이것이 두 번째다. `include` 옵션의 이름이 바뀌어도 헤더와 쿠키가 실리지 않는다.
- **tripwire 는 예외 메시지도 센다.** JWT 모양과 `Bearer <토큰>` 은 이벤트의 어느 문자열에 있든 고정 문자열로 바꾸고 `redaction.tripwire=1` 을 붙인다. 처리되지 않은 예외의 메시지에서 걸렸다면 Next 가 이미 원본을 Vercel 로그에 찍었다는 뜻이므로 알아야 한다. span 에서 걸리면 span 의 `data` 에 같은 표식을 남기고 `scrubEvent` 가 이벤트 태그로 올린다.
- **예외 메시지는 8,192자에서 자른다.** Sentry 가 메시지에 두는 상한과 같다. 이메일 치환의 실행 시간을 묶는다.
- **가리기가 실패하면 이벤트를 버린다.** span 은 버릴 수 없으므로(`beforeSendSpan` 이 `null` 을 받지 않는다) 설명과 속성을 비운다.
- **표본 강제.** `SENTRY_TRACES_SAMPLE_RATE` 는 SDK 가 edge 에서 스스로 읽는 이름과 같다(`@sentry/vercel-edge` 의 `init`). envelope 테스트에서는 edge 도 표본이 켜지므로 edge 설정에도 `beforeSendTransaction`·`beforeSendSpan` 을 건다.
- **edge 테스트 라우트.** middleware 는 테스트 코드를 넣을 수 없으므로, edge 런타임의 테스트 라우트(`export const runtime = 'edge'`)로 edge SDK 의 이벤트를 받는다.
- **canary 묶음 C.** 테스트 라우트가 `console.warn` 으로 찍는 값이다(운영 빌드는 `console.log` 를 지운다). 서버 출력에는 있어야 하고(캡처가 살아 있다는 증거) envelope 에는 없어야 한다(console breadcrumb 이 사라졌다는 증거).
- **수집기와 가짜 외부 서버의 호스트를 다르게 쓴다.** SDK 는 DSN 의 호스트 문자열이 들어간 주소로 가는 요청에 span 을 만들지 않는다(`isSentryRequestUrl`). DSN 은 `127.0.0.1`, 가짜 외부 서버는 `localhost` 로 부른다.
- **빌드가 고치는 파일을 되돌린다.** `distDir` 이 다르면 Next 가 `next-env.d.ts` 와 `tsconfig.json` 을 고친다. 실행기가 빌드 전 내용을 저장했다가 되돌린다.

---

# Part A — PR 1: 수집 축소 (`fix/sentry-collection-scope`)

### Task 0: 워크트리

- [ ] **Step 1: 워크트리를 만들고 의존성을 설치한다**

```bash
git -C ~/Repositories/picnic-web fetch origin
git -C ~/Repositories/picnic-web worktree add ../picnic-web-sentry-collection -b fix/sentry-collection-scope origin/main
cp ~/Repositories/picnic-web/.env.local ~/Repositories/picnic-web/.env.vercel ~/Repositories/picnic-web-sentry-collection/
cd ~/Repositories/picnic-web-sentry-collection && npm ci --no-audit --no-fund
```

- [ ] **Step 2: 기준선을 확인한다**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 모두 통과. 테스트 수를 적어 둔다(뒤의 비교 기준).

### Task 1: 테스트 전용 빌드 스위치와 운영 산출물 검사

**Files:**
- Create: `scripts/envelope-test/build-switch.js`, `scripts/verify-no-test-routes.js`
- Modify: `next.config.js` (2행 뒤 require, 29행 `const nextConfig = {` 바로 아래), `package.json` (`postbuild`), `.gitignore`
- Test: `__tests__/scripts/envelope-test-build-switch.test.ts`

**Interfaces:**
- Produces: `nextConfigOverrides(env): { distDir?: string }`, `findTestRoutes(appPathRoutes): string[]`, 상수 `TEST_DIST_DIR = '.next-envtest'`, `TEST_ROUTE_PREFIX = '/api/envelope-test'`, `TEST_ROUTE_SOURCE = 'scripts/envelope-test/routes'`, `TEST_ROUTE_TARGET = 'app/api/envelope-test'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

<!-- file: __tests__/scripts/envelope-test-build-switch.test.ts -->
```ts
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const root = process.cwd();
const configPath = path.join(root, 'next.config.js');

type Overrides = { pageExtensions?: string[]; distDir?: string };

const { nextConfigOverrides, findTestRoutes } = require(
  path.join(root, 'scripts/envelope-test/build-switch.js'),
) as {
  nextConfigOverrides: (env: Record<string, string | undefined>) => Overrides;
  findTestRoutes: (appPathRoutes: Record<string, string> | undefined) => string[];
};

function loadNextConfig(): Overrides {
  delete require.cache[require.resolve(configPath)];
  return require(configPath) as Overrides;
}

describe('envelope 테스트 전용 빌드 스위치', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete require.cache[require.resolve(configPath)];
  });

  it.each([undefined, '', '0', 'true'])('ENVELOPE_TEST=%s 이면 설정을 바꾸지 않는다', (value) => {
    expect(nextConfigOverrides({ ENVELOPE_TEST: value })).toEqual({});
  });

  it('ENVELOPE_TEST=1 이면 산출물을 별도 디렉터리에 둔다', () => {
    // pageExtensions 는 건드리지 않는다. 확장자가 두 겹인 edge 라우트는 Next 가 빌드하지 못한다.
    expect(nextConfigOverrides({ ENVELOPE_TEST: '1' })).toEqual({ distDir: '.next-envtest' });
  });

  it('Vercel 빌드에서 ENVELOPE_TEST=1 이면 빌드를 실패시킨다', () => {
    expect(() => nextConfigOverrides({ ENVELOPE_TEST: '1', VERCEL: '1' })).toThrow(/Vercel/);
  });

  it('next.config.js 가 스위치를 그대로 반영한다', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('ENVELOPE_TEST', '');
    const normal = loadNextConfig();
    expect(normal.pageExtensions).toBeUndefined();
    expect(normal.distDir).toBeUndefined();

    vi.stubEnv('ENVELOPE_TEST', '1');
    const testBuild = loadNextConfig();
    expect(testBuild.pageExtensions).toBeUndefined();
    expect(testBuild.distDir).toBe('.next-envtest');
  });
});

describe('운영 산출물의 테스트 라우트 검사', () => {
  it('테스트 라우트가 없으면 빈 목록이다', () => {
    expect(findTestRoutes({ '/api/health/route': '/api/health', '/[lang]/(main)/vote/page': '/[lang]/vote' })).toEqual([]);
    expect(findTestRoutes(undefined)).toEqual([]);
  });

  it('테스트 라우트를 찾아낸다', () => {
    expect(
      findTestRoutes({
        '/api/health/route': '/api/health',
        '/api/envelope-test/throw/route': '/api/envelope-test/throw',
      }),
    ).toEqual(['/api/envelope-test/throw/route → /api/envelope-test/throw']);
  });

  it('postbuild 가 sitemap 생성 전에 검사를 돌린다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postbuild).toBe(
      'node scripts/verify-rendering-modes.js && node scripts/verify-no-test-routes.js && next-sitemap',
    );
  });

  it('테스트 빌드의 산출물 디렉터리를 git 이 추적하지 않는다', () => {
    const ignored = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n');
    expect(ignored).toContain('.next-envtest');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-build-switch.test.ts`
Expected: FAIL — `Cannot find module '…/scripts/envelope-test/build-switch.js'`

- [ ] **Step 3: 구현한다**

<!-- file: scripts/envelope-test/build-switch.js -->
```js
'use strict';

/**
 * envelope 테스트 전용 빌드의 스위치.
 *
 * 테스트용 라우트의 원본은 scripts/envelope-test/routes/ 에 있고 저장소의 app/ 에는 없다. 실행기(run.js)가
 * 테스트 빌드를 만들 때만 app/api/envelope-test/ 로 복사했다가 지운다. 보통 빌드는 git 의 app/ 만 보므로
 * 테스트용 라우트가 들어갈 길이 없다. 런타임 환경변수로는 이미 빌드된 라우트를 뺄 수 없으므로 빌드에서 가른다
 * (docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.7).
 *
 * 확장자로 가르는 방식(pageExtensions 에 envtest.ts 를 더하고 route.envtest.ts 로 두는 것)은 쓰지 않는다.
 * Next 15.5 는 확장자가 두 겹인 edge 라우트에 client reference manifest 를 만들지 않아 빌드가 실패한다
 * (flight-manifest-plugin 은 이름이 정확히 /route 로 끝나는 entry 에만 manifest 를 만든다).
 */

const TEST_DIST_DIR = '.next-envtest';
const TEST_ROUTE_PREFIX = '/api/envelope-test';
/** 테스트용 라우트의 원본. 라우트가 아닌 자리에 둔다. */
const TEST_ROUTE_SOURCE = 'scripts/envelope-test/routes';
/** 테스트 빌드 때 원본을 복사해 넣는 자리. 저장소에는 없어야 한다. */
const TEST_ROUTE_TARGET = 'app/api/envelope-test';

/** next.config.js 에 펼쳐 넣을 설정. 테스트 빌드가 아니면 빈 객체다. */
function nextConfigOverrides(env) {
  if (env.ENVELOPE_TEST !== '1') return {};
  if (env.VERCEL) {
    throw new Error('ENVELOPE_TEST=1 은 로컬 envelope 테스트 전용이다. Vercel 빌드에서는 쓸 수 없다.');
  }
  // 보통 빌드의 산출물(.next)과 섞이지 않게 따로 둔다.
  return { distDir: TEST_DIST_DIR };
}

/** app-path-routes-manifest.json 에서 테스트용 라우트를 찾는다. 비어 있어야 운영 산출물이다. */
function findTestRoutes(appPathRoutes) {
  return Object.entries(appPathRoutes || {})
    .filter(([file, route]) => `${file} ${route}`.includes(TEST_ROUTE_PREFIX))
    .map(([file, route]) => `${file} → ${route}`);
}

module.exports = {
  TEST_DIST_DIR,
  TEST_ROUTE_PREFIX,
  TEST_ROUTE_SOURCE,
  TEST_ROUTE_TARGET,
  nextConfigOverrides,
  findTestRoutes,
};
```

<!-- file: scripts/verify-no-test-routes.js -->
```js
#!/usr/bin/env node
'use strict';

/**
 * 운영 빌드 산출물에 envelope 테스트용 라우트가 없는지 검사한다. `npm run build` 의 postbuild 가 돌린다.
 * 실패하면 빌드(=배포)가 실패한다.
 *
 * 테스트용 라우트는 일부러 오류를 던지고 요청 헤더의 값을 메시지에 넣는다. 운영에 있으면 안 된다.
 * 원본은 scripts/envelope-test/routes/ 에 있고, 실행기가 테스트 빌드 때만 app/api/envelope-test/ 로 복사했다가
 * 지운다. 실행기가 중간에 죽어 복사본이 남은 채로 빌드하면 여기서 걸린다.
 */

const fs = require('fs');
const path = require('path');
const { findTestRoutes } = require('./envelope-test/build-switch');

if (require.main === module) {
  if (process.env.ENVELOPE_TEST === '1') {
    console.error('[test-routes] ENVELOPE_TEST=1 로는 운영 빌드를 만들 수 없다. `npm run test:envelope` 을 쓴다.');
    process.exit(1);
  }

  const manifestPath = path.join(process.cwd(), '.next', 'app-path-routes-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`[test-routes] ${manifestPath} 를 읽을 수 없다: ${error.message}`);
    process.exit(1);
  }

  const found = findTestRoutes(manifest);
  if (found.length > 0) {
    console.error('[test-routes] 운영 빌드에 테스트용 라우트가 들어 있다:');
    for (const route of found) console.error(`  - ${route}`);
    process.exit(1);
  }

  console.log(`[test-routes] 통과: 라우트 ${Object.keys(manifest).length}개 가운데 테스트용 라우트가 없다.`);
}
```

`next.config.js` — 2행(`const { withSentryConfig } = require('@sentry/nextjs');`) 아래에 추가:

```js
const { nextConfigOverrides } = require('./scripts/envelope-test/build-switch');
```

`next.config.js` — `const nextConfig = {` 바로 아래, `reactStrictMode: true,` 위에 추가:

```js
  // envelope 테스트 전용 빌드(ENVELOPE_TEST=1)에서만 산출물을 별도 디렉터리(.next-envtest)에 둔다.
  // 보통 빌드에서는 빈 객체다. Vercel 빌드에서 켜면 throw 한다.
  ...nextConfigOverrides(process.env),
```

`package.json` 의 `postbuild`:

```json
    "postbuild": "node scripts/verify-rendering-modes.js && node scripts/verify-no-test-routes.js && next-sitemap",
```

`.gitignore` 의 첫 줄(`**/.next`) 아래에 추가:

```
.next-envtest
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-build-switch.test.ts __tests__/next-config-redirects.test.ts`
Expected: PASS (새 테스트 11건, 기존 리다이렉트 테스트 전부). **전체 테스트(`npm test`)도 돌린다** — `postbuild` 문자열을 고정하던 기존 테스트(`__tests__/scripts/verify-rendering-modes.test.ts`)가 있어 함께 고쳐야 했다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/envelope-test/build-switch.js scripts/verify-no-test-routes.js next.config.js package.json .gitignore __tests__/scripts/envelope-test-build-switch.test.ts
git commit -m "build: envelope 테스트 전용 빌드 스위치와 운영 산출물 검사를 넣는다"
```

### Task 2: envelope 판정 모듈

**Files:**
- Create: `scripts/envelope-test/analyze.js`
- Test: `__tests__/scripts/envelope-test-analyze.test.ts`

**Interfaces:**
- Produces:
  - `parseEnvelope(body: Buffer | string): { header: object; items: Array<{ type: string; header: object; payload: object }> }`
  - `evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker }): { failures: string[]; counts: Array<{ label: string; expected: string; actual: number }> }`
  - `countsSatisfied(envelopes, expected): boolean`
  - `canaries = { absent: Record<string,string>; stdoutOnly: Record<string,string>; unhandled: Record<string,string> }` — `unhandled.marker` 만 `exception.values[].value` 에 허용된다
  - `expected = { errors: Array<{ label; handled: boolean; runtime?: 'node'|'edge'; transaction?: string; valueIncludes?: string; count: number; requestPath?: boolean; tripwire?: boolean }>; transactions: Array<{ label; name: string; min: number; childOp?: string }> }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

<!-- file: __tests__/scripts/envelope-test-analyze.test.ts -->
```ts
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

type Envelope = { header: Record<string, unknown>; items: Array<{ type: string; header: Record<string, unknown>; payload: Record<string, unknown> }> };
type Result = { failures: string[]; counts: Array<{ label: string; expected: string; actual: number }> };

const require = createRequire(import.meta.url);
const { parseEnvelope, evaluate, countsSatisfied } = require(
  path.join(process.cwd(), 'scripts/envelope-test/analyze.js'),
) as {
  parseEnvelope: (body: Buffer | string) => Envelope;
  evaluate: (input: Record<string, unknown>) => Result;
  countsSatisfied: (envelopes: Envelope[], expected: unknown) => boolean;
};

const canaries = {
  absent: { cookie: 'cnryA-cookie', authorization: 'cnryA-authz' },
  stdoutOnly: { console: 'cnryC-console' },
  unhandled: { marker: 'cnryB-marker', urlQuery: 'cnryB-urlquery' },
};

const expected = {
  errors: [
    { label: 'logError', handled: true, valueIncludes: 'envtest handled', count: 1 },
    { label: '미처리(node)', handled: false, runtime: 'node', valueIncludes: 'envtest unhandled', count: 1, tripwire: true },
  ],
  transactions: [{ label: '밖으로 부르는 요청', name: 'GET /api/envelope-test/handled', min: 1, childOp: 'http.client' }],
};

const stdoutOk = ['envtest console cnryC-console', ' ⨯ Error: envtest unhandled cnryB-marker url=https://envtest.invalid/callback?code=cnryB-urlquery'].join('\n');

const handledEvent = () => ({
  exception: { values: [{ type: 'Error', value: 'envtest handled', mechanism: { type: 'generic', handled: true } }] },
  request: { url: 'http://127.0.0.1:3000/api/envelope-test/handled', method: 'GET' },
});

const unhandledEvent = () => ({
  exception: {
    values: [{ type: 'Error', value: 'envtest unhandled cnryB-marker url=https://envtest.invalid/callback', mechanism: { handled: false } }],
  },
  tags: { 'redaction.tripwire': '1' },
});

const transaction = () => ({
  type: 'transaction',
  transaction: 'GET /api/envelope-test/handled',
  contexts: { trace: { data: { 'http.target': '/api/envelope-test/handled' } } },
  spans: [{ op: 'http.client', description: 'GET http://localhost:9000/probe', data: { 'url.full': 'http://localhost:9000/probe' } }],
});

const envelopeOf = (type: string, payload: Record<string, unknown>): Envelope => ({
  header: { sdk: { name: 'sentry.javascript.nextjs' } },
  items: [{ type, header: { type }, payload }],
});

const clean = (): Envelope[] => [
  envelopeOf('event', handledEvent()),
  envelopeOf('event', unhandledEvent()),
  envelopeOf('transaction', transaction()),
];

const run = (envelopes: Envelope[], stdout = stdoutOk) =>
  evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker: 'envtest unhandled' });

describe('parseEnvelope', () => {
  it('헤더와 항목을 나눈다. length 가 있는 항목과 없는 항목을 모두 읽는다', () => {
    const first = JSON.stringify({ message: 'a' });
    const second = JSON.stringify({ type: 'transaction', transaction: 'GET /x' });
    const body = [
      JSON.stringify({ event_id: 'e1', dsn: 'http://k@127.0.0.1:1/1' }),
      JSON.stringify({ type: 'event', length: Buffer.byteLength(first) }),
      first,
      JSON.stringify({ type: 'transaction' }),
      second,
      '',
    ].join('\n');

    const envelope = parseEnvelope(Buffer.from(body));

    expect(envelope.header).toMatchObject({ event_id: 'e1' });
    expect(envelope.items.map((item) => item.type)).toEqual(['event', 'transaction']);
    expect(envelope.items[0].payload).toEqual({ message: 'a' });
    expect(envelope.items[1].payload).toEqual({ type: 'transaction', transaction: 'GET /x' });
  });

  it('JSON 이 아닌 본문은 원문을 남겨 canary 검색이 닿게 한다', () => {
    const body = ['{}', JSON.stringify({ type: 'attachment' }), 'raw cnryA-cookie text', ''].join('\n');
    expect(parseEnvelope(body).items[0].payload).toEqual({ __unparsed: 'raw cnryA-cookie text' });
  });
});

describe('evaluate', () => {
  it('깨끗한 실행은 실패가 없다', () => {
    const result = run(clean());
    expect(result.failures).toEqual([]);
    expect(result.counts.map((count) => count.actual)).toEqual([1, 1, 1]);
    expect(countsSatisfied(clean(), expected)).toBe(true);
  });

  it('아무것도 받지 못하면 건수 단언에서 실패한다', () => {
    const result = run([]);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        '수신 건수 — logError: 기대 1건, 실제 0건',
        '수신 건수 — 미처리(node): 기대 1건, 실제 0건',
        '수신 건수 — 밖으로 부르는 요청: 기대 1건 이상, 실제 0건',
        '허용 노출 확인 실패 — marker 가 exception.values[].value 에 없다',
      ]),
    );
    expect(countsSatisfied([], expected)).toBe(false);
  });

  it('요청 헤더에 실린 canary 를 경로와 함께 보고한다', () => {
    const envelopes = clean();
    envelopes[0].items[0].payload.request = { headers: { authorization: 'Bearer cnryA-authz' }, cookies: { sb: 'cnryA-cookie' } };
    expect(run(envelopes).failures).toEqual(
      expect.arrayContaining([
        '누출(envelope) — authorization: event request.headers.authorization ×1',
        '누출(envelope) — cookie: event request.cookies.sb ×1',
      ]),
    );
  });

  it('envelope 헤더와 항목 헤더도 검색한다', () => {
    const envelopes = clean();
    envelopes[2].header.trace = { transaction: 'GET /x?c=cnryA-cookie' };
    expect(run(envelopes).failures).toContain('누출(envelope) — cookie: envelope envelope_header.trace.transaction ×1');
  });

  it('자식 span 의 쿼리 속성을 찾는다', () => {
    const envelopes = clean();
    (envelopes[2].items[0].payload.spans as Array<{ data: Record<string, string> }>)[0].data['url.query'] = '?token=cnryA-authz';
    expect(run(envelopes).failures).toContain('누출(envelope) — authorization: transaction spans[].data.url.query ×1');
  });

  it('묶음 A 가 표준 출력에 있으면 실패한다', () => {
    expect(run(clean(), `${stdoutOk}\n[Callback] Full URL: /cb?code=cnryA-cookie`).failures).toContain('누출(표준 출력) — cookie');
  });

  it('console canary 가 envelope 에 있으면 실패하고, 표준 출력에 없어도 실패한다', () => {
    const envelopes = clean();
    envelopes[0].items[0].payload.breadcrumbs = [{ category: 'console', message: 'envtest console cnryC-console' }];
    expect(run(envelopes).failures).toContain('누출(envelope) — console: event breadcrumbs[].message ×1');
    expect(run(clean(), ' ⨯ Error: envtest unhandled cnryB-marker').failures).toContain(
      '표준 출력 캡처 확인 실패 — console 이 표준 출력에 없다',
    );
  });

  it('marker 는 exception.values[].value 에서만 허용한다', () => {
    const envelopes = clean();
    envelopes[1].items[0].payload.request = { headers: { 'x-envtest-marker': 'cnryB-marker' } };
    expect(run(envelopes).failures).toContain('누출(envelope) — marker: event request.headers.x-envtest-marker ×1');
  });

  it('묶음 B 의 나머지 값은 예외 메시지에서도 허용하지 않는다', () => {
    const envelopes = clean();
    const values = (envelopes[1].items[0].payload.exception as { values: Array<{ value: string }> }).values;
    values[0].value += '?code=cnryB-urlquery';
    expect(run(envelopes).failures).toContain('누출(envelope) — urlQuery: event exception.values[].value ×1');
  });

  it('묶음 B 가 Next 의 미처리 오류 줄이 아닌 곳에 찍히면 실패한다', () => {
    expect(run(clean(), `${stdoutOk}\n[Callback] cnryB-urlquery`).failures).toContain(
      '누출(표준 출력) — urlQuery: Next 의 미처리 오류 줄이 아닌 곳에 1줄',
    );
  });

  it('request_path 는 있으면 쿼리가 없어야 한다 (라우트 핸들러의 오류에는 이 값이 없다)', () => {
    const withoutQuery = clean();
    withoutQuery[1].items[0].payload.contexts = { nextjs: { request_path: '/api/envelope-test/throw' } };
    expect(run(withoutQuery).failures).toEqual([]);

    const withQuery = clean();
    withQuery[0].items[0].payload.contexts = { nextjs: { request_path: '/ko/vote?next=/mypage' } };
    expect(run(withQuery).failures).toContain('contexts.nextjs.request_path 에 쿼리가 남아 있다');
  });

  it('기대한 이벤트에 tripwire 태그가 없으면 실패한다', () => {
    const envelopes = clean();
    delete envelopes[1].items[0].payload.tags;
    expect(run(envelopes).failures).toContain('미처리(node): redaction.tripwire 태그가 없다');
  });

  it('기대하지 않은 곳의 tripwire 표식은 실패다 — 가려진 누출이다', () => {
    const envelopes = clean();
    envelopes[2].items[0].payload.tags = { 'redaction.tripwire': '1' };
    expect(run(envelopes).failures).toContain('예상하지 않은 tripwire — redaction.tripwire: transaction tags.redaction.tripwire(key) ×1');
  });

  it('stack frame 에 지역 변수가 실리면 실패한다', () => {
    const envelopes = clean();
    const values = (envelopes[1].items[0].payload.exception as { values: Array<Record<string, unknown>> }).values;
    values[0].stacktrace = { frames: [{ filename: 'route.js', vars: { token: 'x' } }] };
    expect(run(envelopes).failures).toContain('미처리(node): stack frame 에 vars 가 실렸다');
  });

  it('자식 span 이 없는 transaction 만 받으면 실패한다', () => {
    const envelopes = clean();
    envelopes[2].items[0].payload.spans = [];
    expect(run(envelopes).failures).toContain(
      '수신 건수 — 밖으로 부르는 요청: 자식 span(http.client)이 있는 transaction 이 0건이다',
    );
  });

  it('edge 이벤트는 runtime 태그로 가른다', () => {
    const edge = unhandledEvent();
    edge.tags = { 'redaction.tripwire': '1', runtime: 'edge' } as never;
    const result = run([envelopeOf('event', handledEvent()), envelopeOf('event', edge), envelopeOf('transaction', transaction())]);
    expect(result.failures).toContain('수신 건수 — 미처리(node): 기대 1건, 실제 0건');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-analyze.test.ts`
Expected: FAIL — `Cannot find module '…/scripts/envelope-test/analyze.js'`

- [ ] **Step 3: 구현한다**

<!-- file: scripts/envelope-test/analyze.js -->
```js
'use strict';

/**
 * envelope 테스트의 판정 로직. 순수 함수만 둔다 — 단위 테스트(__tests__/scripts/envelope-test-analyze.test.ts)가
 * CI 에서 돈다. 실행기(run.js)는 실제 Next 서버가 보낸 envelope 과 서버 표준 출력을 모아 evaluate() 에 넘긴다.
 *
 * 판정 순서 (설계 §5.1):
 *   1. 수신 건수 — 아무것도 받지 못한 실행이 통과하는 일을 막는다.
 *   2. 무누출 — 묶음 A 는 envelope 과 표준 출력 어디에도 없다. 묶음 C 는 표준 출력에만 있다.
 *   3. 허용 노출 — 묶음 B 의 marker 는 exception.values[].value 와 Next 의 미처리 오류 줄에만 있다.
 *   4. tripwire 표식은 기대한 이벤트에만 있다. 다른 곳에 있으면 토큰 모양 값이 새다가 가려진 것이다.
 */

const TRIPWIRE_KEY = 'redaction.tripwire';
const UNHANDLED_VALUE_PATH = /^exception\.values\[\d+\]\.value$/;

/** Sentry envelope 한 건(압축을 푼 본문)을 헤더와 항목으로 나눈다. */
function parseEnvelope(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  let offset = 0;

  const readLine = () => {
    let end = buffer.indexOf(0x0a, offset);
    if (end === -1) end = buffer.length;
    const line = buffer.subarray(offset, end).toString('utf8');
    offset = end + 1;
    return line;
  };
  // JSON 이 아니면 원문을 남긴다. canary 검색이 닿아야 한다.
  const parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return { __unparsed: text };
    }
  };

  const header = parseJson(readLine());
  const items = [];
  while (offset < buffer.length) {
    const headerLine = readLine();
    if (headerLine === '') continue;
    const itemHeader = parseJson(headerLine);
    let payloadText;
    if (typeof itemHeader.length === 'number') {
      payloadText = buffer.subarray(offset, offset + itemHeader.length).toString('utf8');
      offset += itemHeader.length + 1;
    } else {
      payloadText = readLine();
    }
    items.push({ type: itemHeader.type, header: itemHeader, payload: parseJson(payloadText) });
  }
  return { header, items };
}

/** 값 안의 모든 문자열을 경로와 함께 모은다. 객체의 키도 문자열로 본다(쿠키 이름처럼 값이 키로 실릴 수 있다). */
function collectStrings(value, path, out) {
  if (typeof value === 'string') {
    out.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      out.push({ path: `${childPath}(key)`, value: key });
      collectStrings(child, childPath, out);
    }
  }
  return out;
}

function flatten(envelopes) {
  const records = [];
  for (const envelope of envelopes) {
    for (const hit of collectStrings(envelope.header, 'envelope_header', [])) {
      records.push({ type: 'envelope', payload: null, ...hit });
    }
    for (const item of envelope.items) {
      for (const hit of collectStrings(item.header, 'item_header', [])) {
        records.push({ type: item.type, payload: item.payload, ...hit });
      }
      for (const hit of collectStrings(item.payload, '', [])) {
        records.push({ type: item.type, payload: item.payload, ...hit });
      }
    }
  }
  return records;
}

/** 같은 위치의 적중을 묶어 "종류 경로 ×건수" 로 줄인다. 배열 색인은 지운다. */
function summarize(hits) {
  const grouped = new Map();
  for (const hit of hits) {
    const key = `${hit.type} ${hit.path.replace(/\[\d+\]/g, '[]')}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }
  return [...grouped.entries()].map(([key, count]) => `${key} ×${count}`);
}

const payloadsOf = (envelopes, type) =>
  envelopes.flatMap((envelope) => envelope.items).filter((item) => item.type === type).map((item) => item.payload);

const exceptionValues = (event) =>
  event && event.exception && Array.isArray(event.exception.values) ? event.exception.values : [];

const isHandled = (event) => exceptionValues(event).every((value) => !value.mechanism || value.mechanism.handled !== false);

// edge 설정은 initialScope 로 runtime=edge 태그를 붙인다(sentry.edge.config.js).
const runtimeOf = (event) => (event.tags && event.tags.runtime === 'edge' ? 'edge' : 'node');

const hasFrameVars = (event) =>
  exceptionValues(event).some((value) =>
    ((value.stacktrace && value.stacktrace.frames) || []).some((frame) => frame && frame.vars !== undefined),
  );

function matchesError(event, rule) {
  if (exceptionValues(event).length === 0) return false;
  if (isHandled(event) !== rule.handled) return false;
  if (rule.runtime && runtimeOf(event) !== rule.runtime) return false;
  if (rule.transaction && event.transaction !== rule.transaction) return false;
  if (
    rule.valueIncludes &&
    !exceptionValues(event).some((value) => typeof value.value === 'string' && value.value.includes(rule.valueIncludes))
  ) {
    return false;
  }
  return true;
}

const transactionsNamed = (envelopes, name) =>
  payloadsOf(envelopes, 'transaction').filter((transaction) => transaction.transaction === name);

const withChildOp = (transactions, op) =>
  transactions.filter((transaction) => (transaction.spans || []).some((span) => span && span.op === op));

/** 기대한 건수가 다 왔는가. 실행기가 기다림을 끝낼 때 쓴다. */
function countsSatisfied(envelopes, expected) {
  const errors = payloadsOf(envelopes, 'event');
  return (
    expected.errors.every((rule) => errors.filter((event) => matchesError(event, rule)).length >= rule.count) &&
    expected.transactions.every((rule) => {
      const matched = transactionsNamed(envelopes, rule.name);
      return (rule.childOp ? withChildOp(matched, rule.childOp) : matched).length >= rule.min;
    })
  );
}

function evaluate({ envelopes, stdout, canaries, expected, unhandledLineMarker }) {
  const failures = [];
  const counts = [];
  const errors = payloadsOf(envelopes, 'event');
  const tripwireAllowed = new Set();

  // 1. 수신 건수
  for (const rule of expected.errors) {
    const matched = errors.filter((event) => matchesError(event, rule));
    counts.push({ label: rule.label, expected: `${rule.count}`, actual: matched.length });
    if (matched.length !== rule.count) {
      failures.push(`수신 건수 — ${rule.label}: 기대 ${rule.count}건, 실제 ${matched.length}건`);
    }
    for (const event of matched) {
      if (rule.tripwire) {
        tripwireAllowed.add(event);
        if (!event.tags || event.tags[TRIPWIRE_KEY] !== '1') {
          failures.push(`${rule.label}: ${TRIPWIRE_KEY} 태그가 없다`);
        }
      }
      if (hasFrameVars(event)) failures.push(`${rule.label}: stack frame 에 vars 가 실렸다`);
    }
  }
  for (const rule of expected.transactions) {
    const matched = transactionsNamed(envelopes, rule.name);
    counts.push({ label: rule.label, expected: `${rule.min} 이상`, actual: matched.length });
    if (matched.length < rule.min) {
      failures.push(`수신 건수 — ${rule.label}: 기대 ${rule.min}건 이상, 실제 ${matched.length}건`);
    } else if (rule.childOp) {
      const withChild = withChildOp(matched, rule.childOp).length;
      if (withChild < rule.min) {
        failures.push(`수신 건수 — ${rule.label}: 자식 span(${rule.childOp})이 있는 transaction 이 ${withChild}건이다`);
      }
    }
  }

  // onRequestError 까지 올라간 오류에는 contexts.nextjs.request_path 가 붙는다(Next 가 req.url 을 그대로 넘긴다).
  // 라우트 핸들러의 오류는 SDK 의 래퍼가 먼저 잡아 이 값이 없다. 있으면 쿼리가 없어야 한다.
  for (const event of errors) {
    const requestPath = event.contexts && event.contexts.nextjs && event.contexts.nextjs.request_path;
    if (typeof requestPath === 'string' && /[?#]/.test(requestPath)) {
      failures.push('contexts.nextjs.request_path 에 쿼리가 남아 있다');
    }
  }

  const records = flatten(envelopes);
  const stdoutLines = stdout.split('\n');
  const reportLeak = (name, hits) => {
    for (const where of summarize(hits)) failures.push(`누출(envelope) — ${name}: ${where}`);
  };

  // 2. 무누출
  for (const [name, value] of Object.entries(canaries.absent)) {
    reportLeak(name, records.filter((record) => record.value.includes(value)));
    if (stdout.includes(value)) failures.push(`누출(표준 출력) — ${name}`);
  }
  for (const [name, value] of Object.entries(canaries.stdoutOnly)) {
    reportLeak(name, records.filter((record) => record.value.includes(value)));
    if (!stdout.includes(value)) failures.push(`표준 출력 캡처 확인 실패 — ${name} 이 표준 출력에 없다`);
  }

  // 3. 허용 노출
  for (const [name, value] of Object.entries(canaries.unhandled)) {
    const hits = records.filter((record) => record.value.includes(value));
    const allowed = name === 'marker' ? hits.filter((hit) => UNHANDLED_VALUE_PATH.test(hit.path)) : [];
    reportLeak(name, hits.filter((hit) => !allowed.includes(hit)));
    if (name === 'marker' && allowed.length === 0) {
      failures.push('허용 노출 확인 실패 — marker 가 exception.values[].value 에 없다');
    }
    const stray = stdoutLines.filter((line) => line.includes(value) && !line.includes(unhandledLineMarker));
    if (stray.length > 0) {
      failures.push(`누출(표준 출력) — ${name}: Next 의 미처리 오류 줄이 아닌 곳에 ${stray.length}줄`);
    }
  }

  // 4. tripwire 표식
  const strayTripwire = records.filter(
    (record) => record.value.includes(TRIPWIRE_KEY) && !tripwireAllowed.has(record.payload),
  );
  for (const where of summarize(strayTripwire)) failures.push(`예상하지 않은 tripwire — ${TRIPWIRE_KEY}: ${where}`);

  return { failures: [...new Set(failures)], counts };
}

module.exports = { parseEnvelope, evaluate, countsSatisfied, TRIPWIRE_KEY };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-analyze.test.ts`
Expected: PASS (18건)

- [ ] **Step 5: 커밋**

```bash
git add scripts/envelope-test/analyze.js __tests__/scripts/envelope-test-analyze.test.ts
git commit -m "test(sentry): envelope 테스트의 판정 로직을 넣는다"
```

### Task 3: 수집 옵션 모듈과 표본 강제

envelope 테스트가 transaction 을 확실히 받으려면 표본을 강제해야 한다. 수정 전 상태에서 누출을 먼저 보려고(Task 4 의 red) 이 연결만 먼저 넣는다. 수집 축소는 Task 6 이다.

**Files:**
- Create: `lib/sentry/collection.ts`
- Modify: `sentry.server.config.js` (5행 import, 21행 `tracesSampleRate`)
- Test: `__tests__/lib/sentry/collection.test.ts`, `__tests__/sentry-server-config.test.ts`

**Interfaces:**
- Produces:
  - `REQUEST_DATA_INCLUDE: { cookies: false; headers: false; query_string: false; data: false; url: true; ip: false }`
  - `withoutConsole<T extends { name: string }>(integrations: T[]): T[]`
  - `resolveTracesSampleRate(raw: string | undefined, fallback: number): number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

<!-- file: __tests__/lib/sentry/collection.test.ts -->
```ts
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { REQUEST_DATA_INCLUDE, resolveTracesSampleRate, withoutConsole } from '@/lib/sentry/collection';

// SDK 의 하위 패키지는 @sentry/nextjs 가 쓰는 것과 같은 것을 읽는다(호이스팅에 기대지 않는다).
const requireFromSdk = createRequire(createRequire(import.meta.url).resolve('@sentry/nextjs'));

type Integration = {
  name: string;
  isDefaultInstance?: boolean;
  processEvent?: (event: Record<string, unknown>, hint: unknown, client: unknown) => Record<string, unknown>;
};

describe('resolveTracesSampleRate', () => {
  it.each([
    [undefined, 0.1],
    ['', 0.1],
    ['   ', 0.1],
    ['abc', 0.1],
    ['2', 0.1],
    ['-1', 0.1],
    ['NaN', 0.1],
    ['Infinity', 0.1],
    ['0', 0],
    ['1', 1],
    ['0.25', 0.25],
  ])('%j → %d', (raw, expected) => {
    expect(resolveTracesSampleRate(raw, 0.1)).toBe(expected);
  });
});

describe('withoutConsole', () => {
  it('Console 만 뺀다', () => {
    expect(withoutConsole([{ name: 'Dedupe' }, { name: 'Console' }, { name: 'Http' }])).toEqual([
      { name: 'Dedupe' },
      { name: 'Http' },
    ]);
  });
});

describe('실제 SDK 와의 계약', () => {
  const core = requireFromSdk('@sentry/core') as {
    requestDataIntegration: (options: unknown) => Integration;
    getIntegrationsToSetup: (options: unknown) => Integration[];
  };

  it('REQUEST_DATA_INCLUDE 로 만든 integration 은 url 과 method 만 붙인다', () => {
    const integration = core.requestDataIntegration({ include: REQUEST_DATA_INCLUDE });
    const event: Record<string, unknown> = {
      sdkProcessingMetadata: {
        ipAddress: '203.0.113.9',
        normalizedRequest: {
          url: 'http://localhost/ko/vote?code=SECRET',
          method: 'GET',
          query_string: 'code=SECRET',
          headers: { cookie: 'sb=SECRET', authorization: 'Bearer SECRET', 'x-forwarded-for': '203.0.113.9' },
          cookies: { sb: 'SECRET' },
          data: '{"email":"a@b.co"}',
        },
      },
    };

    integration.processEvent?.(event, {}, { getOptions: () => ({ sendDefaultPii: true }) });

    // url 의 쿼리는 scrubEvent 가 뗀다(lib/sentry/scrub.ts).
    expect(event.request).toEqual({ url: 'http://localhost/ko/vote?code=SECRET', method: 'GET' });
    expect(event.user).toBeUndefined();
  });

  it('node 의 기본 목록에 Console·Http·RequestData 가 있고, 함수 형태의 integrations 가 그것을 바꾼다', () => {
    const node = requireFromSdk('@sentry/node') as { getDefaultIntegrations: (options: unknown) => Integration[] };
    const defaults = node.getDefaultIntegrations({});
    expect(defaults.map((integration) => integration.name)).toEqual(
      expect.arrayContaining(['Console', 'Http', 'RequestData']),
    );

    const userHttp: Integration = { name: 'Http' };
    const userRequestData = core.requestDataIntegration({ include: REQUEST_DATA_INCLUDE });
    const resolved = core.getIntegrationsToSetup({
      defaultIntegrations: defaults,
      integrations: (all: Integration[]) => [...withoutConsole(all), userHttp, userRequestData],
    });

    expect(resolved.map((integration) => integration.name)).not.toContain('Console');
    expect(resolved.filter((integration) => integration.name === 'Http')).toEqual([userHttp]);
    expect(resolved.filter((integration) => integration.name === 'RequestData')).toEqual([userRequestData]);
  });

  it('edge 의 기본 목록에는 Console 이 있고 RequestData 가 없다', () => {
    const edge = requireFromSdk('@sentry/vercel-edge') as {
      getDefaultIntegrations: (options: unknown) => Integration[];
    };
    const names = edge.getDefaultIntegrations({}).map((integration) => integration.name);
    expect(names).toContain('Console');
    expect(names).not.toContain('RequestData');
    expect(withoutConsole(edge.getDefaultIntegrations({})).map((integration) => integration.name)).not.toContain('Console');
  });
});
```

<!-- file: __tests__/sentry-server-config.test.ts -->
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Integration = { name: string; options?: Record<string, unknown> };

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  httpIntegration: vi.fn((options: Record<string, unknown>) => ({ name: 'Http', options })),
  requestDataIntegration: vi.fn((options: Record<string, unknown>) => ({ name: 'RequestData', options })),
}));

vi.mock('@sentry/nextjs', () => sentry);

type ServerOptions = {
  tracesSampleRate: number;
  integrations: Integration[] | ((defaults: Integration[]) => Integration[]);
  beforeSend: (event: Record<string, unknown>) => unknown;
  beforeSendTransaction?: (event: Record<string, unknown>) => unknown;
  beforeSendSpan?: (span: Record<string, unknown>) => unknown;
};

async function loadOptions(): Promise<ServerOptions> {
  await import('@/sentry.server.config.js');
  expect(sentry.init).toHaveBeenCalledOnce();
  return sentry.init.mock.calls[0]?.[0] as ServerOptions;
}

describe('Sentry 서버 초기화', () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.init.mockClear();
    sentry.httpIntegration.mockClear();
    sentry.requestDataIntegration.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('표본율', () => {
    it.each([
      ['', 0.1],
      ['1', 1],
      ['0', 0],
      ['0.25', 0.25],
      ['2', 0.1],
      ['-1', 0.1],
      ['abc', 0.1],
    ])('SENTRY_TRACES_SAMPLE_RATE=%j 이면 %d 다', async (raw, expected) => {
      vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', raw);
      expect((await loadOptions()).tracesSampleRate).toBe(expected);
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/lib/sentry/collection.test.ts __tests__/sentry-server-config.test.ts`
Expected: FAIL — `collection.test.ts` 는 모듈이 없어서, `sentry-server-config.test.ts` 는 `'1'`·`'0'`·`'0.25'` 사례가 `expected 0.1 to be 1` 등으로 실패

- [ ] **Step 3: 구현한다**

<!-- file: lib/sentry/collection.ts -->
```ts
/**
 * Sentry SDK 가 스스로 붙이는 데이터의 범위. 서버·edge 설정이 함께 쓴다.
 * 설계: docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.1
 */

/**
 * requestDataIntegration 이 이벤트의 request 에 붙일 것. 기본값은 쿠키·헤더·쿼리·본문을 모두 붙인다
 * (sendDefaultPii 와 무관하다). url 만 남기고, 그 쿼리는 scrubEvent 가 뗀다.
 */
export const REQUEST_DATA_INCLUDE = Object.freeze({
  cookies: false,
  headers: false,
  query_string: false,
  data: false,
  url: true,
  ip: false,
});

/** 기본 integration 에서 Console 을 뺀다. 서버의 console 출력은 Vercel 로그에 이미 있다. */
export function withoutConsole<T extends { name: string }>(integrations: T[]): T[] {
  return integrations.filter((integration) => integration.name !== 'Console');
}

/**
 * 환경변수로 받은 표본율. 0 과 1 사이의 수만 받고, 그 밖의 값이면 기본값을 쓴다.
 * envelope 테스트(scripts/envelope-test/run.js)가 표본을 강제할 때 쓴다. 운영 환경변수에는 두지 않는다.
 */
export function resolveTracesSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback;
}
```

`sentry.server.config.js` — 5행 아래에 import 추가:

```js
import { resolveTracesSampleRate } from './lib/sentry/collection';
```

`sentry.server.config.js` — 21행의 `tracesSampleRate` 를 바꾼다:

```js
    // Sample rate for performance monitoring.
    // SENTRY_TRACES_SAMPLE_RATE 는 envelope 테스트가 표본을 강제할 때만 쓴다(0~1 밖의 값은 무시한다).
    tracesSampleRate: resolveTracesSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE,
      process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    ),
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/lib/sentry/collection.test.ts __tests__/sentry-server-config.test.ts __tests__/sentry-config-contract.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/sentry/collection.ts sentry.server.config.js __tests__/lib/sentry/collection.test.ts __tests__/sentry-server-config.test.ts
git commit -m "feat(sentry): 수집 옵션 모듈을 만들고 서버 표본율을 환경변수로 강제할 수 있게 한다"
```

### Task 4: 테스트 라우트, 시나리오, 실행기 — 수정 전의 누출을 먼저 본다

**Files:**
- Create: `scripts/envelope-test/routes/_lib/envtest.ts`, `scripts/envelope-test/routes/handled/route.ts`, `scripts/envelope-test/routes/throw/route.ts`, `scripts/envelope-test/routes/edge-throw/route.ts`, `scripts/envelope-test/scenario.js`, `scripts/envelope-test/run.js`
- Modify: `package.json` (`test:envelope`)
- Test: `__tests__/scripts/envelope-test-routes.test.ts`

**Interfaces:**
- Consumes: `parseEnvelope`, `evaluate`, `countsSatisfied` (Task 2), `TEST_DIST_DIR` (Task 1)
- Produces: `npm run test:envelope` (종료 코드 0 = 통과), 결과 파일 `.next-envtest/envelope-test/{envelopes.jsonl,stdout.log,report.json}`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

<!-- file: __tests__/scripts/envelope-test-routes.test.ts -->
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
});

describe('envelope 테스트 시나리오', () => {
  const { CANARIES, EXPECTED, REPEAT, buildRequests } = require(
    path.join(root, 'scripts/envelope-test/scenario.js'),
  ) as {
    CANARIES: Record<'absent' | 'stdoutOnly' | 'unhandled', Record<string, string>>;
    EXPECTED: { errors: Array<{ count: number }>; transactions: Array<{ min: number }> };
    REPEAT: number;
    buildRequests: (base: string) => Array<{ label: string; url: string; init: { headers: Record<string, string>; body?: string } }>;
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
    expect(labels).toEqual(['page', 'webhook', 'handled', 'throw', 'edge-throw']);
    for (const label of labels) {
      expect(requests.filter((request) => request.label === label)).toHaveLength(REPEAT);
    }
    for (const rule of EXPECTED.errors) expect(rule.count).toBe(REPEAT);
    for (const rule of EXPECTED.transactions) expect(rule.min).toBe(REPEAT);
  });

  it('package.json 에 실행 스크립트가 있다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:envelope']).toBe('node scripts/envelope-test/run.js');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-routes.test.ts`
Expected: FAIL — `ENOENT … scripts/envelope-test/routes`

- [ ] **Step 3: 테스트 라우트와 시나리오를 쓴다**

<!-- file: scripts/envelope-test/routes/_lib/envtest.ts -->
```ts
/**
 * envelope 테스트용 라우트의 공통 코드. 이 디렉터리는 라우트가 아니다 — 실행기(scripts/envelope-test/run.js)가
 * 테스트 빌드를 만들 때만 app/api/envelope-test/ 로 복사했다가 지운다(scripts/envelope-test/build-switch.js).
 * 여기에는 비밀처럼 보이는 값을 두지 않는다 — 실행기가 요청 헤더로 넘긴다.
 */

/** 보통 빌드에는 들어가지 않지만, 잘못 들어간 경우에 대비한 두 번째 문이다. */
export function envelopeTestDisabled(): Response | null {
  return process.env.ENVELOPE_TEST === '1' ? null : new Response(null, { status: 404 });
}

/**
 * 서버 출력에만 남아야 하는 줄. console breadcrumb 으로 Sentry 에 실리면 안 된다.
 * console.warn 으로 찍는다 — 운영 빌드는 compiler.removeConsole 로 console.log 를 지운다(error·warn 만 남는다).
 */
export function logConsoleCanary(headers: Headers): void {
  console.warn(`envtest console ${headers.get('x-envtest-console') ?? 'none'}`);
}

/** 처리되지 않은 예외의 메시지. URL 쿼리, JWT 모양, Bearer 토큰, 이메일을 섞는다. */
export function unhandledMessage(headers: Headers): string {
  const value = (name: string) => headers.get(`x-envtest-${name}`) ?? 'none';
  return [
    `envtest unhandled ${value('marker')}`,
    `url=https://envtest.invalid/callback?code=${value('url-query')}`,
    `jwt=${value('jwt')}`,
    `auth=Bearer ${value('bearer')}`,
    `email=${value('email')}`,
  ].join(' ');
}
```

<!-- file: scripts/envelope-test/routes/handled/route.ts -->
```ts
import { logError } from '@/utils/log-error';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 서버가 밖으로 요청을 보낸 뒤(자식 span, http breadcrumb) logError 로 오류를 남긴다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const token = request.headers.get('x-envtest-upstream-token') ?? 'none';
  const upstream = await fetch(`${process.env.ENVELOPE_TEST_UPSTREAM}/probe?token=${token}&select=id`, {
    cache: 'no-store',
  });
  logError('envtest handled', new Error(`envtest handled upstream ${upstream.status}`));

  return Response.json({ ok: true });
}
```

<!-- file: scripts/envelope-test/routes/throw/route.ts -->
```ts
import { envelopeTestDisabled, logConsoleCanary, unhandledMessage } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 경계 함수로 감싸지 않은 라우트. 오류가 Next 의 onRequestError 까지 올라간다.
export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw new Error(unhandledMessage(request.headers));
}
```

<!-- file: scripts/envelope-test/routes/edge-throw/route.ts -->
```ts
import { envelopeTestDisabled, logConsoleCanary, unhandledMessage } from '../_lib/envtest';

// middleware 와 같은 edge SDK(sentry.edge.config.js)를 탄다. middleware 에는 테스트 코드를 넣을 수 없다.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  throw new Error(unhandledMessage(request.headers));
}
```

<!-- file: scripts/envelope-test/scenario.js -->
```js
'use strict';

/**
 * envelope 테스트가 보내는 요청과 기대값. 값은 전부 가짜다.
 *
 * canary 는 세 묶음이다 (설계 §5.1).
 *   absent     — envelope 과 서버 표준 출력 어디에도 없어야 한다.
 *   stdoutOnly — 테스트 라우트가 console.warn 으로 찍는다. 서버 출력에만 있어야 한다.
 *   unhandled  — 감싸지 않은 예외. marker 만 exception.values[].value 와 Next 의 미처리 오류 줄에 남는다.
 */

const REPEAT = 3;
const UNHANDLED_LINE_MARKER = 'envtest unhandled';

const CANARIES = {
  absent: {
    cookie: 'cnryA-cookie-7f3a9b1c2d',
    authorization: 'cnryA1authz8d2e4f6a0b9c7d5e3f',
    signature: 'cnryA-signature-5e6f7a8b9c',
    forwardedFor: '203.0.113.77',
    pageQuery: 'cnryA-pagequery-c3d4e5f6a7',
    webhookQuery: 'cnryA-webhookquery-b8c9d0e1f2',
    webhookPaymentId: 'cnryA-paymentid-1a2b3c4d5e',
    webhookEmail: 'cnrya-webhook@envtest.invalid',
    handledQuery: 'cnryA-handledquery-6f7a8b9c0d',
    upstreamToken: 'cnryA-upstreamtoken-9e8d7c6b5a',
  },
  stdoutOnly: {
    console: 'cnryC-console-0f1e2d3c4b',
  },
  unhandled: {
    marker: 'cnryB-marker-4b5a69788796',
    requestQuery: 'cnryB-requestquery-a5b4c3d2e1',
    urlQuery: 'cnryB-urlquery-f0e1d2c3b4',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjbnJ5Qi1qd3QifQ.Y25yeUItand0LXNpZ25hdHVyZQ',
    bearer: 'cnryB7bearer3c5e7a9b1d3f5a7c',
    email: 'cnryb-message@envtest.invalid',
  },
};

const EXPECTED = {
  errors: [
    { label: '웹훅 서명 실패(logError)', handled: true, transaction: 'POST /api/payment/portone/webhook', count: REPEAT },
    { label: '테스트 라우트의 logError', handled: true, valueIncludes: 'envtest handled', count: REPEAT },
    // 라우트 핸들러의 오류는 SDK 의 라우트 래퍼가 먼저 잡는다(mechanism.handled=false). onRequestError 의
    // captureRequestError 는 같은 오류를 다시 보내지 않으므로 이 이벤트에는 contexts.nextjs 가 없다.
    { label: '처리되지 않은 예외(node)', handled: false, runtime: 'node', valueIncludes: UNHANDLED_LINE_MARKER, count: REPEAT, tripwire: true },
    { label: '처리되지 않은 예외(edge)', handled: false, runtime: 'edge', valueIncludes: UNHANDLED_LINE_MARKER, count: REPEAT, tripwire: true },
  ],
  // 웹훅 요청(401)의 transaction 은 기대하지 않는다. SDK 가 401·404·3xx 응답의 transaction 을 버린다.
  transactions: [
    { label: '페이지 transaction', name: 'GET /[lang]/vote', min: REPEAT },
    { label: '밖으로 부르는 요청의 transaction', name: 'GET /api/envelope-test/handled', min: REPEAT, childOp: 'http.client' },
    { label: '처리되지 않은 예외의 transaction(node)', name: 'GET /api/envelope-test/throw', min: REPEAT },
    // edge 는 SDK 가 SENTRY_TRACES_SAMPLE_RATE 를 스스로 읽어 표본이 켜진다. 운영에서는 꺼져 있다.
    { label: 'edge 라우트의 transaction', name: 'GET /api/envelope-test/edge-throw', min: REPEAT },
    { label: 'middleware 의 transaction(edge)', name: 'middleware GET /ko/vote', min: REPEAT },
  ],
};

function buildRequests(base) {
  const A = CANARIES.absent;
  const B = CANARIES.unhandled;
  const common = {
    // 이 프로젝트의 Supabase 쿠키 이름이 아니다. middleware 가 세션으로 읽지 않는다.
    cookie: `sb-envtest-auth-token=${A.cookie}; locale=ko`,
    authorization: `Bearer ${A.authorization}`,
    'x-forwarded-for': A.forwardedFor,
    'x-envtest-console': CANARIES.stdoutOnly.console,
  };
  const unhandled = {
    ...common,
    'x-envtest-marker': B.marker,
    'x-envtest-url-query': B.urlQuery,
    'x-envtest-jwt': B.jwt,
    'x-envtest-bearer': B.bearer,
    'x-envtest-email': B.email,
  };

  const round = [
    { label: 'page', url: `${base}/ko/vote?code=${A.pageQuery}`, init: { headers: common } },
    {
      label: 'webhook',
      url: `${base}/api/payment/portone/webhook?token=${A.webhookQuery}`,
      init: {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json', 'x-portone-signature': A.signature },
        body: JSON.stringify({ paymentId: A.webhookPaymentId, status: 'PAID', customer: { email: A.webhookEmail } }),
      },
    },
    {
      label: 'handled',
      url: `${base}/api/envelope-test/handled?code=${A.handledQuery}`,
      init: { headers: { ...common, 'x-envtest-upstream-token': A.upstreamToken } },
    },
    { label: 'throw', url: `${base}/api/envelope-test/throw?code=${B.requestQuery}`, init: { headers: unhandled } },
    { label: 'edge-throw', url: `${base}/api/envelope-test/edge-throw?code=${B.requestQuery}`, init: { headers: unhandled } },
  ];

  return Array.from({ length: REPEAT }, () => round).flat();
}

module.exports = { REPEAT, UNHANDLED_LINE_MARKER, CANARIES, EXPECTED, buildRequests };
```

`package.json` 의 `scripts` 에 `"test:ui"` 아래 한 줄을 넣는다:

```json
    "test:envelope": "node scripts/envelope-test/run.js",
```

- [ ] **Step 4: 단위 테스트 통과를 확인한다**

Run: `npx vitest run __tests__/scripts/envelope-test-routes.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS. 라우트 원본도 타입 검사를 탄다(`tsc` 는 `**/*.ts` 를 본다). lint 는 테스트 빌드가 `app/` 에 복사된 것을 본다.

- [ ] **Step 5: 실행기를 쓴다**

<!-- file: scripts/envelope-test/run.js -->
```js
#!/usr/bin/env node
'use strict';

/**
 * envelope 테스트 실행기 (설계 §5.1).
 *
 * 실제 Next 서버(Production 빌드, next start)에 실제 요청을 보내고, SDK 가 실제로 내보낸 envelope 을
 * 로컬 수집기로 받아 canary 를 찾는다. 운영 Sentry 로는 아무것도 보내지 않는다.
 *
 *   npm run test:envelope                  # 테스트 빌드를 만들고 돌린다
 *   npm run test:envelope -- --skip-build  # 이미 만든 .next-envtest 를 다시 쓴다
 *
 * 빌드가 Supabase 조회에 의존하므로 CI 에서는 돌리지 않는다. 판정 로직(analyze.js)의 단위 테스트만 CI 에서 돈다.
 * Sentry SDK 를 올리거나 sentry.*.config.js 를 고치면 다시 돌린다.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { parseEnvelope, evaluate, countsSatisfied } = require('./analyze');
const { TEST_DIST_DIR, TEST_ROUTE_SOURCE, TEST_ROUTE_TARGET } = require('./build-switch');
const { CANARIES, EXPECTED, UNHANDLED_LINE_MARKER, buildRequests } = require('./scenario');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, TEST_DIST_DIR, 'envelope-test');
const NEXT_BIN = path.join(ROOT, 'node_modules', '.bin', 'next');
const ROUTE_SOURCE = path.join(ROOT, TEST_ROUTE_SOURCE);
const ROUTE_TARGET = path.join(ROOT, TEST_ROUTE_TARGET);
// distDir 이 다르면 Next 가 빌드 중에 이 두 파일을 고친다. 빌드가 끝나면 되돌린다.
const FILES_NEXT_REWRITES = ['next-env.d.ts', 'tsconfig.json'];

const skipBuild = process.argv.includes('--skip-build');
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

function decode(body, encoding) {
  if (encoding === 'gzip') return zlib.gunzipSync(body);
  if (encoding === 'br') return zlib.brotliDecompressSync(body);
  if (encoding === 'deflate') return zlib.inflateSync(body);
  return body;
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

function startNext(env, output) {
  const child = spawn(NEXT_BIN, ['start', '-p', env.PORT], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  return child;
}

async function waitFor(check, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(250);
  }
  if (what) throw new Error(`시간 초과: ${what}`);
  return false;
}

async function main() {
  const snapshot = snapshotFiles();
  const envelopes = [];
  const output = [];
  const sink = createSink(envelopes);
  const upstream = createUpstream();
  let next;
  let routesInstalled = false;

  const cleanup = () => {
    if (next && next.exitCode === null) next.kill('SIGTERM');
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

    // DSN 은 127.0.0.1, 가짜 외부 서버는 localhost 로 부른다. SDK 는 DSN 의 호스트 문자열이 들어간
    // 주소로 가는 요청에 span 을 만들지 않는다(isSentryRequestUrl).
    const sinkPort = await listen(sink, '127.0.0.1');
    const upstreamPort = await listen(upstream, 'localhost');
    const port = String(await freePort());

    next = startNext(
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
    );

    await waitFor(
      () => {
        if (next.exitCode !== null) throw new Error(`next start 가 종료됐다(코드 ${next.exitCode})\n${output.join('')}`);
        return output.join('').includes('Ready in');
      },
      60_000,
      'next start 준비',
    );

    const statuses = [];
    for (const request of buildRequests(`http://127.0.0.1:${port}`)) {
      const response = await fetch(request.url, { redirect: 'manual', ...request.init });
      await response.arrayBuffer();
      statuses.push(`${request.label} ${response.status}`);
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
    });

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'envelopes.jsonl'), envelopes.map((envelope) => JSON.stringify(envelope)).join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, 'stdout.log'), stdout);
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ statuses, ...result }, null, 2));

    const itemCount = envelopes.reduce((sum, envelope) => sum + envelope.items.length, 0);
    console.log(`\n[envelope] 요청 ${statuses.length}건: ${[...new Set(statuses)].join(', ')}`);
    console.log(`[envelope] 받은 envelope ${envelopes.length}건(항목 ${itemCount}건)`);
    for (const count of result.counts) {
      console.log(`[envelope]   ${count.label}: ${count.actual}건 (기대 ${count.expected})`);
    }
    console.log(`[envelope] 결과 파일: ${OUT_DIR}`);

    if (result.failures.length > 0) {
      console.error(`\n[envelope] 실패 ${result.failures.length}건`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
      return 1;
    }
    console.log('\n[envelope] 통과: 건수가 맞고 canary 가 허용된 곳에만 있다.');
    return 0;
  } finally {
    cleanup();
    sink.close();
    upstream.close();
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

- [ ] **Step 6: 커밋**

```bash
git add scripts/envelope-test package.json __tests__/scripts/envelope-test-routes.test.ts
git commit -m "test(sentry): 실제 Next 서버의 envelope 을 받아 canary 를 찾는 테스트를 넣는다"
```

- [ ] **Step 7: 수정 전 상태에서 실패하는 것을 본다 (red)**

Run: `npm run test:envelope 2>&1 | tee /tmp/envelope-red.log; git status --short`
Expected(실제 결과):
- 종료 코드 1. 요청 15건(page 200, webhook 401, handled 200, throw 500, edge-throw 500). 받은 envelope 61건.
- 건수 아홉 종류가 모두 맞는다(오류 이벤트 네 종류 각 3건, transaction 다섯 종류 각 3건 이상). 건수가 틀리면 누출 목록을 믿을 수 없으므로 먼저 원인을 찾는다.
- 실패 70건: `request.headers.*`·`request.cookies.*` 의 묶음 A, `request.url`·`request.query_string`·`contexts.trace.data.http.target`·`next.span_name`·transaction 이름의 쿼리, 자식 span 의 `url.full`·`url.query`·`http.query`, `breadcrumbs[].data.http.query`, `breadcrumbs[]` 의 console canary 와 Next 가 찍은 미처리 오류(메시지, stack), tripwire 태그 없음, 예외 메시지의 `urlQuery`·`jwt`·`bearer`·`email`.
- `git status --short` 가 비어 있다(`next-env.d.ts`·`tsconfig.json` 이 되돌려졌고 `app/api/envelope-test` 가 지워졌다).

첫 실행은 빌드에서 실패했고(두 겹 확장자의 edge 라우트), 두 번째 실행에서 기대값 셋(console canary, `request_path`, 웹훅 transaction)이 실제 SDK 동작과 달라 고쳤다. 위는 세 번째 실행의 결과다.

실패 목록 전체를 PR 본문에 "수정 전" 으로 붙인다.

### Task 5: 가리기 모듈

**Files:**
- Create: `lib/sentry/scrub.ts`
- Test: `__tests__/lib/sentry/scrub.test.ts`

**Interfaces:**
- Produces:
  - `TRIPWIRE_KEY = 'redaction.tripwire'`
  - `stripUrlQueries(text: string): string`
  - `redactTokenShapes(text: string): string`
  - `scrubEvent<T extends object>(event: T): T | null` — 받은 객체를 고쳐 그대로 돌려준다. 실패하면 `null`
  - `scrubSpan<T extends object>(span: T): T`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

<!-- file: __tests__/lib/sentry/scrub.test.ts -->
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRIPWIRE_KEY, redactTokenShapes, scrubEvent, scrubSpan, stripUrlQueries } from '@/lib/sentry/scrub';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVlLTEyMw';
const OPAQUE = 'abc123def456ghi789jkl';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stripUrlQueries', () => {
  it.each([
    ['http://127.0.0.1:3274/ko/vote?code=SECRET', 'http://127.0.0.1:3274/ko/vote'],
    ['/ko/vote?code=SECRET', '/ko/vote'],
    ['/?code=SECRET', '/'],
    ['GET /ko/vote?code=SECRET', 'GET /ko/vote'],
    ['middleware GET /ko/vote?code=SECRET', 'middleware GET /ko/vote'],
    ['https://x.supabase.co/rest/v1/votes?select=*&id=eq.5#frag', 'https://x.supabase.co/rest/v1/votes'],
    ['https://app.example/cb#access_token=SECRET', 'https://app.example/cb'],
    // 따옴표와 괄호는 토큰을 끊지 않는다. 뒤에 붙은 값이 살아남으면 안 된다.
    ["/ko/vote?a='x'&code=SECRET", '/ko/vote'],
    ['/ko/vote?a=(x)&code=SECRET', '/ko/vote'],
    ['failed to fetch https://x/y?token=SECRET (status 500)', 'failed to fetch https://x/y (status 500)'],
    ['callback?code=SECRET', 'callback'],
    ['redirect ?code=SECRET now', 'redirect  now'],
    ['#access_token=SECRET', ''],
    ['a?b/c?code=SECRET', 'a?b/c'],
    ['app:///_next/server/app/api/x/route.js?v=SECRET', 'app:///_next/server/app/api/x/route.js'],
  ])('%j → %j', (input, expected) => {
    expect(stripUrlQueries(input)).toBe(expected);
  });

  it.each([
    'What is this? I do not know',
    "Unexpected token '?' in JSON",
    'SELECT * FROM t WHERE a = ?',
    'Object.?',
    'C# and F#',
    'GET /[lang]/vote',
    'render route (app) /[lang]/vote',
    '(?:a|b)=c',
    '',
  ])('%j 는 그대로 둔다', (input) => {
    expect(stripUrlQueries(input)).toBe(input);
  });
});

describe('redactTokenShapes', () => {
  it.each([
    [`token ${JWT} end`, 'token [redacted-jwt] end'],
    [`${JWT} ${JWT}`, '[redacted-jwt] [redacted-jwt]'],
    [`/reset/${JWT}/confirm`, '/reset/[redacted-jwt]/confirm'],
    [`Authorization: Bearer ${JWT}`, 'Authorization: Bearer [redacted-jwt]'],
    [`Authorization: Bearer ${OPAQUE}`, 'Authorization: Bearer [redacted]'],
    [`authorization: bearer ${OPAQUE}==`, 'authorization: Bearer [redacted]'],
  ])('%j → %j', (input, expected) => {
    expect(redactTokenShapes(input)).toBe(expected);
  });

  it.each([
    'eyJ',
    'eyJabc.def.ghi is too short to be a token',
    'eyJhbGciOiJIUzI1NiJ9 alone is one segment only',
    'Bearer token is missing from the request',
    'Bearer authentication failed for this request',
    'the bearer of bad news arrived in 2026',
  ])('%j 는 그대로 둔다', (input) => {
    expect(redactTokenShapes(input)).toBe(input);
  });
});

describe('scrubEvent', () => {
  it('request 에 url 과 method 만 남기고 쿼리를 뗀다', () => {
    const event = {
      request: {
        url: 'http://127.0.0.1:3274/api/payment/portone/webhook?token=SECRET',
        method: 'POST',
        query_string: 'token=SECRET',
        headers: { cookie: 'sb=SECRET', authorization: 'Bearer SECRET', 'x-portone-signature': 'SECRET' },
        cookies: { sb: 'SECRET' },
        data: '{"paymentId":"SECRET"}',
        env: { REMOTE_ADDR: '203.0.113.9' },
      },
    };

    expect(scrubEvent(event)).toBe(event);
    expect(event.request).toEqual({ url: 'http://127.0.0.1:3274/api/payment/portone/webhook', method: 'POST' });
  });

  it('처리되지 않은 예외의 request_path 에서 쿼리를 뗀다', () => {
    const event = {
      contexts: { nextjs: { request_path: '/api/envelope-test/throw?code=SECRET', router_kind: 'App Router' } },
    };
    scrubEvent(event);
    expect(event.contexts.nextjs).toEqual({ request_path: '/api/envelope-test/throw', router_kind: 'App Router' });
  });

  it('transaction 의 이름, trace 속성, 자식 span, breadcrumb 에 같은 규칙을 건다', () => {
    const event = {
      type: 'transaction',
      transaction: 'GET /ko/vote?code=SECRET',
      contexts: {
        trace: {
          op: 'http.server',
          data: {
            'http.target': '/ko/vote?code=SECRET',
            'next.span_name': 'GET /ko/vote?code=SECRET',
            'http.method': 'GET',
            'http.response.status_code': 200,
            'sentry.sample_rate': 0.1,
          },
        },
      },
      spans: [
        {
          op: 'http.client',
          description: 'GET https://x.supabase.co/rest/v1/votes?select=*',
          data: {
            'url.full': 'https://x.supabase.co/rest/v1/votes?select=*&user_id=eq.SECRET',
            'url.query': '?select=*&user_id=eq.SECRET',
            'http.query': '?select=*&user_id=eq.SECRET',
            'url.fragment': '#SECRET',
            'http.fragment': '#SECRET',
            'http.request.method': 'GET',
          },
        },
      ],
      breadcrumbs: [
        { category: 'http', data: { url: 'https://api.example/userinfo?access_token=SECRET', 'http.query': '?access_token=SECRET', status_code: 200 } },
      ],
    };

    scrubEvent(event);

    expect(event.transaction).toBe('GET /ko/vote');
    expect(event.contexts.trace.data).toEqual({
      'http.target': '/ko/vote',
      'next.span_name': 'GET /ko/vote',
      'http.method': 'GET',
      'http.response.status_code': 200,
      'sentry.sample_rate': 0.1,
    });
    expect(event.spans[0]).toEqual({
      op: 'http.client',
      description: 'GET https://x.supabase.co/rest/v1/votes',
      data: { 'url.full': 'https://x.supabase.co/rest/v1/votes', 'http.request.method': 'GET' },
    });
    expect(event.breadcrumbs[0].data).toEqual({ url: 'https://api.example/userinfo', status_code: 200 });
    expect(JSON.stringify(event)).not.toContain('SECRET');
    expect(event).not.toHaveProperty('tags');
  });

  it('예외 메시지에서 URL 쿼리·JWT·Bearer·이메일을 가리고 tripwire 태그를 붙인다', () => {
    const event = {
      tags: { service: 'picnic-web' },
      exception: {
        values: [
          {
            type: 'Error',
            value: `envtest unhandled MARKER url=https://envtest.invalid/callback?code=SECRET jwt=${JWT} auth=Bearer ${OPAQUE} email=user.name+tag@example.co.kr`,
            stacktrace: {
              frames: [
                { filename: 'app:///_next/server/app/api/x/route.js?v=SECRET', abs_path: '/var/task/route.js#SECRET', function: '?' },
              ],
            },
          },
        ],
      },
    };

    scrubEvent(event);

    expect(event.exception.values[0].value).toBe(
      'envtest unhandled MARKER url=https://envtest.invalid/callback jwt=[redacted-jwt] auth=Bearer [redacted] email=[redacted-email]',
    );
    expect(event.exception.values[0].stacktrace.frames[0]).toEqual({
      filename: 'app:///_next/server/app/api/x/route.js',
      abs_path: '/var/task/route.js',
      function: '?',
    });
    expect(event.tags).toEqual({ service: 'picnic-web', [TRIPWIRE_KEY]: '1' });
  });

  it('토큰 모양 값은 이벤트의 어느 문자열에 있든 가리고 태그를 붙인다', () => {
    const event = { contexts: { log: { detail: { note: `leaked ${JWT}`, list: [`Bearer ${OPAQUE}`] } } }, extra: { n: 1, ok: true, none: null } };
    scrubEvent(event);
    expect(event.contexts.log.detail).toEqual({ note: 'leaked [redacted-jwt]', list: ['Bearer [redacted]'] });
    expect((event as { tags?: Record<string, string> }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
  });

  it('SDK 내부 자료(sdkProcessingMetadata)는 건드리지 않고, 거기 있는 토큰으로 태그를 붙이지 않는다', () => {
    // beforeSend 시점의 이벤트에는 요청 헤더 원문이 든 내부 자료가 붙어 있다. 전송 전에 SDK 가 지우고,
    // 같은 요청의 다른 이벤트와 객체를 공유한다. 고치면 다른 이벤트의 판정이 달라진다.
    const normalizedRequest = {
      url: 'http://127.0.0.1:3274/api/x?code=SECRET',
      headers: { authorization: `Bearer ${OPAQUE}`, cookie: `sb=${JWT}` },
    };
    const event = {
      request: { url: 'http://127.0.0.1:3274/api/x?code=SECRET', method: 'GET' },
      sdkProcessingMetadata: { normalizedRequest },
    };

    scrubEvent(event);

    expect(event.request).toEqual({ url: 'http://127.0.0.1:3274/api/x', method: 'GET' });
    expect(event).not.toHaveProperty('tags');
    expect(event.sdkProcessingMetadata.normalizedRequest).toBe(normalizedRequest);
    expect(normalizedRequest).toEqual({
      url: 'http://127.0.0.1:3274/api/x?code=SECRET',
      headers: { authorization: `Bearer ${OPAQUE}`, cookie: `sb=${JWT}` },
    });
  });

  it('span 에 남은 tripwire 표식을 이벤트 태그로 올린다', () => {
    const fromChild = { spans: [{ data: { [TRIPWIRE_KEY]: '1' } }] };
    const fromRoot = { contexts: { trace: { data: { [TRIPWIRE_KEY]: '1' } } } };
    expect((scrubEvent(fromChild) as { tags?: unknown }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
    expect((scrubEvent(fromRoot) as { tags?: unknown }).tags).toEqual({ [TRIPWIRE_KEY]: '1' });
  });

  it('message 만 있는 이벤트는 같은 객체를 그대로 돌려준다', () => {
    const event = { message: 'edge failure' };
    expect(scrubEvent(event)).toBe(event);
    expect(event).toEqual({ message: 'edge failure' });
  });

  it('8,192자가 넘는 예외 메시지는 자른다', () => {
    const event = { exception: { values: [{ value: 'x'.repeat(9000) }] } };
    scrubEvent(event);
    expect(event.exception.values[0].value).toBe(`${'x'.repeat(8192)}…`);
  });

  it('두 번 걸어도 결과가 같다', () => {
    const build = () => ({
      request: { url: 'https://h/p?x=1', method: 'GET' },
      exception: { values: [{ value: `a ${JWT} b@c.io /p?q=1` }] },
      spans: [{ description: 'GET /p?q=1', data: { 'url.query': '?q=1' } }],
    });
    const once = scrubEvent(build());
    const twice = scrubEvent(scrubEvent(build()) as object);
    expect(twice).toEqual(once);
  });

  it('가리다가 실패하면 이벤트를 버리고, 원본 오류의 메시지를 찍지 않는다', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const event = { contexts: {} as Record<string, unknown> };
    Object.defineProperty(event.contexts, 'boom', {
      enumerable: true,
      get() {
        throw new TypeError('getter failed with SECRET');
      },
    });

    expect(scrubEvent(event)).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('[sentry] 이벤트를 가리지 못해 버린다:', 'TypeError');
  });

  it.each([
    ['슬래시', '/'.repeat(200_000)],
    ['물음표', '?'.repeat(200_000)],
    ['경로와 쿼리의 반복', '/a?b=c '.repeat(30_000)],
    ['eyJ 의 반복', 'eyJ'.repeat(70_000)],
    ['덜 끝난 JWT 의 반복', 'eyJaaaaaaaaaa.'.repeat(15_000)],
    ['Bearer 의 반복', 'Bearer '.repeat(30_000)],
    ['숫자 없는 긴 Bearer 토큰', `bearer ${'a'.repeat(200_000)}`],
    ['골뱅이의 반복', 'a@'.repeat(100_000)],
    ['공백', ' '.repeat(200_000)],
    ['Bearer 뒤의 긴 공백', `Bearer ${' '.repeat(200_000)}`],
    ['짧은 토큰 여러 개와 물음표 하나', `${'a '.repeat(100_000)}/p?q=1`],
    ['마침표로 끊긴 eyJ 의 반복', 'eyJ.'.repeat(50_000)],
  ])('길이를 믿을 수 없는 입력을 선형 시간에 처리한다: %s', (_name, input) => {
    const started = performance.now();
    stripUrlQueries(input);
    redactTokenShapes(input);
    scrubEvent({ exception: { values: [{ value: input }] }, contexts: { nextjs: { request_path: input } } });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('scrubSpan', () => {
  it('설명과 속성에서 쿼리를 떼고 같은 객체를 돌려준다', () => {
    const span = {
      description: 'GET https://x.supabase.co/rest/v1/votes?id=eq.5',
      op: 'http.client',
      data: { 'url.full': 'https://x.supabase.co/rest/v1/votes?id=eq.5', 'url.query': '?id=eq.5', 'http.request.method': 'GET' },
    };

    expect(scrubSpan(span)).toBe(span);
    expect(span).toEqual({
      description: 'GET https://x.supabase.co/rest/v1/votes',
      op: 'http.client',
      data: { 'url.full': 'https://x.supabase.co/rest/v1/votes', 'http.request.method': 'GET' },
    });
  });

  it('토큰 모양 값을 가리고 span 의 data 에 표식을 남긴다', () => {
    const span = { description: `GET /reset/${JWT}`, data: { 'http.request.method': 'GET' } as Record<string, unknown> };
    scrubSpan(span);
    expect(span.description).toBe('GET /reset/[redacted-jwt]');
    expect(span.data).toEqual({ 'http.request.method': 'GET', [TRIPWIRE_KEY]: '1' });
  });

  it('가리다가 실패하면 설명과 속성을 비운다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const data = {} as Record<string, unknown>;
    Object.defineProperty(data, 'boom', {
      enumerable: true,
      get() {
        throw new Error('getter failed');
      },
    });
    const span = { description: 'GET /p?q=SECRET', data, span_id: 'abc' };

    expect(scrubSpan(span)).toBe(span);
    expect(span).toEqual({ description: undefined, data: {}, span_id: 'abc' });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/lib/sentry/scrub.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/sentry/scrub"`

- [ ] **Step 3: 구현한다**

<!-- file: lib/sentry/scrub.ts -->
```ts
/**
 * Sentry 로 나가는 이벤트에서 요청 데이터, URL 쿼리, 토큰 모양 값을 지운다.
 *
 * 설계: docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.1, §4.5, §4.7.
 * 서버(sentry.server.config.js)와 edge(sentry.edge.config.js)가 같은 함수를 쓴다.
 *
 * - edge 번들에 들어가므로 Node API 를 쓰지 않는다.
 * - 입력 길이에 선형인 코드만 둔다. 예외 메시지와 요청 경로는 외부 입력이라 길이를 믿을 수 없다.
 * - 필드 이름 목록으로 URL 을 찾지 않는다. 이벤트의 모든 문자열에 같은 규칙을 건다.
 *   SDK 가 새 속성을 만들어도 같은 규칙을 탄다. 실제로 남는 것이 없는지는 envelope 테스트가 본다
 *   (npm run test:envelope).
 */

export const TRIPWIRE_KEY = 'redaction.tripwire';

const REDACTED_JWT = '[redacted-jwt]';
const REDACTED_BEARER = 'Bearer [redacted]';
const REDACTED_EMAIL = '[redacted-email]';

/** Sentry 가 메시지에 두는 상한과 같다. 그보다 긴 부분은 어차피 버려진다. */
const MAX_FREE_TEXT_LENGTH = 8192;
const MIN_JWT_SEGMENT = 10;
const MIN_TOKEN_TEXT_LENGTH = 20;

/** 값 전체가 쿼리인 속성. 어디에 있든 키째로 지운다. */
const QUERY_ONLY_KEYS = new Set(['url.query', 'http.query', 'url.fragment', 'http.fragment']);

/**
 * SDK 가 이벤트에 붙여 두는 내부 자료. 전송 전에 SDK 가 지운다(createEventEnvelope).
 * 요청 헤더 원문이 들어 있고 같은 요청의 다른 이벤트와 객체를 공유하므로 읽지도 고치지도 않는다.
 */
const SDK_INTERNAL_KEY = 'sdkProcessingMetadata';

/** `?`·`#` 바로 뒤가 `키=` 모양인가. 최대 66자만 본다. */
const QUERY_PAIR = /^[?#][\w.%[\]-]{1,64}=/;
const QUERY_PAIR_WINDOW = 66;
/** `Bearer` 뒤의 토큰. 숫자가 하나 이상 있고 16자 이상이어야 한다("Bearer token is missing" 을 건드리지 않는다). */
const BEARER_TOKEN = /\bbearer\s+(?=[\w.~+/-]*\d)[\w.~+/-]{16,}=*/gi;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;

type Bag = Record<string, unknown>;
type Walk = { tripwire: boolean; seen: WeakSet<object> };

function isBag(value: unknown): value is Bag {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 토큰에서 잘라낼 위치. 표시(`?`·`#`) 앞에 `/` 가 있거나 표시 바로 뒤가 `키=` 모양일 때만 자른다. */
function queryCutIndex(token: string): number {
  let sawSlash = false;
  for (let i = 0; i < token.length; i++) {
    const code = token.charCodeAt(i);
    if (code === 47) {
      sawSlash = true;
    } else if ((code === 63 || code === 35) && (sawSlash || QUERY_PAIR.test(token.slice(i, i + QUERY_PAIR_WINDOW)))) {
      return i;
    }
  }
  return -1;
}

/**
 * 문자열 안의 URL 에서 `?`·`#` 뒤를 버린다. 공백으로 나눈 토큰마다 본다.
 * 공백이 없는 URL 하나는 토큰이 하나이므로 표시 뒤가 전부 사라진다.
 */
export function stripUrlQueries(text: string): string {
  if (text.indexOf('?') === -1 && text.indexOf('#') === -1) return text;
  return text.replace(/\S+/g, (token) => {
    const cut = queryCutIndex(token);
    return cut === -1 ? token : token.slice(0, cut);
  });
}

const isBase64Url = (code: number): boolean =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 45 || code === 95;

/** `eyJ….….…`(base64url 세 덩어리)을 고정 문자열로 바꾼다. 실패한 지점부터 다시 찾으므로 선형이다. */
function redactJwtShapes(text: string): string {
  let start = text.indexOf('eyJ');
  if (start === -1) return text;

  let out = '';
  let copied = 0;
  while (start !== -1) {
    let cursor = start;
    let segments = 0;
    for (;;) {
      const segmentStart = cursor;
      while (cursor < text.length && isBase64Url(text.charCodeAt(cursor))) cursor++;
      if (cursor - segmentStart < MIN_JWT_SEGMENT) break;
      segments++;
      if (segments === 3 || text.charCodeAt(cursor) !== 46) break;
      cursor++;
    }
    if (segments === 3) {
      out += text.slice(copied, start) + REDACTED_JWT;
      copied = cursor;
    }
    start = text.indexOf('eyJ', Math.max(cursor, start + 3));
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/**
 * 토큰 모양(JWT, `Bearer <토큰>`)을 고정 문자열로 바꾼다. 정제 수단이 아니라 경보다(§4.5).
 * 값이 바뀌었다면 수집 축소나 호출부에 구멍이 있다는 뜻이다.
 */
export function redactTokenShapes(text: string): string {
  if (text.length < MIN_TOKEN_TEXT_LENGTH) return text;
  return redactJwtShapes(text).replace(BEARER_TOKEN, REDACTED_BEARER);
}

/** 예외 메시지 같은 자유 문장. 길이를 묶고 이메일을 가린다. URL 쿼리와 토큰 모양은 뒤의 순회가 처리한다. */
function scrubFreeText(text: string): string {
  const capped = text.length > MAX_FREE_TEXT_LENGTH ? `${text.slice(0, MAX_FREE_TEXT_LENGTH)}…` : text;
  return capped.indexOf('@') === -1 ? capped : capped.replace(EMAIL, REDACTED_EMAIL);
}

function scrubString(value: string, walk: Walk): string {
  const stripped = stripUrlQueries(value);
  const redacted = redactTokenShapes(stripped);
  if (redacted !== stripped) walk.tripwire = true;
  return redacted;
}

/** 값 안의 모든 문자열에 규칙을 건다. 받은 객체를 고친다. */
function scrubNode(node: unknown, walk: Walk): void {
  if (node === null || typeof node !== 'object' || walk.seen.has(node)) return;
  walk.seen.add(node);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const item: unknown = node[i];
      if (typeof item === 'string') {
        const next = scrubString(item, walk);
        if (next !== item) node[i] = next;
      } else {
        scrubNode(item, walk);
      }
    }
    return;
  }

  if (!isBag(node)) return;
  for (const key of Object.keys(node)) {
    if (QUERY_ONLY_KEYS.has(key)) {
      delete node[key];
      continue;
    }
    const value = node[key];
    if (typeof value === 'string') {
      const next = scrubString(value, walk);
      if (next !== value) node[key] = next;
    } else {
      scrubNode(value, walk);
    }
  }
}

/** request 에는 url 과 method 만 남긴다. 헤더·쿠키·쿼리·본문은 수집 옵션이 이미 뺐고, 이것은 두 번째 문이다. */
function keepRequestUrlAndMethod(event: Bag): void {
  if (event.request === undefined) return;
  const request = event.request;
  if (!isBag(request)) {
    delete event.request;
    return;
  }
  const kept: Bag = {};
  if (typeof request.method === 'string') kept.method = request.method;
  if (typeof request.url === 'string') kept.url = request.url;
  event.request = kept;
}

function scrubMessages(event: Bag): void {
  if (typeof event.message === 'string') event.message = scrubFreeText(event.message);
  const values = isBag(event.exception) ? event.exception.values : undefined;
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (isBag(value) && typeof value.value === 'string') value.value = scrubFreeText(value.value);
  }
}

/** beforeSendSpan 이 span 에 남긴 표식이 있는가. */
function hasMarkedSpan(event: Bag): boolean {
  const marked = (data: unknown): boolean => isBag(data) && data[TRIPWIRE_KEY] === '1';
  const trace = isBag(event.contexts) ? event.contexts.trace : undefined;
  if (isBag(trace) && marked(trace.data)) return true;
  return Array.isArray(event.spans) && event.spans.some((span: unknown) => isBag(span) && marked(span.data));
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : typeof error);

/**
 * beforeSend·beforeSendTransaction 용. 받은 객체를 고쳐서 그대로 돌려준다.
 * 가리다가 실패하면 이벤트를 버린다 — 가리지 못한 이벤트를 보내지 않는다.
 */
export function scrubEvent<T extends object>(event: T): T | null {
  try {
    const bag = event as unknown as Bag;
    keepRequestUrlAndMethod(bag);
    scrubMessages(bag);

    const walk: Walk = { tripwire: false, seen: new WeakSet() };
    const internal = bag[SDK_INTERNAL_KEY];
    if (internal !== null && typeof internal === 'object') walk.seen.add(internal);
    scrubNode(bag, walk);
    if (walk.tripwire || hasMarkedSpan(bag)) {
      bag.tags = { ...(isBag(bag.tags) ? bag.tags : {}), [TRIPWIRE_KEY]: '1' };
    }
    return event;
  } catch (error) {
    // 원본 오류의 메시지는 찍지 않는다. 가리려던 값이 들어 있을 수 있다.
    console.error('[sentry] 이벤트를 가리지 못해 버린다:', errorName(error));
    return null;
  }
}

/** beforeSendSpan 용. span 은 버릴 수 없으므로 실패하면 설명과 속성을 비운다. */
export function scrubSpan<T extends object>(span: T): T {
  const bag = span as unknown as Bag;
  try {
    const walk: Walk = { tripwire: false, seen: new WeakSet() };
    scrubNode(bag, walk);
    if (walk.tripwire) bag.data = { ...(isBag(bag.data) ? bag.data : {}), [TRIPWIRE_KEY]: '1' };
  } catch (error) {
    console.error('[sentry] span 을 가리지 못해 설명과 속성을 비운다:', errorName(error));
    bag.description = undefined;
    bag.data = {};
  }
  return span;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/lib/sentry/scrub.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/sentry/scrub.ts __tests__/lib/sentry/scrub.test.ts
git commit -m "feat(sentry): 이벤트에서 요청 데이터·URL 쿼리·토큰 모양 값을 지우는 함수를 넣는다"
```

### Task 6: 설정 연결 — 수집 축소와 훅

**Files:**
- Modify: `sentry.server.config.js` (import, `integrations`, `beforeSend`, 훅 두 개 추가), `sentry.edge.config.js` (import, `integrations`, `beforeSend`, 훅 두 개 추가)
- Test: `__tests__/sentry-server-config.test.ts` (describe 추가), `__tests__/sentry-edge-config.test.ts` (it 추가)

**Interfaces:**
- Consumes: `REQUEST_DATA_INCLUDE`, `withoutConsole` (Task 3), `scrubEvent`, `scrubSpan` (Task 5)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`__tests__/sentry-server-config.test.ts` — `describe('표본율', …)` 블록 아래, 바깥 `describe` 가 닫히기 전에 추가:

```ts
  describe('수집 범위', () => {
    const resolve = (options: ServerOptions, defaults: Integration[]): Integration[] => {
      expect(options.integrations).toBeTypeOf('function');
      return (options.integrations as (defaults: Integration[]) => Integration[])(defaults);
    };

    it('기본 integration 에서 Console 을 빼고 요청 데이터 수집을 url 로 좁힌다', async () => {
      const options = await loadOptions();
      const resolved = resolve(options, [{ name: 'InboundFilters' }, { name: 'Console' }, { name: 'RequestData' }, { name: 'Http' }]);

      expect(resolved.map((integration) => integration.name)).toEqual(['InboundFilters', 'RequestData', 'Http', 'Http', 'RequestData']);
      expect(resolved[4].options).toEqual({
        include: { cookies: false, headers: false, query_string: false, data: false, url: true, ip: false },
      });
    });

    it('httpIntegration 의 요청 필터를 그대로 둔다', async () => {
      const options = await loadOptions();
      const http = resolve(options, []).find((integration) => integration.name === 'Http');
      const filters = http?.options as {
        ignoreIncomingRequests: (url: string) => boolean;
        ignoreOutgoingRequests: (url: string) => boolean;
      };

      expect(filters.ignoreIncomingRequests('/api/health')).toBe(true);
      expect(filters.ignoreIncomingRequests('/_next/static/chunks/a.js')).toBe(true);
      expect(filters.ignoreIncomingRequests('/ko/vote')).toBe(false);
      expect(filters.ignoreOutgoingRequests('https://o0.ingest.sentry.io/api/1/envelope/')).toBe(true);
      expect(filters.ignoreOutgoingRequests('https://x.supabase.co/rest/v1/votes')).toBe(false);
    });

    it('오류 이벤트에서 요청 헤더·쿠키·쿼리를 지운다', async () => {
      const options = await loadOptions();
      const event = {
        request: {
          url: 'https://www.picnic.fan/ko/vote?code=SECRET',
          method: 'GET',
          query_string: 'code=SECRET',
          headers: { cookie: 'sb=SECRET' },
          cookies: { sb: 'SECRET' },
        },
      };

      expect(options.beforeSend(event)).toBe(event);
      expect(event.request).toEqual({ url: 'https://www.picnic.fan/ko/vote', method: 'GET' });
    });

    it('API 404 오류를 버리는 기존 필터를 유지한다', async () => {
      const options = await loadOptions();
      expect(options.beforeSend({ exception: { values: [{ value: 'api route returned 404' }] } })).toBeNull();
    });

    it('transaction 과 span 에도 같은 규칙을 건다', async () => {
      const options = await loadOptions();
      const transaction = { type: 'transaction', contexts: { trace: { data: { 'http.target': '/ko/vote?code=SECRET' } } } };
      const span = { description: 'GET https://x.supabase.co/rest/v1/votes?id=eq.5', data: { 'url.query': '?id=eq.5' } };

      expect(options.beforeSendTransaction?.(transaction)).toBe(transaction);
      expect(options.beforeSendSpan?.(span)).toBe(span);
      expect(transaction.contexts.trace.data['http.target']).toBe('/ko/vote');
      expect(span).toEqual({ description: 'GET https://x.supabase.co/rest/v1/votes', data: {} });
    });
  });
```

`__tests__/sentry-edge-config.test.ts` — 첫 `it` 아래에 추가:

```ts
  it('Console integration 을 빼고, 오류 이벤트·transaction·span 에 가리기 규칙을 건다', async () => {
    await import('@/sentry.edge.config.js');

    const options = sentry.init.mock.calls[0]?.[0] as {
      integrations: (defaults: Array<{ name: string }>) => Array<{ name: string }>;
      beforeSend: (event: Record<string, unknown>) => unknown;
      beforeSendTransaction: (event: Record<string, unknown>) => unknown;
      beforeSendSpan: (span: Record<string, unknown>) => unknown;
    };

    expect(options.integrations([{ name: 'Dedupe' }, { name: 'Console' }, { name: 'WinterCGFetch' }])).toEqual([
      { name: 'Dedupe' },
      { name: 'WinterCGFetch' },
    ]);

    const event = { contexts: { nextjs: { request_path: '/api/x?code=SECRET' } } };
    expect(options.beforeSend(event)).toBe(event);
    expect(event.contexts.nextjs.request_path).toBe('/api/x');

    const transaction = { type: 'transaction', transaction: 'middleware GET /ko/vote?code=SECRET' };
    options.beforeSendTransaction(transaction);
    expect(transaction.transaction).toBe('middleware GET /ko/vote');

    const span = { description: 'GET https://x.supabase.co/auth/v1/user?token=SECRET' };
    options.beforeSendSpan(span);
    expect(span.description).toBe('GET https://x.supabase.co/auth/v1/user');
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/sentry-server-config.test.ts __tests__/sentry-edge-config.test.ts`
Expected: FAIL — 서버: `expected [ …array ] to be type function`(integrations 가 배열), `beforeSendTransaction` 이 없다. edge: `options.integrations is not a function`

- [ ] **Step 3: 구현한다**

`sentry.server.config.js` — import 를 바꾼다:

```js
import * as Sentry from '@sentry/nextjs';
import { REQUEST_DATA_INCLUDE, resolveTracesSampleRate, withoutConsole } from './lib/sentry/collection';
import { scrubEvent, scrubSpan } from './lib/sentry/scrub';
```

`sentry.server.config.js` — `integrations` 를 함수 형태로 바꾼다(`Sentry.httpIntegration({…})` 블록의 내용과 들여쓰기는 그대로 둔다):

```js
    // Integrations for server-side.
    // 함수 형태로 받아 기본 목록에서 Console 을 뺀다. 같은 이름의 integration 은 뒤에 온 것이 기본 것을 대신한다.
    integrations: (defaults) => [
      // 서버의 console 출력은 Vercel 로그에 이미 있다. breadcrumb 로 다시 싣지 않는다.
      ...withoutConsole(defaults),
      // HTTP integration for tracking HTTP requests
      // ignoreIncomingRequests / ignoreOutgoingRequests 는 HttpOptions 의
      // 최상위 옵션이다. tracing 하위에 두면 SDK 가 읽지 않아 필터가
      // 통째로 무시된다(@sentry/node 9.x HttpOptions 참조).
      Sentry.httpIntegration({
        // Don't track requests to health check endpoints
        ignoreIncomingRequests: (url) => {
          return url.includes('/api/health') ||
                 url.includes('/api/ping') ||
                 url.includes('/_next/static') ||
                 url.includes('/favicon.ico');
        },
        // Don't track outgoing requests to certain domains
        ignoreOutgoingRequests: (url) => {
          return url.includes('sentry.io');
        },
      }),
      // 기본값은 쿠키·헤더·쿼리·본문을 이벤트에 붙인다(sendDefaultPii 와 무관하다). url 만 남긴다.
      Sentry.requestDataIntegration({ include: REQUEST_DATA_INCLUDE }),
    ],
```

`sentry.server.config.js` — `beforeSend` 의 마지막 `return event;` 를 바꾸고, `beforeSend` 블록 바로 아래에 훅 두 개를 추가한다:

```js
      // 요청 데이터, URL 쿼리, 토큰 모양 값을 지운다(lib/sentry/scrub.ts).
      return scrubEvent(event);
    },

    // transaction 과 span 에도 같은 규칙을 건다. 쿼리는 http.target·url.full·url.query 같은 속성으로도 실린다.
    beforeSendTransaction: scrubEvent,
    beforeSendSpan: scrubSpan,
```

`sentry.edge.config.js` — import 를 추가한다:

```js
import * as Sentry from '@sentry/nextjs';
import { withoutConsole } from './lib/sentry/collection';
import { scrubEvent, scrubSpan } from './lib/sentry/scrub';
```

`sentry.edge.config.js` — `integrations` 를 바꾼다:

```js
      // 기본 integration 에서 Console 만 뺀다. edge 의 기본 목록에는 RequestData 가 없다
      // (sendDefaultPii 를 켜지 않는 한). __tests__/lib/sentry/collection.test.ts 가 고정한다.
      integrations: (defaults) => withoutConsole(defaults),
```

`sentry.edge.config.js` — `beforeSend` 의 `return event;` 를 바꾸고 훅 두 개를 추가한다:

```js
        // URL 쿼리와 토큰 모양 값을 지운다(lib/sentry/scrub.ts). 서버와 같은 함수다.
        return scrubEvent(event);
      },

      // 트레이싱을 켜지 않으므로 평소에는 불리지 않는다. SDK 가 SENTRY_TRACES_SAMPLE_RATE 를 스스로 읽어
      // 표본이 켜지는 경우(envelope 테스트)에 대비한다.
      beforeSendTransaction: scrubEvent,
      beforeSendSpan: scrubSpan,
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/sentry-server-config.test.ts __tests__/sentry-edge-config.test.ts __tests__/sentry-config-contract.test.ts __tests__/lib/sentry`
Expected: PASS. 계약 테스트의 `^\s{8}ignoreIncomingRequests:` 도 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add sentry.server.config.js sentry.edge.config.js __tests__/sentry-server-config.test.ts __tests__/sentry-edge-config.test.ts
git commit -m "fix(sentry): 서버·edge 이벤트에 쿠키·헤더·쿼리와 console breadcrumb 을 싣지 않는다"
```

- [ ] **Step 6: envelope 테스트가 통과하는 것을 본다 (green)**

Run: `npm run test:envelope 2>&1 | tee /tmp/envelope-green.log; git status --short`
Expected: 종료 코드 0, `[envelope] 통과`. 건수는 Task 4 의 red 와 같다. `git status --short` 가 비어 있다. (실제: 첫 green 실행은 "예상하지 않은 tripwire" 2건으로 실패했다. 순회가 `sdkProcessingMetadata` 를 건드린 것이 원인이었고, 단위 테스트로 재현해 고친 뒤 통과했다.)

실패하면 `.next-envtest/envelope-test/report.json` 의 경로를 보고 `lib/sentry/scrub.ts` 와 그 단위 테스트에 사례를 먼저 더한 뒤 고친다. 테스트의 기대를 느슨하게 하지 않는다.

### Task 7: 전체 검증, 설계서 보강, PR

- [ ] **Step 1: 전체 검사를 돌린다**

```bash
npx tsc --noEmit && npm run lint && npm test && TZ=UTC npm test
```

Expected: 전부 통과. 테스트 수는 Task 0 의 기준선 + 새 테스트 수.

- [ ] **Step 2: 보통 빌드에 테스트 라우트가 없는지 확인한다**

```bash
SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN= npm run build 2>&1 | tail -30
grep -c "envelope-test" .next/app-path-routes-manifest.json
git checkout -- public/ && git status --short
```

Expected: 빌드 성공, `[rendering-modes] 통과`, `[test-routes] 통과: 라우트 N개 가운데 테스트용 라우트가 없다.`, `grep -c` 는 `0`, `git status --short` 가 비어 있다.

- [ ] **Step 3: 운영 환경변수에 `SENTRY_TRACES_SAMPLE_RATE` 가 없는지 확인한다**

Run: `vercel env ls production 2>/dev/null | grep -c SENTRY_TRACES_SAMPLE_RATE` (이름만 본다. 값을 풀지 않는다)
Expected: `0`

- [ ] **Step 4: 설계서를 보강한다 (`docs/log-redaction-design` 브랜치, PR #116)**

"설계에서 구체화한 것" 의 항목을 설계서 §4.1·§4.5·§4.7·§5.1 에 반영하고, §10.4 에 한 줄씩 적는다. red·green 실행의 건수와 실패 목록 요약을 §8 의 "확인한 사실" 에 넣는다.

- [ ] **Step 5: PR 을 만든다**

```bash
git push -u origin fix/sentry-collection-scope
gh pr create --title "fix(sentry): 서버·edge 이벤트에 쿠키·헤더·쿼리와 console breadcrumb 을 싣지 않는다" --body-file <본문 파일>
```

본문에 넣을 것: 무엇이 나가고 있었나(§2.1 요약), 바꾼 것, envelope 테스트의 수정 전·후 결과, 남는 것(§6.1 의 PR 1 행), 머지 뒤 확인 방법(§6.2), 위험과 롤백.

- [ ] **Step 6: Codex 고위험 리뷰를 받는다**

사용량 게이트(`route-fresh.sh auto high auto auto`) → capability → `build-launch.sh reviewer` → Orca 터미널 → 지시서(요구사항, diff, 관련 파일, 테스트 결과만) → 판정. 지적은 코드와 테스트로 확인해 고치거나 반박하고 같은 리뷰어가 한 번 재검증한다.

---

# Part B — PR 1b: 민감 로그 줄 삭제 (`fix/remove-sensitive-log-lines`)

PR 1 과 겹치는 파일이 없다. `origin/main` 에서 따로 가지를 친다.

### Task 8: 콜백 라우트가 URL·쿼리·토큰을 찍지 않는다

**Files:**
- Modify: `app/api/auth/v1/callback/route.ts` (14·15·42행 삭제), `app/api/payment/portone/callback/route.ts` (19·20·37~39·46·55행 삭제), `app/api/payment/toss/result/route.ts` (25·26·32~36·51행 삭제)
- Test: `__tests__/api/callback-log-redaction.test.ts`

설계 §2.2 는 portone 콜백의 19~20·37~39행과 toss 의 25~36행을 적었다. 리다이렉트 URL 을 찍는 줄(portone 46·55, toss 51)도 같은 값을 담으므로 함께 지운다. `No paymentId or token found` 같은 고정 문구의 경고는 남긴다.

- [ ] **Step 1: 워크트리**

```bash
git -C ~/Repositories/picnic-web worktree add ../picnic-web-sensitive-log-lines -b fix/remove-sensitive-log-lines origin/main
cp ~/Repositories/picnic-web/.env.local ~/Repositories/picnic-web/.env.vercel ~/Repositories/picnic-web-sensitive-log-lines/
cd ~/Repositories/picnic-web-sensitive-log-lines && npm ci --no-audit --no-fund
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

<!-- file: __tests__/api/callback-log-redaction.test.ts -->
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/utils/log-error', () => ({ logError: vi.fn() }));

import { GET as authCallbackProxy } from '@/app/api/auth/v1/callback/route';
import { GET as portoneCallback } from '@/app/api/payment/portone/callback/route';
import { GET as tossResult } from '@/app/api/payment/toss/result/route';

const CODE = 'cnry-oauth-code-1a2b3c';
const STATE = 'cnry-oauth-state-4d5e6f';
const TOSS_TOKEN = 'cnry-toss-token-7a8b9c';
const PG_TOKEN = 'cnry-pg-token-0d1e2f';
const PAYMENT_ID = 'cnry-payment-3a4b5c';

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

/** 서버 표준 출력(=Vercel 로그)으로 나간 것을 한 문자열로 모은다. */
function captureConsole(): () => string {
  const spies = LEVELS.map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
  return () =>
    spies
      .flatMap((spy) => spy.mock.calls)
      .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
      .join('\n');
}

const request = (path: string) => new NextRequest(`https://www.picnic.fan${path}`);

describe('콜백 라우트는 URL·쿼리·토큰을 로그에 찍지 않는다', () => {
  let output: () => string;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.picnic.fan');
    output = captureConsole();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('OAuth 콜백 프록시: code 와 state 를 그대로 넘기되 찍지 않는다', async () => {
    const res = await authCallbackProxy(request(`/api/auth/v1/callback?code=${CODE}&state=${STATE}&provider=apple`));

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/auth/callback/apple?code=${CODE}&state=${STATE}&provider=apple`,
    );
    expect(output()).not.toContain(CODE);
    expect(output()).not.toContain(STATE);
    expect(output()).toBe('');
  });

  it('PortOne 콜백: paymentId 를 넘기되 찍지 않는다', async () => {
    const res = await portoneCallback(request(`/api/payment/portone/callback?paymentId=${PAYMENT_ID}&returnTo=/ko/star-candy`));

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/ko/star-candy?paymentId=${PAYMENT_ID}&status=success`,
    );
    expect(output()).toBe('');
  });

  it('PortOne 콜백: 토스 토큰을 넘기되 찍지 않는다', async () => {
    const res = await portoneCallback(request(`/api/payment/portone/callback?token=${TOSS_TOKEN}&pg_token=${PG_TOKEN}`));

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/ko/star-candy?toss_token=${TOSS_TOKEN}&pg_token=${PG_TOKEN}&status=processing`,
    );
    expect(output()).toBe('');
  });

  it('PortOne 콜백: 값이 없을 때의 고정 문구 경고는 남는다', async () => {
    const res = await portoneCallback(request('/api/payment/portone/callback?returnTo=/ko/star-candy&x=1'));

    expect(res.headers.get('location')).toBe('https://www.picnic.fan/ko/star-candy');
    expect(output()).toBe('[Callback] No paymentId or token found in callback URL');
  });

  it('토스 결과: 토큰을 넘기되 찍지 않는다', async () => {
    const res = await tossResult(
      request(`/api/payment/toss/result?token=${TOSS_TOKEN}&pg_token=${PG_TOKEN}&payment_method_type=CARD`),
    );

    expect(res.headers.get('location')).toBe(
      `https://www.picnic.fan/ko/star-candy?toss_token=${TOSS_TOKEN}&status=processing`,
    );
    expect(output()).toBe('');
  });

  it('토스 결과: 토큰이 없을 때의 고정 문구 경고는 남는다', async () => {
    await tossResult(request('/api/payment/toss/result?payment_method_type=CARD'));
    expect(output()).toBe('[Toss Result] No token found in callback URL');
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run __tests__/api/callback-log-redaction.test.ts`
Expected: FAIL — 네 건이 `expected '🔐 OAuth 콜백 수신: https://…' to be ''` 처럼 실패한다. 리다이렉트 주소 단언은 통과한다(동작은 그대로다). 고정 문구 경고 두 건은 URL 을 찍는 줄 때문에 실패한다.

- [ ] **Step 4: 로그 줄을 지운다**

`app/api/auth/v1/callback/route.ts` — 삭제:

```ts
    console.log("🔐 OAuth 콜백 수신:", request.url);
    console.log("🔐 쿼리 파라미터:", Object.fromEntries(searchParams.entries()));
```

```ts
    console.log("🔐 OAuth 콜백 프록시 리다이렉트:", redirectUrl);
```

`app/api/payment/portone/callback/route.ts` — 삭제:

```ts
    console.log('[Callback] Full URL:', url.toString());
    console.log('[Callback] Search params:', Object.fromEntries(url.searchParams.entries()));
```

```ts
    console.log('[Callback] Extracted paymentId:', paymentId);
    console.log('[Callback] Extracted tossToken:', tossToken);
    console.log('[Callback] Extracted pgToken:', pgToken);
```

```ts
      console.log('[Callback] Redirecting to:', redirectUrl.toString());
```

```ts
      console.log('[Callback] Redirecting with Toss token:', redirectUrl.toString());
```

`app/api/payment/toss/result/route.ts` — 삭제:

```ts
    console.log('[Toss Result] Full URL:', url.toString());
    console.log('[Toss Result] Search params:', Object.fromEntries(url.searchParams.entries()));
```

```ts
    console.log('[Toss Result] Extracted params:', {
      token,
      pgToken,
      paymentMethodType,
    });
```

```ts
      console.log('[Toss Result] Redirecting to:', redirectUrl.toString());
```

지운 뒤 쓰이지 않게 되는 지역 변수(`toss/result` 의 `pgToken`, `paymentMethodType`)도 지운다. `npm run lint` 와 `npx tsc --noEmit` 로 확인한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run __tests__/api/callback-log-redaction.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS (6건)

- [ ] **Step 6: 커밋**

```bash
git add app/api/auth/v1/callback/route.ts app/api/payment/portone/callback/route.ts app/api/payment/toss/result/route.ts __tests__/api/callback-log-redaction.test.ts
git commit -m "fix(logging): OAuth·결제 콜백이 URL·쿼리·토큰을 로그에 찍지 않는다"
```

### Task 9: 웹훅이 받은 본문을 응답으로 되돌려주지 않는다

**Files:**
- Modify: `app/api/payment/portone/webhook/route.ts:104-107`
- Test: `__tests__/api/payment/portone-webhook-contract.test.ts` (`describe('PortOne webhook — 현재 계약', …)` 안에 추가)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`서명이 틀리면 401, PortOne 조회·적립 0` 테스트 아래에 추가:

```ts
  it('paymentId 가 없으면 400 이고, 받은 본문을 응답으로 되돌려주지 않는다', async () => {
    const res = await POST(webhook({ status: 'PAID', customer: { email: 'buyer@example.com' }, memo: 'cnry-webhook-body' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing paymentId' });
    expect(mocks.verifyPortOnePayment).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run __tests__/api/payment/portone-webhook-contract.test.ts`
Expected: FAIL — 응답에 `receivedBody: { status: 'PAID', customer: {…}, memo: 'cnry-webhook-body' }` 가 있다. `it.fails` 6건은 그대로다.

- [ ] **Step 3: 구현한다**

```ts
      return NextResponse.json(
        { error: 'Missing paymentId' },
        { status: 400 }
      );
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run __tests__/api/payment`
Expected: PASS. `it.fails` 6건은 여전히 "실패가 기대되는" 상태로 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add app/api/payment/portone/webhook/route.ts __tests__/api/payment/portone-webhook-contract.test.ts
git commit -m "fix(payment): PortOne 웹훅이 받은 본문을 400 응답에 되돌려주지 않는다"
```

### Task 10: 검증과 PR

- [ ] **Step 1: 전체 검사**

Run: `npx tsc --noEmit && npm run lint && npm test && TZ=UTC npm test`
Expected: 전부 통과

- [ ] **Step 2: 남은 줄을 확인한다**

Run: `grep -n "console\." app/api/auth/v1/callback/route.ts app/api/payment/portone/callback/route.ts app/api/payment/toss/result/route.ts`
Expected: 고정 문구의 `console.warn` 두 줄만 남는다.

- [ ] **Step 3: PR 을 만들고 Codex 고위험 리뷰를 받는다**

```bash
git push -u origin fix/remove-sensitive-log-lines
gh pr create --title "fix(logging): 콜백의 URL·토큰 로그와 웹훅의 본문 에코를 지운다" --body-file <본문 파일>
```

본문에 넣을 것: 지운 줄의 목록과 등급, 동작이 그대로라는 근거(리다이렉트 주소 단언), 남는 것(웹훅 400 응답의 `customerEmail`·500 응답의 `error.message` 는 PR 4 의 전수 조사에서 다룬다, PayPal 응답 통째 등 호출부가 넘기는 값은 PR 2~4).

---

## 머지 순서 (사용자 승인 뒤)

1. #116 (설계서와 이 계획. 문서만)
2. PR 1b — 작고 독립적이다. 지우는 `console.log` 줄은 운영 빌드가 이미 지우고 있어 Vercel 로그로는 차이를 볼 수 없다(실행 결과 참고). 머지 뒤에는 5xx 와 Sentry 신규 이슈가 없는지, 콜백 라우트의 응답(상태 코드, `Location`)이 머지 전과 같은지 본다.
3. PR 1 — 머지 뒤 Sentry 에서 새 릴리스의 서버 오류 이벤트와 transaction 을 열어 `request` 에 `url`·`method` 만 있는지, breadcrumb 에 `console` 범주가 없는지, `redaction.tripwire` 태그가 붙은 이벤트가 있는지 본다(§6.2).

## Self-Review

- **설계 대비.** §4.1(수집 축소, URL·쿼리 규칙, edge) → Task 3·5·6. §4.5(tripwire) → Task 5. §4.7 의 처리되지 않은 예외(메시지 규칙, `request_path`, `vars` 없음, 테스트 라우트의 빌드 분리와 운영 산출물 검사) → Task 1·4·5·6. §5.1(실제 Next 요청, 표본 강제, 건수 단언, 두 canary 묶음, 수정 전 실패 확인) → Task 2·3·4·6. §4.4(`receivedBody`)와 §4.2 의 "먼저 지울 수 있는 줄" → Task 8·9. §4.2 의 계약 함수, §4.3 의 전달, §4.7 의 경계 함수, lint 규칙은 PR 2~4 라 이 계획에 없다.
- **경계 함수로 감싼 테스트 요청.** §5.1 은 감싼 것과 감싸지 않은 것 둘을 요구한다. 경계 함수(`withSafeErrors`)는 PR 2 에서 생기므로 감싼 요청은 PR 2 가 이 시나리오에 더한다. PR 1 의 시나리오에는 감싸지 않은 것(node, edge)만 있다.
- **이름.** `scrubEvent`·`scrubSpan`·`stripUrlQueries`·`redactTokenShapes`·`TRIPWIRE_KEY`(`lib/sentry/scrub.ts`), `REQUEST_DATA_INCLUDE`·`withoutConsole`·`resolveTracesSampleRate`(`lib/sentry/collection.ts`), `parseEnvelope`·`evaluate`·`countsSatisfied`(`analyze.js`), `nextConfigOverrides`·`findTestRoutes`·`TEST_DIST_DIR`(`build-switch.js`), `CANARIES`·`EXPECTED`·`REPEAT`·`UNHANDLED_LINE_MARKER`·`buildRequests`(`scenario.js`) — 작업 사이에 같은 이름으로 쓰인다.
