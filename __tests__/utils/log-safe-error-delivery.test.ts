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
