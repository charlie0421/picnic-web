const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 스타캔디 보너스 만료일을 KST 기준 15일 00:00으로 계산해 UTC ISO 문자열로 반환한다.
 * - 매월 1일 00:00 ~ 14일 23:59:59(KST) 적립분 → 다음 달 15일 00:00(KST)
 * - 15일 00:00 이후 적립분 → 다다음 달 15일 00:00(KST)
 */
export function getStarCandyBonusExpiryISO(now: Date = new Date()): string {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  let targetYear = kstNow.getUTCFullYear();
  let targetMonth = kstNow.getUTCMonth();

  const isBeforeCutoff = kstNow.getUTCDate() < 15;
  targetMonth += isBeforeCutoff ? 1 : 2;

  while (targetMonth > 11) {
    targetMonth -= 12;
    targetYear += 1;
  }

  // 15일 00:00(KST) → UTC 14일 15:00
  const expiryUtc = new Date(Date.UTC(targetYear, targetMonth, 14, 15, 0, 0));
  return expiryUtc.toISOString();
}





