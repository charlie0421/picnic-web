import { describe, it, expect, vi, beforeEach } from 'vitest';

const errorSpy = vi.fn();
vi.mock('@/utils/logger', () => ({
  logger: { error: (...a: unknown[]) => { errorSpy(...a); return Promise.resolve(); } },
}));

import { logError } from '@/utils/log-error';

function throwingGetter() {
  const o: any = {};
  Object.defineProperty(o, 'boom', { get() { throw new Error('getter throws'); }, enumerable: true });
  return o;
}

describe('logError', () => {
  beforeEach(() => errorSpy.mockClear());

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
