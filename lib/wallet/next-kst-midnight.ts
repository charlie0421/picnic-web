/**
 * 다음 KST 자정까지 남은 밀리초.
 *
 * 코튼캔디는 KST 자정에 소멸한다. 화면을 열어둔 채 자정을 넘기면 이미 사라진 수량과
 * "오늘밤 자정" 문구가 그대로 남아 사용자가 아직 쓸 수 있다고 오해한다.
 * 이 값으로 타이머를 걸어 경계에서 다시 불러온다.
 */
export function msUntilNextKstMidnight(now: Date = new Date()): number {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const kstNow = now.getTime() + KST_OFFSET;
  const dayMs = 24 * 60 * 60 * 1000;
  const sinceMidnight = ((kstNow % dayMs) + dayMs) % dayMs;
  const remaining = dayMs - sinceMidnight;
  // 정확히 자정이면 0 이 아니라 다음 자정(하루)을 돌려준다 — 0 은 타이머 폭주를 만든다.
  return remaining === 0 ? dayMs : remaining;
}
