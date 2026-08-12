import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUseSWR = vi.fn();
const ensureActiveMembershipMock = vi.fn(async () => false);

vi.mock('swr', () => ({
  default: (...args: any[]) => mockUseSWR(...args),
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }),
}));

vi.mock('@/hooks/useWithdrawalGuard', () => ({
  useWithdrawalGuard: () => ensureActiveMembershipMock,
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
}));

import { useVoteDialog } from '@/components/client/vote/dialogs/useVoteDialog';

describe('useVoteDialog request_id 멱등 키에 voteId 포함', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureActiveMembershipMock.mockResolvedValue(false);
    mockUseSWR.mockReturnValue({
      data: {
        success: true,
        wallet: { star: '100', bonus: '0', cotton: '0', cotton_next_expires_at: null },
      },
      error: null,
      isLoading: false,
      mutate: vi.fn(),
    });
    global.fetch = vi.fn();
  });

  it('같은 item/amount라도 voteId가 바뀌면 새 request_id를 발급한다', async () => {
    (global.fetch as any)
      // 첫 제출: 네트워크 오류로 실패 — ref가 유지된다
      .mockRejectedValueOnce(new Error('network error'))
      // 두번째 제출(voteId 변경 후): 성공
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { usage: null } }),
      });

    const { result, rerender } = renderHook(
      ({ voteId }) =>
        useVoteDialog({ isOpen: true, voteId, voteItemId: 10, onClose: vi.fn() }),
      { initialProps: { voteId: 100 } },
    );

    await act(async () => {
      await result.current.handleVoteSubmit();
    });
    const firstRequestId = JSON.parse((global.fetch as any).mock.calls[0][1].body).request_id;

    rerender({ voteId: 101 });

    await act(async () => {
      await result.current.handleVoteSubmit();
    });
    const secondRequestId = JSON.parse((global.fetch as any).mock.calls[1][1].body).request_id;

    expect(secondRequestId).not.toBe(firstRequestId);
  });
});
