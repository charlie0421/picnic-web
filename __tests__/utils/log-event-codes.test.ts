import { describe, expect, it } from 'vitest';

import { FALLBACK_EVENT_CODE, LOG_EVENT_CODES, isLogEventCode } from '@/utils/log-event-codes';

describe('사건 코드 목록', () => {
  it('중복이 없다', () => {
    expect(new Set(LOG_EVENT_CODES).size).toBe(LOG_EVENT_CODES.length);
  });

  // 코드는 Sentry 의 예외 값과 서버 로그의 첫 줄에 그대로 나간다. URL·공백·대문자가 섞인 값을 목록에 넣지 못하게 한다.
  it.each([...LOG_EVENT_CODES])('%s 는 점으로 나눈 소문자 마디 둘 이상이다', (code) => {
    expect(code).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    expect(code.length).toBeLessThanOrEqual(80);
  });

  it('목록의 값은 사건 코드다', () => {
    for (const code of LOG_EVENT_CODES) expect(isLogEventCode(code)).toBe(true);
    expect(isLogEventCode(FALLBACK_EVENT_CODE)).toBe(true);
  });

  it.each([
    ['목록에 없는 문자열', 'payment.made_up.code'],
    ['목록의 값에 덧붙인 문자열', 'envtest.boundary.unhandled?code=cnry'],
    ['빈 문자열', ''],
    ['Object.prototype 의 키', 'constructor'],
    ['__proto__', '__proto__'],
    ['숫자', 1],
    ['null', null],
    ['undefined', undefined],
    ['문자열로 바뀌는 객체', { toString: () => 'envtest.boundary.unhandled' }],
    ['배열', ['envtest.boundary.unhandled']],
  ])('%s 은(는) 사건 코드가 아니다', (_label, value) => {
    expect(isLogEventCode(value)).toBe(false);
  });
});
