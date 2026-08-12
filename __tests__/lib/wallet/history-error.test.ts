import { describe, it, expect } from 'vitest';
import { normalizeHistoryError } from '@/lib/wallet/history-error';

describe('normalizeHistoryError', () => {
  it('WALLET_COTTON_READ_DISABLED 는 빈 페이지로 변환한다', () => {
    const page = normalizeHistoryError('WALLET_COTTON_READ_DISABLED');
    expect(page).toEqual({ items: [], total_count: '0', next_cursor: null, snapshot_at: null });
  });
  it('다른 에러는 null (500 처리)', () => {
    expect(normalizeHistoryError('WALLET_INVALID_CURSOR')).toBeNull();
    expect(normalizeHistoryError(undefined)).toBeNull();
  });
});
