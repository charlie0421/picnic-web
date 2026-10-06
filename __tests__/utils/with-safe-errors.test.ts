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
