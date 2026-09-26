import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVotePolling } from '@/components/client/vote/detail/useVotePolling';
import {
  getBrowserSafeTimerDelayMs,
  getVotePollingDelayMs,
} from '@/components/client/vote/detail/vote-polling-data';

const supabaseMocks = vi.hoisted(() => {
  const votePickReturns = vi.fn();
  const votePickAbortSignal = vi.fn();
  const votePickBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  votePickBuilder.select = vi.fn(() => votePickBuilder);
  votePickBuilder.eq = vi.fn(() => votePickBuilder);
  votePickBuilder.order = vi.fn(() => votePickBuilder);
  votePickBuilder.abortSignal = votePickAbortSignal.mockImplementation(() => votePickBuilder);
  votePickBuilder.returns = votePickReturns;

  return {
    authGetUser: vi.fn(),
    from: vi.fn(() => votePickBuilder),
    votePickAbortSignal,
    votePickReturns,
  };
});

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getUser: supabaseMocks.authGetUser },
    from: supabaseMocks.from,
  }),
}));

const baseVote = {
  id: 295,
  start_at: '2020-01-01T00:00:00.000Z',
  stop_at: '2099-01-01T00:00:00.000Z',
} as any;

const okResponse = () =>
  new Response(JSON.stringify({ vote: { ...baseVote, vote_item: [] }, rewards: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const errorResponse = () =>
  new Response(JSON.stringify({ error: 'temporary' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });

const abortablePendingResponse = (_input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const rejectWithAbort = () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (init?.signal?.aborted) {
      rejectWithAbort();
      return;
    }
    init?.signal?.addEventListener('abort', rejectWithAbort, { once: true });
  });

const renderPolling = (overrides: Record<string, unknown> = {}) =>
  renderHook(() =>
    useVotePolling({
      vote: baseVote,
      voteId: baseVote.id,
      initialItems: [],
      pollingInterval: 1000,
      enableRealtime: false,
      ...overrides,
    } as any),
  );

async function flushAsyncWork() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
}

describe('useVotePolling cost guards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    supabaseMocks.authGetUser.mockResolvedValue({ data: { user: null }, error: null });
    supabaseMocks.votePickReturns.mockResolvedValue({ data: [], error: null });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(okResponse));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('caps far-future deadline timers at the browser timeout ceiling', () => {
    expect(getBrowserSafeTimerDelayMs(Number.MAX_SAFE_INTEGER)).toBe(2_147_483_647);
  });

  it('does not duplicate the SSR read immediately after mount', async () => {
    renderPolling();
    await flushAsyncWork();

    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not fetch while the document is hidden and refreshes immediately when visible', async () => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });

    renderPolling();
    await flushAsyncWork();
    expect(fetch).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsyncWork();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rerenders at stop_at, waits eight seconds, then performs one cache-bypassing final fetch', async () => {
    vi.setSystemTime(new Date('2026-09-26T00:00:00.000Z'));
    const { result } = renderPolling({
      vote: { ...baseVote, stop_at: '2026-09-26T00:00:01.500Z' },
    });
    await flushAsyncWork();

    expect(result.current.hasReachedVoteDeadline).toBe(false);
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.hasReachedVoteDeadline).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7999);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toMatch(
      /^\/api\/vote\/295\/detail\?final=\d+$/,
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('performs one immediate final refresh when mounted after the grace window', async () => {
    vi.setSystemTime(new Date('2026-09-26T00:00:10.000Z'));
    renderPolling({
      vote: { ...baseVote, stop_at: '2026-09-26T00:00:01.000Z' },
    });

    await flushAsyncWork();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts a hung iteration after ten seconds, counts the failure, and backs off', async () => {
    vi.mocked(fetch).mockImplementation(abortablePendingResponse);
    const { result } = renderPolling();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(result.current.pollingErrorCount).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current.pollingErrorCount).toBe(1);
    expect(getVotePollingDelayMs(1000, result.current.pollingErrorCount)).toBe(2000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('increases exponential backoff after consecutive HTTP errors', async () => {
    vi.mocked(fetch).mockImplementation(errorResponse);
    const { result } = renderPolling();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushAsyncWork();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.pollingErrorCount).toBe(1);
    expect(getVotePollingDelayMs(1000, result.current.pollingErrorCount)).toBe(2000);

    await act(async () => {
      await result.current.updateVoteDataPolling();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.pollingErrorCount).toBe(2);
    expect(getVotePollingDelayMs(1000, result.current.pollingErrorCount)).toBe(4000);
    expect(getVotePollingDelayMs(5000, 99)).toBe(60_000);
  });

  it('uses a user resolved after mount without restarting the polling effect', async () => {
    let resolveUser!: (value: unknown) => void;
    supabaseMocks.authGetUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      }),
    );

    renderPolling();
    await flushAsyncWork();
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      resolveUser({ data: { user: { id: 'user-1' } }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.from).toHaveBeenCalledWith('vote_pick');
    expect(supabaseMocks.votePickAbortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('aborts a hidden in-flight request and ignores its stale failure before resuming', async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(abortablePendingResponse)
      .mockImplementation(okResponse);
    const { result } = renderPolling();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsyncWork();
    expect(firstSignal?.aborted).toBe(true);

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushAsyncWork();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.pollingErrorCount).toBe(0);
  });

  it('aborts an in-flight request and leaves no timer after unmount', async () => {
    vi.mocked(fetch).mockImplementation(abortablePendingResponse);
    const { unmount } = renderPolling();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    unmount();
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
