import type { CurrencyHistoryItem, CurrencyHistoryPage } from '@/types/wallet';

/**
 * `get_currency_history` 응답을 정규화한다.
 *
 * 생성 타입(`wallet_currency_history_page`)의 `items`/`total_count` 는 nullable 인데
 * 앱 타입(`CurrencyHistoryPage`)은 non-null 이다. 라우트가 `as CurrencyHistoryPage` 로
 * 단언하면 RPC 가 SQL NULL 을 돌려줄 때 BFF 는 200 을 내고 클라이언트의
 * `[...page.items]` 가 TypeError 로 죽는다. 여기서 안전한 값으로 좁힌다.
 *
 * items 가 null 인 것은 "결과 없음"으로 취급한다(빈 배열). 그 외 모양이 어긋나면
 * 조용히 빈 페이지를 내지 않고 던져서 라우트가 500 으로 처리하게 한다.
 */
export function parseCurrencyHistoryPage(raw: unknown): CurrencyHistoryPage {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') throw new Error('WALLET_HISTORY_INVALID');

  const page = row as Record<string, unknown>;
  const rawItems = page.items;
  if (rawItems !== null && rawItems !== undefined && !Array.isArray(rawItems)) {
    throw new Error('WALLET_HISTORY_INVALID_items');
  }

  const totalCount = page.total_count;
  if (totalCount !== null && totalCount !== undefined && typeof totalCount !== 'string') {
    throw new Error('WALLET_HISTORY_INVALID_total_count');
  }

  const nextCursor = page.next_cursor;
  if (nextCursor !== null && nextCursor !== undefined && typeof nextCursor !== 'string') {
    throw new Error('WALLET_HISTORY_INVALID_next_cursor');
  }

  const snapshotAt = page.snapshot_at;
  if (snapshotAt !== null && snapshotAt !== undefined && typeof snapshotAt !== 'string') {
    throw new Error('WALLET_HISTORY_INVALID_snapshot_at');
  }

  return {
    items: ((rawItems ?? []) as CurrencyHistoryItem[]),
    // 금액과 마찬가지로 decimal string 이다. Number 로 바꾸지 않는다.
    total_count: totalCount ?? '0',
    next_cursor: nextCursor ?? null,
    snapshot_at: snapshotAt ?? null,
  };
}
