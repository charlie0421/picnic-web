import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockWalletState: { wallet: any; isLoading: boolean; error: any } = {
  wallet: null,
  isLoading: false,
  error: null,
};

function mockWallet(wallet: Record<string, string | null>) {
  mockWalletState.wallet = wallet;
}

vi.mock('@/hooks/useWalletSummary', () => ({
  useWalletSummary: () => mockWalletState,
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    userProfile: { star_candy: 100, star_candy_bonus: 20 },
    loadUserProfile: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => key,
  }),
}));

import StarCandyBalanceBox from '@/components/common/StarCandyBalanceBox';

describe('StarCandyBalanceBox cotton', () => {
  it("cotton 이 '0' 이면 코튼캔디 행을 렌더하지 않는다", () => {
    mockWallet({ star: '100', bonus: '20', cotton: '0', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(<StarCandyBalanceBox />);
    expect(screen.queryByText('wallet_cotton_candy')).toBeNull();
  });
  it("cotton 이 비0 이면 행과 만료 안내를 렌더한다", () => {
    mockWallet({ star: '100', bonus: '20', cotton: '40', cotton_expiring_amount: '10', cotton_next_expires_at: '2026-07-22T00:00:00.000Z' });
    render(<StarCandyBalanceBox />);
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
    expect(screen.getByText('cotton_candy_daily_expiry_notice')).toBeInTheDocument();
  });
});
