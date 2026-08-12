import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }),
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ formatDate: (d: string) => d }),
}));

import CandyHistoryClient from '@/app/[lang]/(mypage)/mypage/candy-history/CandyHistoryClient';

function emptyPage() {
  return { items: [], total_count: '0', next_cursor: null, snapshot_at: null };
}

describe('CandyHistoryClient — cotton read OFF disabled 신호 처리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn((url: string) => {
      const currency = new URL(url, 'http://localhost').searchParams.get('currency');
      if (currency === 'COTTON_CANDY') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, page: emptyPage(), disabled: true }),
        }) as any;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, page: emptyPage() }),
      }) as any;
    }) as any;
  });

  it('COTTON_CANDY 탭이 disabled 이면 "내역 없음"이 아니라 이용 불가 상태를 명확히 표시한다', async () => {
    const user = userEvent.setup();
    render(<CandyHistoryClient />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await user.click(screen.getByText('vote_popup_cotton_candy'));

    await waitFor(() => {
      expect(screen.queryByText('wallet_history_empty')).toBeNull();
      expect(screen.getByText('wallet_cotton_read_disabled')).toBeInTheDocument();
    });
  });

  it('STAR_CANDY 탭은 disabled 아니므로 기존처럼 내역 없음을 표시한다', async () => {
    render(<CandyHistoryClient />);

    await waitFor(() => {
      expect(screen.getByText('wallet_history_empty')).toBeInTheDocument();
    });
  });

  it('늦게 도착한 이전 탭 응답이 현재 탭 상태를 덮어쓰지 않는다 (out-of-order race)', async () => {
    // COTTON 요청을 수동으로 지연시키고, 그 사이 STAR 로 돌아온 뒤 COTTON 응답을 늦게 resolve 한다.
    let resolveCotton: ((v: unknown) => void) | null = null;

    global.fetch = vi.fn((url: string) => {
      const currency = new URL(url, 'http://localhost').searchParams.get('currency');
      if (currency === 'COTTON_CANDY') {
        return new Promise((resolve) => {
          resolveCotton = () =>
            resolve({
              ok: true,
              json: async () => ({ success: true, page: emptyPage(), disabled: true }),
            });
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, page: emptyPage() }),
      }) as any;
    }) as any;

    const user = userEvent.setup();
    render(<CandyHistoryClient />);

    await waitFor(() => expect(screen.getByText('wallet_history_empty')).toBeInTheDocument());

    // COTTON 탭으로 이동 — 응답은 아직 pending
    await user.click(screen.getByText('vote_popup_cotton_candy'));
    await waitFor(() => expect(resolveCotton).not.toBeNull());

    // 응답이 오기 전에 STAR 탭으로 복귀 (STAR 응답은 즉시 성공)
    await user.click(screen.getByText('vote_popup_star_candy'));
    await waitFor(() => expect(screen.getByText('wallet_history_empty')).toBeInTheDocument());

    // 이제서야 COTTON 의 disabled 응답이 도착한다 — 현재 탭은 STAR 이므로 무시되어야 한다
    resolveCotton!(undefined);

    await waitFor(() => {
      expect(screen.getByText('wallet_history_empty')).toBeInTheDocument();
    });
    expect(screen.queryByText('wallet_cotton_read_disabled')).toBeNull();
  });
});
