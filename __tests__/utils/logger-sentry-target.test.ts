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

  it('민감 헤더와 쿼리스트링을 제거한 뒤 전송한다', async () => {
    await new SentryLogTarget().write(
      entry(LogLevel.ERROR, {
        user: { id: 'u1', email: 'a@b.com' },
        request: {
          method: 'GET',
          url: '/api/user/profile?token=secret-value',
          ip: '203.0.113.9',
          headers: { authorization: 'Bearer leaked', accept: 'application/json' },
        },
        context: { operation: 'vote', accessToken: 'tok-leaked' },
      }),
    );

    const payload = JSON.stringify(captureException.mock.calls[0][1]);
    expect(payload).not.toContain('Bearer leaked');
    expect(payload).not.toContain('secret-value');
    expect(payload).not.toContain('tok-leaked');
    expect(payload).not.toContain('a@b.com');
    expect(payload).not.toContain('203.0.113.9');
    // 진단에 필요한 값은 남아야 한다
    expect(payload).toContain('u1');
    expect(payload).toContain('/api/user/profile');
    expect(payload).toContain('application/json');
  });
});
