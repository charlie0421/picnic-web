import { describe, it, expect } from 'vitest';
import { fillExampleMonths } from '@/lib/wallet/expiry-example';

// 2026-09-20 12:00 UTC → KST 21:00, 9월
const SEP = new Date('2026-09-20T12:00:00.000Z');
// 2026-11-20 → 다음달 12, 다다음달 1 (연도 넘김)
const NOV = new Date('2026-11-20T12:00:00.000Z');

describe('fillExampleMonths', () => {
  it('현재/다음/다다음 달을 KST 기준으로 채운다', () => {
    expect(fillExampleMonths('__MONTH__월 10일', SEP)).toBe('9월 10일');
    expect(fillExampleMonths('__NEXT_MONTH__월 15일', SEP)).toBe('10월 15일');
    expect(fillExampleMonths('__THE_MONTH_AFTER_NEXT__월 15일', SEP)).toBe('11월 15일');
  });

  it('연말을 넘어가면 1월로 돌아온다', () => {
    expect(fillExampleMonths('__NEXT_MONTH__', NOV)).toBe('12');
    expect(fillExampleMonths('__THE_MONTH_AFTER_NEXT__', NOV)).toBe('1');
  });

  it('__MONTH__ 가 __NEXT_MONTH__ 를 먼저 잘라먹지 않는다', () => {
    // 짧은 토큰부터 치환하면 "__NEXT_9__" 같은 잔재가 남는다
    expect(fillExampleMonths('__NEXT_MONTH__ / __MONTH__', SEP)).toBe('10 / 9');
    expect(fillExampleMonths('__THE_MONTH_AFTER_NEXT__ / __MONTH__', SEP)).toBe('11 / 9');
  });

  it('대소문자가 어긋난 토큰도 치환한다 (bn/th/vi/fil 원문 대응)', () => {
    // 앱이 발견한 실제 버그: 이 원문들이 소문자 토큰을 싣고 있어 24자 토큰이 그대로 노출됐다
    expect(fillExampleMonths('__Month__', SEP)).toBe('9');
    expect(fillExampleMonths('__the_month_after_next__', SEP)).toBe('11');
    expect(fillExampleMonths('__Next_Month__', SEP)).toBe('10');
  });

  it('토큰이 없으면 원문 그대로 둔다', () => {
    expect(fillExampleMonths('15일 00:00(KST)', SEP)).toBe('15일 00:00(KST)');
  });

  it('KST 경계 — UTC 로 전날이어도 KST 월을 쓴다', () => {
    // 2026-09-30 16:00 UTC == 2026-10-01 01:00 KST
    const boundary = new Date('2026-09-30T16:00:00.000Z');
    expect(fillExampleMonths('__MONTH__', boundary)).toBe('10');
  });
});
