import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureException = vi.fn();
const captureMessage = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

import { SentryLogTarget } from '@/utils/logger-targets';
import { LogLevel } from '@/utils/logger-types';
import type { LogEntry } from '@/utils/logger-types';

function entry(level: LogLevel, over: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: '2026-08-19T00:00:00.000Z',
    level,
    message: 'boom',
    environment: 'production',
    service: 'picnic-web',
    ...over,
  };
}

describe('SentryLogTarget', () => {
  beforeEach(() => {
    captureException.mockClear();
    captureMessage.mockClear();
  });

  it('sends ERROR level logs to Sentry as an exception', async () => {
    await new SentryLogTarget().write(entry(LogLevel.ERROR));

    expect(captureException).toHaveBeenCalledTimes(1);
    const [err] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('boom');
  });

  it('sends FATAL level logs to Sentry', async () => {
    await new SentryLogTarget().write(entry(LogLevel.FATAL));

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('does not send INFO or WARN level logs to Sentry', async () => {
    const target = new SentryLogTarget();
    await target.write(entry(LogLevel.INFO));
    await target.write(entry(LogLevel.WARN));

    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reuses the original error object so the stack trace survives', async () => {
    const original = new Error('original failure');
    await new SentryLogTarget().write(
      entry(LogLevel.ERROR, { error: { name: 'Error', message: 'original failure', stack: original.stack } }),
    );

    const [err] = captureException.mock.calls[0];
    expect((err as Error).stack).toBe(original.stack);
  });

  it('attaches service, environment and context to the Sentry event', async () => {
    await new SentryLogTarget().write(
      entry(LogLevel.ERROR, { context: { operation: 'vote-submit' }, user: { id: 'u1' } }),
    );

    const [, options] = captureException.mock.calls[0];
    expect((options as any).tags).toMatchObject({ service: 'picnic-web', environment: 'production' });
    expect((options as any).contexts.log).toMatchObject({ operation: 'vote-submit' });
    expect((options as any).user).toMatchObject({ id: 'u1' });
  });

  it('never throws when Sentry itself fails', async () => {
    captureException.mockImplementationOnce(() => { throw new Error('sentry down'); });

    await expect(new SentryLogTarget().write(entry(LogLevel.ERROR))).resolves.toBeUndefined();
  });

  it('원본 error 의 message 를 Sentry 이벤트에서 볼 수 있다', async () => {
    await new SentryLogTarget().write(
      entry(LogLevel.ERROR, {
        message: '인증 실패',
        error: { name: 'AuthApiError', message: 'invalid token', stack: 'Error: invalid token\n at x' },
      }),
    );
    // Error.message 는 non-enumerable 이라 JSON.stringify 로는 보이지 않는다.
    // Sentry 가 실제로 읽는 값을 직접 확인한다.
    const [err] = captureException.mock.calls[0];
    // 로그 메시지만 남고 원본 오류 메시지가 사라지면 Sentry 에서 원인을 알 수 없다.
    expect((err as Error).message).toContain('invalid token');
    expect((err as Error).message).toContain('인증 실패');
  });

  it('error.details 를 Sentry 컨텍스트로 전달한다', async () => {
    await new SentryLogTarget().write(
      entry(LogLevel.ERROR, {
        error: {
          name: 'AuthApiError',
          message: 'invalid token',
          details: { status: 401, code: 'bad_jwt' },
        },
      }),
    );
    const payload = JSON.stringify(captureException.mock.calls[0][1]);
    expect(payload).toContain('401');
    expect(payload).toContain('bad_jwt');
  });
});
