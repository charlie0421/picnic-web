import { describe, it, expect, vi, beforeEach } from 'vitest';

const errorSpy = vi.fn();
vi.mock('@/utils/logger', () => ({
  logger: { error: (...a: unknown[]) => { errorSpy(...a); return Promise.resolve(); } },
}));

import { logError } from '@/utils/log-error';

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

  it('logger 가 reject 해도 throw 하지 않는다', () => {
    errorSpy.mockImplementationOnce(() => { throw new Error('logger down'); });
    expect(() => logError('boom')).not.toThrow();
  });

  it('두 번째 인자가 평범한 객체면 error 가 아니라 context 로 다룬다', () => {
    logError('불일치', { orderID: 'o1', authUserId: 'u1' });
    expect(errorSpy.mock.calls[0][1]).toBeUndefined();
    expect(errorSpy.mock.calls[0][2]).toEqual({ orderID: 'o1', authUserId: 'u1' });
  });

  it('객체를 Error 메시지로 직렬화하지 않는다 — 메시지는 redaction 대상이 아니다', () => {
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
    const evil: any = {};
    Object.defineProperty(evil, 'boom', { get() { throw new Error('getter throws'); }, enumerable: true });
    logError('결제 실패', evil);
    // 정제에 실패해도 최소한 메시지는 남아야 한다.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('결제 실패');
  });

  it('Vercel 요청 컨텍스트가 있으면 waitUntil 로 전송 완료를 보장한다', () => {
    const waitUntil = vi.fn();
    const key = Symbol.for('@vercel/request-context');
    (globalThis as any)[key] = { get: () => ({ waitUntil }) };
    try {
      logError('serverless 경로');
      expect(waitUntil).toHaveBeenCalledTimes(1);
      expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
    } finally {
      delete (globalThis as any)[key];
    }
  });

  it('요청 컨텍스트가 없어도 throw 하지 않는다', () => {
    expect(() => logError('상주 서버 경로')).not.toThrow();
  });
});
