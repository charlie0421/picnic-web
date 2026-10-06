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

import { DynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { notFound, redirect } from 'next/navigation';

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
