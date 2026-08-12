import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MAX_VOTE_AMOUNT } from '@/lib/wallet/limits';

const mockUseSWR = vi.fn();

vi.mock('swr', () => ({
  default: (...args: any[]) => mockUseSWR(...args),
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }),
}));

vi.mock('@/hooks/useWithdrawalGuard', () => ({
  useWithdrawalGuard: () => vi.fn(async () => false),
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
}));

import { useVoteDialog } from '@/components/client/vote/dialogs/useVoteDialog';

function mockWalletTotal(star: string) {
  mockUseSWR.mockReturnValue({
    data: { success: true, wallet: { star, bonus: '0', cotton: '0', cotton_next_expires_at: null } },
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  });
}

describe('useVoteDialog maxAmount 는 서버 int4 상한(MAX_VOTE_AMOUNT)을 넘지 않는다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('잔액이 상한과 같으면 maxAmount 는 상한과 같다', () => {
    mockWalletTotal(String(MAX_VOTE_AMOUNT));
    const { result } = renderHook(() =>
      useVoteDialog({ isOpen: true, voteId: 1, voteItemId: 10, onClose: vi.fn() }),
    );
    expect(result.current.maxAmount).toBe(MAX_VOTE_AMOUNT);
  });

  it('잔액이 상한보다 1 작으면 maxAmount 는 잔액 그대로다', () => {
    mockWalletTotal(String(MAX_VOTE_AMOUNT - 1));
    const { result } = renderHook(() =>
      useVoteDialog({ isOpen: true, voteId: 1, voteItemId: 10, onClose: vi.fn() }),
    );
    expect(result.current.maxAmount).toBe(MAX_VOTE_AMOUNT - 1);
  });

  it('잔액이 상한을 초과하면(2147483648) maxAmount 는 상한으로 캡된다', () => {
    mockWalletTotal('2147483648');
    const { result } = renderHook(() =>
      useVoteDialog({ isOpen: true, voteId: 1, voteItemId: 10, onClose: vi.fn() }),
    );
    expect(result.current.maxAmount).toBe(MAX_VOTE_AMOUNT);
  });

  it('안전정수를 훨씬 초과하는 잔액도 상한으로 캡된다', () => {
    mockWalletTotal('9007199254740993');
    const { result } = renderHook(() =>
      useVoteDialog({ isOpen: true, voteId: 1, voteItemId: 10, onClose: vi.fn() }),
    );
    expect(result.current.maxAmount).toBe(MAX_VOTE_AMOUNT);
  });
});
