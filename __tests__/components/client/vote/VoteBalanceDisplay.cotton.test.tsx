import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoteBalanceDisplay } from '@/components/client/vote/dialogs/VoteBalanceDisplay';

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: any) => <img alt={alt} src={typeof src === 'string' ? src : ''} />,
}));

const t = (key: string) => key;
const getLocale = () => 'ko-KR';

function renderWith(cotton: string) {
  return render(
    <VoteBalanceDisplay
      isLoadingBalance={false}
      balanceError={null}
      userBalance={{
        starCandy: '100',
        starCandyBonus: '20',
        cottonCandy: cotton,
        totalAvailable: '120',
      } as never}
      getLocale={getLocale}
      mutateProfile={() => {}}
      t={t}
    />,
  );
}

describe('VoteBalanceDisplay — 코튼캔디 노출 정책', () => {
  // 정책: 코튼캔디는 잔액 0 이어도 항상 노출한다.
  // 통화가 화면에서 사라지면 사용자는 재화 자체가 없어진 것으로 오인한다.
  it('cotton 이 0이어도 투표창에 코튼캔디를 표시한다', () => {
    renderWith('0');
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('cotton 이 0이어도 매일 소멸 안내를 함께 보여준다', () => {
    renderWith('0');
    expect(screen.getByText('cotton_candy_daily_expiry_notice')).toBeInTheDocument();
  });

  it('cotton 이 비0이면 금액을 로케일 형식으로 표시한다', () => {
    renderWith('1234');
    expect(screen.getByText('wallet_cotton_candy')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('안전정수를 넘는 잔액도 정밀도 손실 없이 표시한다', () => {
    renderWith('9007199254740993');
    expect(screen.getByText('9,007,199,254,740,993')).toBeInTheDocument();
  });

  // 앱 wallet_summary_panel.dart 는 star/bonus/cotton 을 한 줄 3열로 배치한다.
  // 코튼캔디만 아래로 내려가면 재화 위계가 달라 보인다.
  it('세 통화를 앱과 같은 한 줄 3열로 배치한다', () => {
    const { container } = renderWith('0');
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain('grid-cols-3');
    // 3열 안에 세 통화가 모두 들어 있어야 한다.
    expect(grid!.textContent).toContain('wallet_star_candy');
    expect(grid!.textContent).toContain('wallet_bonus_star_candy');
    expect(grid!.textContent).toContain('wallet_cotton_candy');
  });
});
