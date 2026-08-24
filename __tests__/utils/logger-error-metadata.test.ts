import { describe, it, expect, vi } from 'vitest';
import { Logger, LogLevel } from '@/utils/logger';
import type { LogEntry, LogTarget } from '@/utils/logger-types';

function capture() {
  const entries: LogEntry[] = [];
  const target: LogTarget = { name: 'test', write: vi.fn(async (e: LogEntry) => { entries.push(e); }) };
  return { entries, logger: new Logger({ environment: 'test', targets: [target] }) };
}

class AuthApiError extends Error {
  status: number; code: string;
  constructor(message: string) { super(message); this.name = 'AuthApiError'; this.status = 401; this.code = 'bad_jwt'; }
}

describe('Logger — Error 하위 클래스의 진단 메타데이터', () => {
  it('Error 의 추가 필드를 보존한다', async () => {
    const { entries, logger } = capture();
    await logger.error('인증 실패', new AuthApiError('invalid token'));

    const payload = JSON.stringify(entries[0]);
    // console.error 가 보여주던 진단 정보가 사라지면 안 된다.
    expect(payload).toContain('401');
    expect(payload).toContain('bad_jwt');
  });

  it('기본 필드는 그대로 유지한다', async () => {
    const { entries, logger } = capture();
    await logger.error('실패', new AuthApiError('invalid token'));

    expect(entries[0].error?.name).toBe('AuthApiError');
    expect(entries[0].error?.message).toBe('invalid token');
    expect(entries[0].error?.stack).toBeTruthy();
  });

  it('평범한 Error 에는 불필요한 필드를 만들지 않는다', async () => {
    const { entries, logger } = capture();
    await logger.error('실패', new Error('plain'));

    expect(entries[0].error?.name).toBe('Error');
    expect((entries[0].error as any)?.details).toBeUndefined();
  });

  it('cause 를 보존한다', async () => {
    const { entries, logger } = capture();
    const err = new Error('wrapper', { cause: new Error('root cause detail') });
    await logger.error('실패', err);

    expect(JSON.stringify(entries[0])).toContain('root cause detail');
  });

  it('getter 가 throw 하는 Error 여도 로그를 유실하지 않는다', async () => {
    const { entries, logger } = capture();
    const err = new Error('boom');
    Object.defineProperty(err, 'evil', { get() { throw new Error('x'); }, enumerable: true });

    await expect(logger.error('실패', err)).resolves.not.toThrow();
    expect(entries).toHaveLength(1);
    expect(entries[0].error?.message).toBe('boom');
  });

  it('순환 참조가 있는 Error 여도 throw 하지 않는다', async () => {
    const { entries, logger } = capture();
    const err: any = new Error('boom');
    err.self = err;

    await expect(logger.error('실패', err)).resolves.not.toThrow();
    expect(entries).toHaveLength(1);
  });
});
