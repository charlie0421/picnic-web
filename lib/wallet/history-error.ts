import type { CurrencyHistoryPage } from '@/types/wallet';

// 플래그 OFF 동안 유일하게 명시적으로 에러를 던지는 지점(WALLET_COTTON_READ_DISABLED, P0001)에 대한 방어.
// 그 외 에러는 500 처리 대상이므로 null.
export function normalizeHistoryError(message: string | undefined): CurrencyHistoryPage | null {
  if (message && message.includes('WALLET_COTTON_READ_DISABLED')) {
    return { items: [], total_count: '0', next_cursor: null, snapshot_at: null };
  }
  return null;
}
