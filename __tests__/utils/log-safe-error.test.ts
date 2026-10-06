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
