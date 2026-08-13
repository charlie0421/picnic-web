/**
 * 소멸 정책 "예시" 문구의 월 플레이스홀더 치환.
 *
 * ARB 원문은 `__MONTH__월 10일 14:00(KST)` 처럼 토큰을 품고 있고, 앱은 이를
 * 현재 월 기준으로 채운다. 웹도 같은 규칙을 써야 두 채널의 예시가 어긋나지 않는다.
 *
 * 앱이 발견한 함정을 그대로 가져온다: bn / th / vi / fil 원문은 `__Month__`,
 * `__the_month_after_next__` 처럼 **대소문자가 어긋난 토큰**을 싣고 있어
 * 대소문자 구분 치환으로는 토큰이 그대로 노출된다. 반드시 대소문자 무시로 바꾼다.
 */

const TOKENS = ['__MONTH__', '__NEXT_MONTH__', '__THE_MONTH_AFTER_NEXT__'] as const;

/** 기준 시각(KST)의 월을 1-12 로 반환 */
function kstMonth(now: Date, offset: number): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // UTC getter 로 읽어야 실행 환경 타임존에 흔들리지 않는다
  return ((kst.getUTCMonth() + offset) % 12) + 1;
}

/**
 * 예시 문구의 월 토큰을 KST 기준 현재 월/다음 달/다다음 달로 채운다.
 * @param now 테스트에서 고정하기 위해 주입 가능
 */
export function fillExampleMonths(raw: string, now: Date = new Date()): string {
  const values: Record<(typeof TOKENS)[number], string> = {
    __MONTH__: String(kstMonth(now, 0)),
    __NEXT_MONTH__: String(kstMonth(now, 1)),
    __THE_MONTH_AFTER_NEXT__: String(kstMonth(now, 2)),
  };

  let out = raw;
  // 긴 토큰부터 치환해야 `__MONTH__` 가 `__NEXT_MONTH__` 의 일부를 먼저 먹지 않는다.
  const ordered = [...TOKENS].sort((a, b) => b.length - a.length);
  for (const token of ordered) {
    out = out.replace(new RegExp(escapeRegExp(token), 'gi'), values[token]);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
