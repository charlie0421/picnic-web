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

describe('StarCandyBalanceBox cotton — 실사용 조합', () => {
  // /ko/star-candy 사용 조합: StarCandyProductsPresenter.tsx:114-119
  it('compact+autoFetch: cotton 이 비0이면 컴팩트에서도 코튼 행을 렌더한다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '40', cotton_expiring_amount: '10', cotton_next_expires_at: '2026-07-22T00:00:00.000Z' });
    render(<StarCandyBalanceBox autoFetch={true} compact={true} />);
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
  });

  it('compact+autoFetch: cotton 이 0이면 컴팩트에서도 코튼 행을 렌더하지 않는다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '0', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(<StarCandyBalanceBox autoFetch={true} compact={true} />);
    expect(screen.queryByText('wallet_cotton_candy')).toBeNull();
  });

  // /ko/mypage 사용 조합: MyPageClient.tsx:259-265 (props 로 star/bonus/total 전달, autoFetch=false)
  it('compact+props(autoFetch=false): 지갑에 코튼이 있으면 렌더한다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '40', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(
      <StarCandyBalanceBox
        starCandy={100}
        starCandyBonus={20}
        totalCandy={120}
        autoFetch={false}
        compact={true}
      />,
    );
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
  });

  it('안전정수를 초과하는 잔액도 wallet.v1 문자열 기준으로 정밀도 손실 없이 표시한다 (compact)', () => {
    mockWallet({ star: '9007199254740993', bonus: '7', cotton: '40', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(<StarCandyBalanceBox autoFetch={true} compact={true} />);
    // compact 는 앱 "별사탕 파우치" 와 동일하게 통화별 카드만 보여준다(합계 없음).
    // 각 통화가 문자열 그대로 정밀하게 렌더돼야 한다 — number 로 다루면 ...741,000 으로 뭉개진다.
    expect(screen.getByText('9,007,199,254,740,993')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('9,007,199,254,741,000')).toBeNull();
  });

  it('compact 에는 통화를 뭉갠 합계를 표시하지 않는다 (앱과 동일)', () => {
    // 합계를 두면 "Total 7,715" 옆에 "코튼 12" 가 붙어 7,727 을 기대하게 만든다.
    mockWallet({ star: '100', bonus: '20', cotton: '40', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(<StarCandyBalanceBox autoFetch={true} compact={true} />);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.queryByText('120')).toBeNull();
    expect(screen.queryByText('160')).toBeNull();
  });

  it('compact 에서 코튼 만료 정보를 함께 보여준다 (금액만 보여주면 안 된다)', () => {
    mockWallet({
      star: '100', bonus: '20', cotton: '12',
      cotton_expiring_amount: '12',
      cotton_next_expires_at: '2026-08-13T15:00:00.000Z', // 2026-08-14 00:00 KST
    });
    render(<StarCandyBalanceBox autoFetch={true} compact={true} />);

    expect(screen.getByText(/wallet_cotton_expires_today/)).toBeInTheDocument();
    expect(screen.getByText(/wallet_cotton_next_expiry/)).toBeInTheDocument();
  });

  it('안전정수를 초과하는 잔액도 wallet.v1 문자열 기준으로 정밀도 손실 없이 표시한다 (non-compact)', () => {
    mockWallet({ star: '9007199254740993', bonus: '7', cotton: '40', cotton_expiring_amount: '10', cotton_next_expires_at: '2026-07-22T00:00:00.000Z' });
    render(<StarCandyBalanceBox autoFetch={true} compact={false} />);
    expect(screen.getByText('9,007,199,254,740,993')).toBeInTheDocument();
    expect(screen.getByText('9,007,199,254,741,000')).toBeInTheDocument();
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
  });
});
