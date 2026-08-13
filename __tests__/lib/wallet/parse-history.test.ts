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

  it('total_count 가 null 이면 문자열 0 이다 (Number 로 바꾸지 않는다)', () => {
    const page = parseCurrencyHistoryPage({ items: [], total_count: null });
    expect(page.total_count).toBe('0');
    expect(typeof page.total_count).toBe('string');
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
});
