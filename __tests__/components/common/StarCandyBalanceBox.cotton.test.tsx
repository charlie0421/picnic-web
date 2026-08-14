import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockWalletState: { wallet: any; isLoading: boolean; error: any } = {
  wallet: null,
  isLoading: false,
  error: null,
};

function mockWallet(wallet: Record<string, string | null> | null) {
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

  // 정책: 코튼캔디는 잔액 0 이어도 항상 노출한다(앱 wallet_summary_panel.dart 와 동일).
  // 통화가 화면에서 사라지면 사용자는 재화 자체가 없어진 것으로 오인한다.
  // 예전에는 dark launch 기간에 항상 0 이라 숨겼는데, 오픈 후에는 그 장치가 오작동한다.
  it('compact+autoFetch: cotton 이 0이어도 코튼 행을 렌더한다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '0', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(<StarCandyBalanceBox autoFetch={true} compact={true} />);
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // 잔액 0 이면 보여줄 소멸 문구가 없다. 컨테이너만 남으면 빈 분홍 띠가 보인다.
  it('보여줄 소멸 문구가 없으면 소멸 안내 컨테이너를 그리지 않는다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '0', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    const { container } = render(<StarCandyBalanceBox autoFetch={true} compact={true} />);
    // 카드(bg-pink-50)는 남고, 그 아래 안내 컨테이너(mt-2 가 붙은 것)는 없어야 한다.
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
    expect(container.querySelector('.mt-2.rounded-lg.bg-pink-50')).toBeNull();
  });

  it('소멸할 잔액이 있으면 소멸 안내를 그린다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '40', cotton_expiring_amount: '40', cotton_next_expires_at: null });
    const { container } = render(<StarCandyBalanceBox autoFetch={true} compact={true} />);
    expect(container.querySelector('.mt-2.rounded-lg.bg-pink-50')).not.toBeNull();
  });

  it('non-compact: cotton 이 0이어도 코튼 행을 렌더한다', () => {
    mockWallet({ star: '100', bonus: '20', cotton: '0', cotton_expiring_amount: '0', cotton_next_expires_at: null });
    render(<StarCandyBalanceBox autoFetch={true} compact={false} />);
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
  });

  it('지갑을 아직 못 불러왔으면 코튼 행을 그리지 않는다 (0 과 미로드는 다르다)', () => {
    mockWallet(null);
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
