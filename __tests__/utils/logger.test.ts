import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase server client before importing
vi.mock('@/utils/supabase-server-client', () => ({
  createServerActionClient: vi.fn().mockResolvedValue({
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

vi.mock('@/utils/error', () => ({
  AppError: class AppError extends Error {
    category: string;
    severity: string;
    statusCode: number;
    isRetryable: boolean;
    context?: any;
    constructor(message: string, category = 'unknown', severity = 'medium', statusCode = 500, options: any = {}) {
      super(message);
      this.name = 'AppError';
      this.category = category;
      this.severity = severity;
      this.statusCode = statusCode;
      this.isRetryable = options.isRetryable ?? false;
      this.context = options.context;
    }
    toLogData() {
      return { name: this.name, message: this.message, category: this.category };
    }
  },
  ErrorSeverity: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical',
  },
}));

import { Logger, LogLevel, logger } from '@/utils/logger';
import { ConsoleLogTarget, ExternalMonitoringTarget } from '@/utils/logger-targets';
import type { LogEntry, LogTarget } from '@/utils/logger-types';
import { PerformanceTimer, startTimer, withLogging } from '@/utils/logger-utils';

describe('LogLevel', () => {
  it('has DEBUG level', () => {
    expect(LogLevel.DEBUG).toBe('debug');
  });

  it('has INFO level', () => {
    expect(LogLevel.INFO).toBe('info');
  });

  it('has WARN level', () => {
    expect(LogLevel.WARN).toBe('warn');
  });

  it('has ERROR level', () => {
    expect(LogLevel.ERROR).toBe('error');
  });

  it('has FATAL level', () => {
    expect(LogLevel.FATAL).toBe('fatal');
  });
});

describe('Logger', () => {
  let mockTarget: LogTarget;
  let loggerInstance: Logger;

  beforeEach(() => {
    mockTarget = {
      name: 'mock',
      write: vi.fn().mockResolvedValue(undefined),
    };
    loggerInstance = new Logger({
      environment: 'test',
      service: 'test-service',
      version: '1.0.0',
      targets: [mockTarget],
    });
  });

  describe('constructor', () => {
    it('creates logger with default values', () => {
      const defaultLogger = new Logger();
      expect(defaultLogger).toBeDefined();
    });

    it('creates logger with custom options', () => {
      expect(loggerInstance).toBeDefined();
    });
  });

  describe('addTarget', () => {
    it('adds a new log target', async () => {
      const newTarget: LogTarget = {
        name: 'new-target',
        write: vi.fn().mockResolvedValue(undefined),
      };
      loggerInstance.addTarget(newTarget);
      await loggerInstance.info('test message');
      expect(newTarget.write).toHaveBeenCalled();
    });
  });

  describe('removeTarget', () => {
    it('removes target by name', async () => {
      loggerInstance.removeTarget('mock');
      await loggerInstance.info('test');
      expect(mockTarget.write).not.toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('writes debug log in development environment', async () => {
      const devLogger = new Logger({
        environment: 'development',
        targets: [mockTarget],
      });
      await devLogger.debug('debug message');
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.DEBUG, message: 'debug message' }),
      );
    });

    it('does not write debug log in production', async () => {
      const prodLogger = new Logger({
        environment: 'production',
        targets: [mockTarget],
      });
      await prodLogger.debug('debug message');
      expect(mockTarget.write).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('writes info log entry', async () => {
      await loggerInstance.info('info message', { key: 'value' });
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: 'info message',
          context: { key: 'value' },
          environment: 'test',
          service: 'test-service',
        }),
      );
    });

    it('includes timestamp in log entry', async () => {
      await loggerInstance.info('test');
      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.timestamp).toBeDefined();
      expect(new Date(call.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('warn', () => {
    it('writes warn log entry', async () => {
      await loggerInstance.warn('warning message');
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.WARN, message: 'warning message' }),
      );
    });
  });

  describe('error', () => {
    it('writes error log entry', async () => {
      const error = new Error('something broke');
      await loggerInstance.error('error message', error);
      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.level).toBe(LogLevel.ERROR);
      expect(call.error).toBeDefined();
      expect(call.error!.name).toBe('Error');
      expect(call.error!.message).toBe('something broke');
    });

    it('includes user information when provided', async () => {
      await loggerInstance.error('error', undefined, undefined, { id: 'user-1', email: 'test@test.com' });
      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.user).toEqual({ id: 'user-1', email: 'test@test.com' });
    });

    it('includes request information when provided', async () => {
      await loggerInstance.error('error', undefined, undefined, undefined, {
        method: 'GET',
        url: '/api/test',
      });
      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.request).toEqual({ method: 'GET', url: '/api/test' });
    });
  });

  describe('fatal', () => {
    it('writes fatal log entry', async () => {
      await loggerInstance.fatal('fatal error');
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.FATAL, message: 'fatal error' }),
      );
    });
  });

  describe('logAppError', () => {
    it('logs AppError with enhanced context', async () => {
      const { AppError } = await import('@/utils/error');
      const appError = new AppError('test error', 'server', 'high', 500);
      await loggerInstance.logAppError(appError as any);
      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.message).toContain('server');
      expect(call.message).toContain('test error');
      expect(call.context).toHaveProperty('category', 'server');
    });
  });
});

