import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVotePolling } from '@/components/client/vote/detail/useVotePolling';

const supabaseMocks = vi.hoisted(() => {
  const votePickReturns = vi.fn();
  const votePickBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  votePickBuilder.select = vi.fn(() => votePickBuilder);
  votePickBuilder.eq = vi.fn(() => votePickBuilder);
  votePickBuilder.order = vi.fn(() => votePickBuilder);
  votePickBuilder.returns = votePickReturns;

  return {
    authGetUser: vi.fn(),
    from: vi.fn(() => votePickBuilder),
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
    await Promise.resolve();
    await Promise.resolve();
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

  it('does not fetch while the document is hidden and resumes when visible', async () => {
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

  it('does not poll a vote whose stop_at has passed', async () => {
    renderPolling({
      vote: { ...baseVote, stop_at: '2020-01-01T00:00:00.000Z' },
    });
    await flushAsyncWork();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops scheduling when stop_at passes during polling', async () => {
    vi.setSystemTime(new Date('2026-09-26T00:00:00.000Z'));
    renderPolling({
      vote: { ...baseVote, stop_at: '2026-09-26T00:00:01.500Z' },
    });
    await flushAsyncWork();
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('backs off exponentially after consecutive request errors', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'temporary' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    renderPolling();
    await flushAsyncWork();
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3999);
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('uses the authenticated user obtained after mount on later polls', async () => {
    let resolveUser!: (value: unknown) => void;
    supabaseMocks.authGetUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      }),
    );

    renderPolling();
    await flushAsyncWork();
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUser({ data: { user: { id: 'user-1' } }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(supabaseMocks.from).toHaveBeenCalledWith('vote_pick');
  });

  it('shows success only on first connection and after recovering from an error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(errorResponse())
      .mockImplementation(okResponse);

    const { result } = renderPolling();
    await flushAsyncWork();
    const initialSuccess = result.current.notifications.find(({ type }) => type === 'success');
    expect(initialSuccess).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      result.current.notifications.filter(({ type }) => type === 'success').map(({ id }) => id),
    ).toEqual([initialSuccess!.id]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
    });
    const reconnectedSuccess = result.current.notifications.find(({ type }) => type === 'success');
    expect(reconnectedSuccess).toBeDefined();
    expect(reconnectedSuccess!.id).not.toBe(initialSuccess!.id);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(
      result.current.notifications.filter(({ type }) => type === 'success').map(({ id }) => id),
    ).toEqual([reconnectedSuccess!.id]);
  });
});
