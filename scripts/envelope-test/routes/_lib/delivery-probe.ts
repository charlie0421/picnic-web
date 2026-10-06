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
