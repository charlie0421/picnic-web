import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const ensureActiveMembershipMock = vi.fn(async () => false);

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }),
}));
vi.mock('@/hooks/useWithdrawalGuard', () => ({
  useWithdrawalGuard: () => ensureActiveMembershipMock,
}));
vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
}));
vi.mock('swr', () => ({
  default: () => ({
    data: {
      success: true,
      wallet: {
        star: '100',
        bonus: '0',
        cotton: '0',
        cotton_next_expires_at: null,
      },
    },
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

import { useVoteDialog } from '@/components/client/vote/dialogs/useVoteDialog';
import { __resetVoteRequestIdMemory } from '@/lib/wallet/vote-request-id';

const PARAMS = { isOpen: true, voteId: 100, voteItemId: 10, onClose: vi.fn() };

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.sessionStorage.clear();
  __resetVoteRequestIdMemory();
  ensureActiveMembershipMock.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  __resetVoteRequestIdMemory();
});

describe('useVoteDialog 제출 계약', () => {
  it('서버 4키 계약으로 보내고 amount 는 number, request_id 는 UUID 다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { usage: {} } }),
    });
    global.fetch = fetchMock as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await result.current.handleVoteSubmit(); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchMock.mock.calls[0]);
    expect(Object.keys(body).sort()).toEqual(
      ['amount', 'request_id', 'vote_id', 'vote_item_id'].sort(),
    );
    expect(body.vote_id).toBe(100);
    expect(body.vote_item_id).toBe(10);
    // amount 를 문자열로 바꾸는 회귀를 잡아야 한다 (BFF 가 Number.isInteger 로 검증한다)
    expect(body.amount).toBe(1);
    expect(typeof body.amount).toBe('number');
    expect(body.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('네트워크 실패 후 언마운트·재마운트해도 같은 request_id 로 재시도한다 (저장소 차단 상태)', async () => {
    // 저장소를 막아야 모듈 Map 이 실제로 기여하는지 검증된다.
    // 정상 저장소에서는 sessionStorage 만으로도 통과해 Map 회귀를 놓친다.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as never;

    const first = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await first.result.current.handleVoteSubmit(); });
    const firstId = bodyOf(fetchMock.mock.calls[0]).request_id;

    // 다이얼로그를 닫았다 다시 여는 상황 (조건부 렌더 → 언마운트)
    first.unmount();
    const second = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await second.result.current.handleVoteSubmit(); });

    expect(bodyOf(fetchMock.mock.calls[1]).request_id).toBe(firstId);
  });

  it('성공 후에는 멱등 키를 비워 다음 투표가 새 request_id 를 받는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { usage: {} } }),
    });
    global.fetch = fetchMock as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await result.current.handleVoteSubmit(); });
    const firstId = bodyOf(fetchMock.mock.calls[0]).request_id;

    // 성공 오버레이(2초) 종료까지 진행시켜 잠금 해제
    await act(async () => { vi.advanceTimersByTime(2100); });
    await act(async () => { await result.current.handleVoteSubmit(); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1]).request_id).not.toBe(firstId);
  });

  it('응답 전 연속 클릭에도 fetch 는 1회만 나간다 (동시 더블클릭 가드)', async () => {
    let resolveFetch: ((v: unknown) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({ ok: true, json: async () => ({ success: true, data: { usage: {} } }) });
        }),
    );
    global.fetch = fetchMock as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));

    await act(async () => {
      // 첫 요청이 pending 인 상태에서 즉시 두 번째 호출
      const a = result.current.handleVoteSubmit();
      const b = result.current.handleVoteSubmit();
      await Promise.resolve();
      resolveFetch!(undefined);
      await Promise.all([a, b]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('성공 오버레이가 떠 있는 동안 재제출을 차단한다 (이중 차감 방지)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { usage: {} } }),
    });
    global.fetch = fetchMock as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await result.current.handleVoteSubmit(); });
    expect(result.current.showSuccess).toBe(true);

    // 오버레이는 시각적 가림일 뿐이라 버튼이 활성일 수 있다 — 훅이 동기로 막아야 한다
    await act(async () => { await result.current.handleVoteSubmit(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('VOTE_CLIENT_UPGRADE_REQUIRED 는 code 로 분기해 새로고침 안내를 보여준다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: '앱이 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
        code: 'VOTE_CLIENT_UPGRADE_REQUIRED',
      }),
    }) as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await result.current.handleVoteSubmit(); });

    await waitFor(() => {
      expect(result.current.voteError).toBe('vote_client_upgrade_required');
    });
  });

  it('code 가 없는 일반 오류는 서버 error 문자열을 그대로 보여준다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'WALLET_INSUFFICIENT_BALANCE' }),
    }) as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await result.current.handleVoteSubmit(); });

    await waitFor(() => {
      expect(result.current.voteError).toBe('WALLET_INSUFFICIENT_BALANCE');
    });
  });

  it('실패 후에는 잠금이 풀려 재시도할 수 있다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'WALLET_INSUFFICIENT_BALANCE' }),
    });
    global.fetch = fetchMock as never;

    const { result } = renderHook(() => useVoteDialog(PARAMS));
    await act(async () => { await result.current.handleVoteSubmit(); });
    await act(async () => { await result.current.handleVoteSubmit(); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 실패 재시도는 반드시 같은 멱등 키여야 한다 — 다르면 이중 차감이 가능해진다
    expect(bodyOf(fetchMock.mock.calls[1]).request_id).toBe(
      bodyOf(fetchMock.mock.calls[0]).request_id,
    );
  });
});
