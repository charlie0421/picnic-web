import type { ExpiringBonusMonth } from './expiring-bonus';

/**
 * 투표창에 인라인으로 띄울 "곧 소멸할 보너스 스타캔디" 를 고른다.
 *
 * 앱은 보너스 소멸을 소멸 예정 안내 화면에서만 보여준다. 코튼캔디와 달리 보통
 * 몇 주 뒤라 상시 노출하면 문구가 무뎌지기 때문이다. 다만 소멸이 코앞이면
 * 투표 수량 결정이 실제로 달라지므로, **임박한 경우에만** 투표창에 끌어올린다.
 *
 * 보너스는 해당 월 15일 00:00 (KST) 에 소멸한다(bonusExpiryDateLabel 과 동일 규칙).
 */
export const IMMINENT_BONUS_WITHIN_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM` → 소멸 시각(ms). KST 15일 00:00 == UTC 14일 15:00 */
export function bonusExpiryInstant(predictionMonth: string): number {
  const [y, m] = predictionMonth.split('-').map(Number);
  return Date.UTC(y, m - 1, 14, 15, 0, 0);
}

/**
 * 가장 이른 "임박한" 소멸 건을 돌려준다. 없으면 null.
 *
 * - 이미 지난 건은 제외한다. 서버는 지난 달을 함께 돌려줄 수 있는데,
 *   지난 소멸을 임박이라고 띄우면 사용자가 잔액을 오판한다.
 * - 수량 0 은 제외한다. 경고할 것이 없다.
 * - 경계는 포함이다. 정확히 임계일 뒤면 아직 임박으로 본다.
 */
export function findImminentBonus(
  months: ExpiringBonusMonth[] | undefined | null,
  nowMs: number,
  withinDays: number = IMMINENT_BONUS_WITHIN_DAYS,
): ExpiringBonusMonth | null {
  if (!months || months.length === 0) return null;

  const horizon = nowMs + withinDays * DAY_MS;

  return months
    .filter((m) => m.expiring_amount > 0)
    .map((m) => ({ month: m, at: bonusExpiryInstant(m.prediction_month) }))
    .filter(({ at }) => at >= nowMs && at <= horizon)
    .sort((a, b) => a.at - b.at)
    .map(({ month }) => month)[0] ?? null;
}
