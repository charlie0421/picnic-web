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

import { DynamicServerError, isDynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { isHTTPAccessFallbackError } from 'next/dist/client/components/http-access-fallback/http-access-fallback';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { unstable_rethrow as nextRethrow } from 'next/dist/client/components/unstable-rethrow.server';
import { isDynamicPostpone } from 'next/dist/server/app-render/dynamic-rendering';
import { isHangingPromiseRejectionError } from 'next/dist/server/dynamic-rendering-utils';
import { isPostpone } from 'next/dist/server/lib/router-utils/is-postpone';
import { BailoutToCSRError, isBailoutToCSRError } from 'next/dist/shared/lib/lazy-dynamic/bailout-to-csr';
import { forbidden, notFound, permanentRedirect, redirect, unauthorized, unstable_rethrow } from 'next/navigation';

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

    it('cause 사슬 안의 redirect() 는 Next 가 하듯 그것을 올려보낸다', async () => {
      const signal = caught(() => redirect('/login'));
      const wrapped = new Error('wrapped', { cause: new Error('middle', { cause: signal }) });

      await expect(
        withSafeErrors('envtest.boundary.unhandled', async () => {
          throw wrapped;
        })(),
      ).rejects.toBe(signal);

      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('Next 의 제어 흐름', () => {
    it.each([
      ['redirect()', () => caught(() => redirect('/login'))],
      ['notFound()', () => caught(() => notFound())],
      ['동적 렌더링 신호', () => new DynamicServerError('cnry dynamic')],
    ])('%s 는 오류로 다루지 않고 그대로 올려보낸다', async (_label, make) => {
      const signal = make();

      await expect(
        withSafeErrors('envtest.boundary.unhandled', async () => {
          throw signal;
        })(),
      ).rejects.toBe(signal);

      expect(consoleError).not.toHaveBeenCalled();
      expect(mocks.after).not.toHaveBeenCalled();
    });

    // unstable_rethrow 가 올려보내는 신호의 계열 전부. 값은 Next·React 가 실제로 던지는 것이고, 어느 계열인지는 Next 의 판정 함수로 확인한다.
    it.each<[string, (value: unknown) => boolean, () => unknown]>([
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
    ])('Next 가 %s 로 판정하는 값은 그대로 올려보낸다', async (_label, isFamily, make) => {
      const signal = await make();
      // 이 값은 Next 의 판정에서 정확히 이 계열 하나다. 다른 계열의 속성에 기대어 통과하지 않는다.
      expect(NEXT_SIGNAL_FAMILIES.filter((matches) => matches(signal))).toEqual([isFamily]);

      await expect(
        withSafeErrors('envtest.boundary.unhandled', async () => {
          throw signal;
        })(),
      ).rejects.toBe(signal);

      expect(consoleError).not.toHaveBeenCalled();
      expect(mocks.after).not.toHaveBeenCalled();
    });

    it('기록을 남긴 뒤 redirect() 해도 flush 는 건다', async () => {
      const signal = caught(() => redirect('/login'));

      await expect(
        withSafeErrors('envtest.boundary.unhandled', async () => {
          logSafeError('envtest.boundary.handled', new Error('x'));
          throw signal;
        })(),
      ).rejects.toBe(signal);

      expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    // 경계는 던진 값을 unstable_rethrow 에 바로 넘기지 않고, 판정이 읽는 속성만 옮겨 담아 넘긴다.
    // Next 가 다른 속성을 읽기 시작하면 여기서 먼저 알린다.
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
