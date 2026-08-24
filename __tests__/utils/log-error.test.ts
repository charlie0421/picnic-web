import { describe, it, expect, vi, beforeEach } from 'vitest';

const errorSpy = vi.fn();
const warnSpy = vi.fn();
vi.mock('@/utils/logger', () => ({
  logger: {
    error: (...a: unknown[]) => { errorSpy(...a); return Promise.resolve(); },
    warn: (...a: unknown[]) => { warnSpy(...a); return Promise.resolve(); },
  },
}));

import { logError, logWarn } from '@/utils/log-error';

function throwingGetter() {
  const o: any = {};
  Object.defineProperty(o, 'boom', { get() { throw new Error('getter throws'); }, enumerable: true });
  return o;
}

describe('logError', () => {
  beforeEach(() => { errorSpy.mockClear(); warnSpy.mockClear(); });

  it('동기 함수다 — 반환값이 Promise 가 아니다', () => {
    expect(logError('boom')).toBeUndefined();
  });

  it('Error 객체를 그대로 넘긴다', () => {
    const e = new Error('original');
    logError('실패', e);
    expect(errorSpy.mock.calls[0][1]).toBe(e);
  });

  it('문자열 error 는 Error 로 감싼다', () => {
    logError('실패', 'PGRST116');
    const passed = errorSpy.mock.calls[0][1];
    expect(passed).toBeInstanceOf(Error);
    expect(String(passed)).toContain('PGRST116');
  });

  it('error 가 없으면 undefined 를 넘긴다', () => {
    logError('그냥 메시지');
    expect(errorSpy.mock.calls[0][1]).toBeUndefined();
  });

  it('context 를 그대로 전달한다', () => {
    logError('실패', undefined, { paymentId: 'p1' });
    expect(errorSpy.mock.calls[0][2]).toEqual({ paymentId: 'p1' });
  });

  it('logger 가 throw 해도 호출자에게 예외를 던지지 않는다', () => {
    errorSpy.mockImplementationOnce(() => { throw new Error('logger down'); });
    expect(() => logError('boom')).not.toThrow();
  });

  it('두 번째 인자가 평범한 객체면 error 가 아니라 context 로 다룬다', () => {
    logError('불일치', { orderID: 'o1', authUserId: 'u1' });
    expect(errorSpy.mock.calls[0][1]).toBeUndefined();
    expect(errorSpy.mock.calls[0][2]).toEqual({ orderID: 'o1', authUserId: 'u1' });
  });

  it('객체를 Error 메시지로 직렬화하지 않는다', () => {
    logError('불일치', { accessToken: 'leaked-token' });
    const [msg, err] = errorSpy.mock.calls[0];
    expect(String(msg)).not.toContain('leaked-token');
    expect(String(err ?? '')).not.toContain('leaked-token');
  });

  it('객체를 context 로 올릴 때 명시적 context 와 병합한다', () => {
    logError('실패', { a: 1 }, { b: 2 });
    expect(errorSpy.mock.calls[0][2]).toEqual({ a: 1, b: 2 });
  });

  it('getter 가 throw 하는 객체여도 로그를 유실하지 않는다', () => {
    logError('결제 실패', throwingGetter());
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('결제 실패');
  });

  it('error 와 context 양쪽에 throwing getter 가 있어도 예외를 던지지 않는다', () => {
    // fallback context 가 원본을 다시 spread 하면 여기서 throw 한다.
    expect(() => logError('결제 실패', throwingGetter(), throwingGetter())).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('logWarn', () => {
  beforeEach(() => { errorSpy.mockClear(); warnSpy.mockClear(); });

  it('logger.warn 을 호출한다 — error 가 아니다', () => {
    // SentryLogTarget 은 ERROR/FATAL 만 보낸다. 예상 가능한 4xx 를 warn 으로
    // 내려야 공개 엔드포인트가 익명 요청으로 Sentry quota 를 태우지 않는다.
    logWarn('[Webhook] signature 검증 실패');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('동기 함수다', () => {
    expect(logWarn('x')).toBeUndefined();
  });

  it('logError 와 같은 시그니처를 쓴다 — 객체는 context 로 승격한다', () => {
    logWarn('실패', { paymentId: 'p1' });
    expect(warnSpy.mock.calls[0][1]).toEqual({ paymentId: 'p1' });
  });

  it('Error 나 문자열도 받는다 — 전환 시 호출부를 고치지 않아도 된다', () => {
    logWarn('검증 실패', 'bad_jwt');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(() => logWarn('검증 실패', new Error('boom'))).not.toThrow();
  });

  it('getter 가 throw 해도 로그를 유실하지 않는다', () => {
    const o: any = {};
    Object.defineProperty(o, 'boom', { get() { throw new Error('x'); }, enumerable: true });
    logWarn('실패', o);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logger 가 throw 해도 예외를 던지지 않는다', () => {
    warnSpy.mockImplementationOnce(() => { throw new Error('down'); });
    expect(() => logWarn('x')).not.toThrow();
  });
});
