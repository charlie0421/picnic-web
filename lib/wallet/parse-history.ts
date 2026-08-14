import type { CurrencyHistoryItem, CurrencyHistoryPage } from '@/types/wallet';

/**
 * `get_currency_history` 응답을 정규화한다.
 *
 * 생성 타입(`wallet_currency_history_page` / `wallet_currency_history_item`)의 필드는
 * 전부 nullable 이다(Postgres composite 의 필드는 항상 nullable). 반면 앱 타입은
 * non-null 이므로 단순 단언은 두 가지로 깨진다.
 *
 *  - `items: null` -> 클라이언트의 `[...page.items]` 가 TypeError
 *  - `items: [null]` 또는 필드가 null 인 row -> `item.id` 에서 TypeError,
 *    죽지 않더라도 금액이 빈 값으로 표시되어 잘못된 내역을 정상처럼 보여준다
 *
 * 따라서 최상위 모양과 **각 row** 를 함께 검증한다. 어긋나면 조용히 빈 페이지를
 * 내지 않고 던져서 라우트가 500 으로 처리하게 한다.
 */

const CURRENCIES = new Set(['STAR_CANDY', 'BONUS_STAR_CANDY', 'COTTON_CANDY']);

// delta 는 차감/적립을 모두 표현하므로 부호를 허용한다. balance_effect 도 마찬가지.
// 금액은 MAX_SAFE_INTEGER 를 넘을 수 있어 Number 로 바꾸지 않고 형식만 검사한다.
const SIGNED_DECIMAL_RE = /^-?(0|[1-9][0-9]*)$/;

const REQUIRED_STRINGS = ['id', 'event_type', 'origin', 'created_at'] as const;
const AMOUNT_KEYS = ['delta', 'balance_effect'] as const;
const NULLABLE_STRINGS = [
  'expires_at',
  'purchase_id',
  'refund_id',
  'grant_id',
  'operation_id',
] as const;

function parseItem(raw: unknown, index: number): CurrencyHistoryItem {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`WALLET_HISTORY_INVALID_item_${index}`);
  }
  const item = raw as Record<string, unknown>;

  for (const key of REQUIRED_STRINGS) {
    const value = item[key];
    if (typeof value !== 'string' || value === '') {
      throw new Error(`WALLET_HISTORY_INVALID_item_${index}_${key}`);
    }
  }

  if (typeof item.currency !== 'string' || !CURRENCIES.has(item.currency)) {
    throw new Error(`WALLET_HISTORY_INVALID_item_${index}_currency`);
  }

  for (const key of AMOUNT_KEYS) {
    const value = item[key];
    if (typeof value !== 'string' || !SIGNED_DECIMAL_RE.test(value)) {
      throw new Error(`WALLET_HISTORY_INVALID_item_${index}_${key}`);
    }
  }

  for (const key of NULLABLE_STRINGS) {
    const value = item[key];
    if (value !== null && value !== undefined && typeof value !== 'string') {
      throw new Error(`WALLET_HISTORY_INVALID_item_${index}_${key}`);
    }
  }

  return {
    id: item.id as string,
    currency: item.currency as CurrencyHistoryItem['currency'],
    event_type: item.event_type as string,
    origin: item.origin as string,
    delta: item.delta as string,
    balance_effect: item.balance_effect as string,
    expires_at: (item.expires_at as string | null) ?? null,
    purchase_id: (item.purchase_id as string | null) ?? null,
    refund_id: (item.refund_id as string | null) ?? null,
    grant_id: (item.grant_id as string | null) ?? null,
    operation_id: (item.operation_id as string | null) ?? null,
    created_at: item.created_at as string,
  };
}

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
    // items 가 null 인 것은 "결과 없음"으로 취급한다(빈 배열).
    items: ((rawItems ?? []) as unknown[]).map(parseItem),
    // null 을 '0' 으로 채우지 않는다. "0 건"과 "개수를 모름"은 다르며,
    // 없는 값을 0 으로 위장하면 호출자가 구분할 수 없다.
    total_count: totalCount ?? null,
    next_cursor: nextCursor ?? null,
    snapshot_at: snapshotAt ?? null,
  };
}
