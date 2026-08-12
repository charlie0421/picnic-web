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
});
