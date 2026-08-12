import { describe, it, expect } from 'vitest';
import { parseWalletSummary, totalAvailable, formatWalletAmount } from '@/lib/wallet/parse';

const summary = {
  contract_version: 'wallet.v1',
  star: '9007199254740993', bonus: '250', cotton: '40',
  cotton_expiring_amount: '10', cotton_next_expires_at: '2026-07-22T00:00:00.000Z',
  snapshot_at: '2026-07-21T00:00:00.000Z',
};

describe('parseWalletSummary', () => {
  it('객체 형태를 그대로 파싱한다', () => {
    expect(parseWalletSummary(summary).cotton).toBe('40');
  });
  it('PostgREST 배열 응답을 정규화한다', () => {
    expect(parseWalletSummary([summary]).star).toBe('9007199254740993');
  });
  it('필수 키 누락 시 throw 한다', () => {
    expect(() => parseWalletSummary({ star: '1' })).toThrow();
  });

  describe('잔액 필드(star/bonus/cotton/cotton_expiring_amount) 형식 검증', () => {
    const invalidValues = [null, undefined, '', ' ', '1.5', '-1', 'abc'];
    for (const field of ['star', 'bonus', 'cotton', 'cotton_expiring_amount'] as const) {
      for (const value of invalidValues) {
        it(`${field}=${JSON.stringify(value)} 는 throw 한다`, () => {
          expect(() => parseWalletSummary({ ...summary, [field]: value })).toThrow();
        });
      }
      it(`${field} 가 안전정수를 초과하는 정상 decimal string 이면 통과한다`, () => {
        expect(() =>
          parseWalletSummary({ ...summary, [field]: '9007199254740993' }),
        ).not.toThrow();
      });
      it(`${field}='0' 은 통과한다`, () => {
        expect(() => parseWalletSummary({ ...summary, [field]: '0' })).not.toThrow();
      });
    }
  });
});

describe('totalAvailable', () => {
  it('star+bonus+cotton 을 BigInt 로 합산한다 (안전정수 초과 보존)', () => {
    expect(totalAvailable(parseWalletSummary(summary))).toBe(9007199254741283n);
  });
});

describe('formatWalletAmount', () => {
  it('천단위 구분 표시', () => {
    expect(formatWalletAmount('1234567', 'en-US')).toBe('1,234,567');
  });
  it('숫자가 아니면 원문 반환', () => {
    expect(formatWalletAmount('abc', 'en-US')).toBe('abc');
  });
});
