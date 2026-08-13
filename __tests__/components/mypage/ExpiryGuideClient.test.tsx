import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }),
}));

/**
 * SWR 을 직접 모킹한다. 이 테스트가 잠그려는 건 **컴포넌트의 계약**이다:
 * 로딩 중 빈 상태를 보이지 않을 것, 실패 시 stale 행을 남기지 않을 것,
 * 0 행을 숨기지 않을 것, 자정마다 두 키를 모두 갱신할 것, 언마운트에서 타이머를 정리할 것.
 */
const swrState: Record<string, { data?: unknown; error?: unknown; isLoading: boolean }> = {};
const mutateSpies: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock('swr', () => ({
  default: (key: string) => {
    const s = swrState[key] ?? { isLoading: true };
    mutateSpies[key] = mutateSpies[key] ?? vi.fn();
    return { ...s, mutate: mutateSpies[key] };
  },
}));

import ExpiryGuideClient from '@/app/[lang]/(mypage)/mypage/expiry-guide/ExpiryGuideClient';

const WALLET = '/api/user/wallet';
const EXPIRING = '/api/user/wallet/expiring-bonus';

function wallet(cottonExpiring: string) {
  return {
    data: {
      wallet: {
        contract_version: 'wallet.v1',
        star: '100',
        bonus: '20',
        cotton: '12',
        cotton_expiring_amount: cottonExpiring,
        cotton_next_expires_at: '2026-08-13T15:00:00.000Z',
        snapshot_at: '2026-08-13T00:00:00.000Z',
      },
    },
    isLoading: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // 2026-08-13 14:00 UTC == 23:00 KST → 다음 자정까지 1시간
  vi.setSystemTime(new Date('2026-08-13T14:00:00.000Z'));
  for (const k of Object.keys(swrState)) delete swrState[k];
  for (const k of Object.keys(mutateSpies)) delete mutateSpies[k];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ExpiryGuideClient', () => {
  it('로딩 중에는 소멸 행도 빈 상태도 보이지 않는다', () => {
    swrState[WALLET] = { isLoading: true };
    swrState[EXPIRING] = { isLoading: true };

    render(<ExpiryGuideClient />);

    // 로딩 표시가 실제로 나와야 한다. 없으면 사용자는 "소멸 예정 없음"으로 오해한다.
    expect(screen.getByRole('status')).toBeInTheDocument();
    // wallet_cotton_candy 는 정책 안내 섹션에도 있으므로, 표에만 있는 요소로 판정한다.
    expect(screen.queryByText('expiry_tonight_at_midnight')).toBeNull();
    expect(screen.queryByText('wallet_load_failed')).toBeNull();
    expect(screen.queryByText('bonus_candy_expiration_policy_load_fail')).toBeNull();
  });

  it('로딩이 끝나면 로딩 표시가 사라진다', () => {
    swrState[WALLET] = wallet('13');
    swrState[EXPIRING] = { data: { months: [] }, isLoading: false };

    render(<ExpiryGuideClient />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('코튼 소멸량이 0 이어도 행을 렌더한다 (앱과 동일)', () => {
    // 숨기면 "오늘 소멸할 게 없다"는 정보 자체가 사라진다.
    swrState[WALLET] = wallet('0');
    swrState[EXPIRING] = { data: { months: [] }, isLoading: false };

    render(<ExpiryGuideClient />);

    expect(screen.getByText('expiry_tonight_at_midnight')).toBeInTheDocument();
  });

  it('보너스 0 수량 행도 필터링하지 않는다', () => {
    swrState[WALLET] = wallet('0');
    swrState[EXPIRING] = {
      data: { months: [{ prediction_month: '2026-09', expiring_amount: 0 }] },
      isLoading: false,
    };

    render(<ExpiryGuideClient />);

    expect(screen.getAllByText('wallet_bonus_star_candy').length).toBeGreaterThan(0);
  });

  it('보너스 로드 실패 시 캐시된 행을 남기지 않는다 (이미 소멸한 수량 방지)', () => {
    // SWR 은 error 와 캐시 data 를 함께 유지한다. 남기면 소멸한 값을 보여준다.
    swrState[WALLET] = wallet('13');
    swrState[EXPIRING] = {
      data: { months: [{ prediction_month: '2026-08', expiring_amount: 44 }] },
      error: new Error('EXPIRING_BONUS_LOAD_FAILED'),
      isLoading: false,
    };

    render(<ExpiryGuideClient />);

    expect(screen.getByText('bonus_candy_expiration_policy_load_fail')).toBeInTheDocument();
    expect(screen.queryByText('44')).toBeNull();
  });

  it('지갑 로드 실패 시 코튼 행을 렌더하지 않고 실패 문구를 보여준다', () => {
    swrState[WALLET] = { error: new Error('WALLET_LOAD_FAILED'), isLoading: false };
    swrState[EXPIRING] = { data: { months: [] }, isLoading: false };

    render(<ExpiryGuideClient />);

    expect(screen.getByText('wallet_load_failed')).toBeInTheDocument();
    expect(screen.queryByText('expiry_tonight_at_midnight')).toBeNull();
  });

  it('KST 자정마다 두 SWR 키를 모두 갱신한다', () => {
    swrState[WALLET] = wallet('13');
    swrState[EXPIRING] = { data: { months: [] }, isLoading: false };

    render(<ExpiryGuideClient />);

    expect(mutateSpies[WALLET]).not.toHaveBeenCalled();
    expect(mutateSpies[EXPIRING]).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(60 * 60 * 1000 + 10); }); // 23:00 → 자정
    expect(mutateSpies[WALLET]).toHaveBeenCalledTimes(1);
    expect(mutateSpies[EXPIRING]).toHaveBeenCalledTimes(1);

    // 재장전돼 다음 자정에도 갱신돼야 한다(1회성이면 하루 뒤 stale)
    act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
    expect(mutateSpies[WALLET]).toHaveBeenCalledTimes(2);
    expect(mutateSpies[EXPIRING]).toHaveBeenCalledTimes(2);
  });

  it('언마운트 후에는 타이머가 더 이상 갱신하지 않는다', () => {
    swrState[WALLET] = wallet('13');
    swrState[EXPIRING] = { data: { months: [] }, isLoading: false };

    const { unmount } = render(<ExpiryGuideClient />);
    unmount();

    act(() => { vi.advanceTimersByTime(48 * 60 * 60 * 1000); });
    expect(mutateSpies[WALLET]).not.toHaveBeenCalled();
    expect(mutateSpies[EXPIRING]).not.toHaveBeenCalled();
  });
});
