import { describe, it, expect } from 'vitest';
import { parseCurrencyHistoryPage } from '@/lib/wallet/parse-history';

const item = {
  id: 'evt-1',
  currency: 'COTTON_CANDY',
  event_type: 'GRANT',
  origin: 'AD',
  delta: '12',
  balance_effect: '12',
  expires_at: null,
  purchase_id: null,
  refund_id: null,
  grant_id: 'g-1',
  operation_id: null,
  created_at: '2026-08-13T00:00:00Z',
};

describe('parseCurrencyHistoryPage', () => {
  it('정상 페이지를 그대로 통과시킨다', () => {
    const page = parseCurrencyHistoryPage({
      items: [item],
      total_count: '1',
      next_cursor: 'c2',
      snapshot_at: '2026-08-13T00:00:00Z',
    });
    expect(page.items).toHaveLength(1);
    expect(page.total_count).toBe('1');
    expect(page.next_cursor).toBe('c2');
  });

  // 생성 타입상 items/total_count 는 nullable 이다. 라우트가 단언으로 넘기면
  // 클라이언트의 [...page.items] 가 TypeError 로 죽는다.
  it('items 가 null 이면 빈 배열로 좁힌다', () => {
    const page = parseCurrencyHistoryPage({
      items: null,
      total_count: null,
      next_cursor: null,
      snapshot_at: null,
    });
    expect(page.items).toEqual([]);
    expect(() => [...page.items]).not.toThrow();
  });

  // '0 건'과 '개수를 모름'은 다르다. 없는 값을 0 으로 위장하지 않는다.
  it('total_count 가 null 이면 null 로 남긴다', () => {
    const page = parseCurrencyHistoryPage({ items: [], total_count: null });
    expect(page.total_count).toBeNull();
  });

  it('total_count 의 큰 값을 정밀도 손실 없이 유지한다', () => {
    const huge = '9007199254740993'; // MAX_SAFE_INTEGER + 2
    const page = parseCurrencyHistoryPage({ items: [], total_count: huge });
    expect(page.total_count).toBe(huge);
  });

  it('RPC 가 배열로 감싸 돌려줘도 첫 행을 쓴다', () => {
    const page = parseCurrencyHistoryPage([{ items: [item], total_count: '1' }]);
    expect(page.items).toHaveLength(1);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['문자열', 'nope'],
  ])('페이지가 %s 이면 던진다', (_label, raw) => {
    expect(() => parseCurrencyHistoryPage(raw)).toThrow('WALLET_HISTORY_INVALID');
  });

  it('items 가 배열이 아니면 빈 페이지로 삼키지 않고 던진다', () => {
    expect(() => parseCurrencyHistoryPage({ items: 'oops' })).toThrow(
      'WALLET_HISTORY_INVALID_items',
    );
  });

  it('total_count 가 숫자면 던진다 (decimal string 계약 위반)', () => {
    expect(() => parseCurrencyHistoryPage({ items: [], total_count: 1 })).toThrow(
      'WALLET_HISTORY_INVALID_total_count',
    );
  });

  it('next_cursor 가 문자열이 아니면 던진다', () => {
    expect(() => parseCurrencyHistoryPage({ items: [], next_cursor: 5 })).toThrow(
      'WALLET_HISTORY_INVALID_next_cursor',
    );
  });

  // 생성 타입상 item 의 모든 필드가 nullable 이다. 클라이언트는 item.id 를
  // 직접 읽으므로 null row 가 통과하면 TypeError 로 죽는다.
  it('items 에 null 이 섞이면 던진다 (클라이언트 TypeError 차단)', () => {
    expect(() => parseCurrencyHistoryPage({ items: [null] })).toThrow(
      'WALLET_HISTORY_INVALID_item_0',
    );
  });

  it('필수 필드가 null 인 row 를 정상 item 으로 위장하지 않는다', () => {
    for (const key of ['id', 'event_type', 'origin', 'created_at'] as const) {
      expect(() =>
        parseCurrencyHistoryPage({ items: [{ ...item, [key]: null }] }),
      ).toThrow(`WALLET_HISTORY_INVALID_item_0_${key}`);
    }
  });

  it('통화 enum 밖의 값을 거부한다', () => {
    expect(() =>
      parseCurrencyHistoryPage({ items: [{ ...item, currency: 'GOLD_CANDY' }] }),
    ).toThrow('WALLET_HISTORY_INVALID_item_0_currency');
  });

  it.each(['delta', 'balance_effect'] as const)(
    '%s 가 decimal string 이 아니면 던진다',
    (key) => {
      expect(() =>
        parseCurrencyHistoryPage({ items: [{ ...item, [key]: null }] }),
      ).toThrow(`WALLET_HISTORY_INVALID_item_0_${key}`);
      expect(() =>
        parseCurrencyHistoryPage({ items: [{ ...item, [key]: 12 }] }),
      ).toThrow(`WALLET_HISTORY_INVALID_item_0_${key}`);
      expect(() =>
        parseCurrencyHistoryPage({ items: [{ ...item, [key]: '1.5' }] }),
      ).toThrow(`WALLET_HISTORY_INVALID_item_0_${key}`);
    },
  );

  it('delta 의 음수와 초대형 값을 문자열로 보존한다', () => {
    const page = parseCurrencyHistoryPage({
      items: [{ ...item, delta: '-9007199254740993', balance_effect: '0' }],
    });
    expect(page.items[0].delta).toBe('-9007199254740993');
  });

  it('nullable 필드는 null 을 허용하고 누락 시 null 로 채운다', () => {
    const { expires_at, purchase_id, ...withoutNullable } = item;
    const page = parseCurrencyHistoryPage({ items: [withoutNullable] });
    expect(page.items[0].expires_at).toBeNull();
    expect(page.items[0].purchase_id).toBeNull();
  });

  it('몇 번째 row 가 잘못됐는지 알린다', () => {
    expect(() => parseCurrencyHistoryPage({ items: [item, item, null] })).toThrow(
      'WALLET_HISTORY_INVALID_item_2',
    );
  });
});