describe('ConsoleLogTarget', () => {
  let target: ConsoleLogTarget;
  let consoleSpy: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    target = new ConsoleLogTarget();
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  const makeEntry = (level: LogLevel): LogEntry => ({
    timestamp: new Date().toISOString(),
    level,
    message: 'test message',
    environment: 'test',
    service: 'test',
  });

  it('has name "console"', () => {
    expect(target.name).toBe('console');
  });

  it('calls console.debug for DEBUG level', async () => {
    await target.write(makeEntry(LogLevel.DEBUG));
    expect(consoleSpy.debug).toHaveBeenCalled();
  });

  it('calls console.info for INFO level', async () => {
    await target.write(makeEntry(LogLevel.INFO));
    expect(consoleSpy.info).toHaveBeenCalled();
  });

  it('calls console.warn for WARN level', async () => {
    await target.write(makeEntry(LogLevel.WARN));
    expect(consoleSpy.warn).toHaveBeenCalled();
  });

  it('calls console.error for ERROR level', async () => {
    await target.write(makeEntry(LogLevel.ERROR));
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  it('calls console.error for FATAL level', async () => {
    await target.write(makeEntry(LogLevel.FATAL));
    expect(consoleSpy.error).toHaveBeenCalled();
  });
});

describe('ExternalMonitoringTarget', () => {
  it('has name "external"', () => {
    const target = new ExternalMonitoringTarget();
    expect(target.name).toBe('external');
  });

  it('does not throw for non-error level logs', async () => {
    const target = new ExternalMonitoringTarget();
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      message: 'info',
      environment: 'test',
      service: 'test',
    };
    await expect(target.write(entry)).resolves.not.toThrow();
  });
});

describe('logger-utils', () => {
  describe('PerformanceTimer', () => {
    it('records duration on end', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const timer = new PerformanceTimer('test-op', testLogger);

      const duration = await timer.end();
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('test-op'),
        }),
      );
    });

    it('records duration on endWithError', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const timer = new PerformanceTimer('failing-op', testLogger);

      const duration = await timer.endWithError(new Error('oops'));
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.ERROR,
          message: expect.stringContaining('failing-op'),
        }),
      );
    });
  });

  describe('startTimer', () => {
    it('returns a PerformanceTimer instance', () => {
      const timer = startTimer('test');
      expect(timer).toBeInstanceOf(PerformanceTimer);
    });
  });

  describe('withLogging', () => {
    it('wraps function and logs success', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const fn = vi.fn().mockResolvedValue('result');

      const wrapped = withLogging(fn, 'test-fn', testLogger);
      const result = await wrapped();

      expect(result).toBe('result');
      expect(mockTarget.write).toHaveBeenCalled();
    });

    it('wraps function and logs error on failure', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const fn = vi.fn().mockRejectedValue(new Error('failed'));

      const wrapped = withLogging(fn, 'failing-fn', testLogger);
      await expect(wrapped()).rejects.toThrow('failed');
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.ERROR }),
      );
    });
  });
});

describe('global logger instance', () => {
  it('is an instance of Logger', () => {
    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(Logger);
  });
});

describe('logger-utils (additional branches)', () => {
  describe('createRequestLogger', () => {
    it('creates a logger from a Request object', async () => {
      const { createRequestLogger } = await import('@/utils/logger-utils');
      const request = new Request('https://example.com/api/test?q=1', {
        method: 'POST',
        headers: {
          'user-agent': 'TestBrowser/1.0',
          'x-forwarded-for': '1.2.3.4',
        },
      });

      const reqLogger = createRequestLogger(request);
      expect(reqLogger).toBeDefined();
      expect(typeof reqLogger.error).toBe('function');
      expect(typeof reqLogger.fatal).toBe('function');
      expect(typeof reqLogger.logAppError).toBe('function');
    });

    it('overridden error method includes request context', async () => {
      const { createRequestLogger } = await import('@/utils/logger-utils');
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };

      const request = new Request('https://example.com/api/test', {
        method: 'GET',
        headers: { 'x-real-ip': '10.0.0.1' },
      });

      const reqLogger = createRequestLogger(request);
      reqLogger.addTarget(mockTarget);
      await reqLogger.error('test error', new Error('boom'));

      expect(mockTarget.write).toHaveBeenCalled();
    });

    it('overridden fatal method works', async () => {
      const { createRequestLogger } = await import('@/utils/logger-utils');
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };

      const request = new Request('https://example.com/api/fatal');
      const reqLogger = createRequestLogger(request);
      reqLogger.addTarget(mockTarget);

      await reqLogger.fatal('fatal error', new Error('critical'));
      expect(mockTarget.write).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.FATAL }),
      );
    });

    it('overridden logAppError method works', async () => {
      const { createRequestLogger } = await import('@/utils/logger-utils');
      const { AppError } = await import('@/utils/error');
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };

      const request = new Request('https://example.com/api/err');
      const reqLogger = createRequestLogger(request);
      reqLogger.addTarget(mockTarget);

      const appError = new AppError('app error', 'server', 'high', 500);
      await reqLogger.logAppError(appError as any);
      expect(mockTarget.write).toHaveBeenCalled();
    });
  });

  describe('PerformanceTimer (additional)', () => {
    it('uses default logger when none is provided', async () => {
      const timer = new PerformanceTimer('default-logger-op');
      // Should not throw
      const duration = await timer.end({ extra: 'data' });
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('endWithError passes context to logger', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const timer = new PerformanceTimer('ctx-op', testLogger);

      await timer.endWithError(new Error('fail'), { requestId: '123' });
      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.context).toHaveProperty('requestId', '123');
      expect(call.context).toHaveProperty('duration');
      expect(call.context).toHaveProperty('operation', 'ctx-op');
    });
  });

  describe('withLogging (additional)', () => {
    it('passes arguments to the wrapped function', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const fn = vi.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));

      const wrapped = withLogging(fn, 'add-fn', testLogger);
      const result = await wrapped(2, 3);

      expect(result).toBe(5);
      expect(fn).toHaveBeenCalledWith(2, 3);
    });

    it('logs args count in context', async () => {
      const mockTarget: LogTarget = { name: 'mock', write: vi.fn().mockResolvedValue(undefined) };
      const testLogger = new Logger({ targets: [mockTarget] });
      const fn = vi.fn().mockResolvedValue('ok');

      const wrapped = withLogging(fn, 'args-fn', testLogger);
      await wrapped('a', 'b', 'c');

      const call = (mockTarget.write as any).mock.calls[0][0] as LogEntry;
      expect(call.context).toHaveProperty('args', 3);
    });
  });
});
