/**
 * 소멸 예정 보너스 스타캔디 — Edge Function `expiring-bonus` 응답 계약.
 *
 * 서버는 만료 예정 보너스를 KST 기준 월(`YYYY-MM`)로 묶어 돌려준다.
 * 앱(`expireBonusProvider`)과 같은 함수를 쓰므로 계약이 어긋나면 두 채널이 갈라진다.
 */

export interface ExpiringBonusMonth {
  /** KST 기준 소멸 예정 월. `YYYY-MM` */
  prediction_month: string;
  /** 그 달에 소멸할 보너스 스타캔디 합계 */
  expiring_amount: number;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Edge 응답을 검증한다. 서버가 문자열 JSON 을 줄 수도 있어(앱도 같은 분기를 둔다)
 * 파싱까지 여기서 흡수한다.
 *
 * 계약을 벗어난 항목은 조용히 버리지 않고 예외를 던진다 — 소멸 수량을 잘못 보여주면
 * 사용자가 캔디를 잃는 시점을 오판한다.
 */
export function parseExpiringBonus(raw: unknown): ExpiringBonusMonth[] {
  const value = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!Array.isArray(value)) {
    throw new Error('EXPIRING_BONUS_INVALID_SHAPE');
  }

  return value.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new Error('EXPIRING_BONUS_INVALID_ROW');
    }
    const { prediction_month, expiring_amount } = row as Record<string, unknown>;

    if (typeof prediction_month !== 'string' || !MONTH_RE.test(prediction_month)) {
      throw new Error('EXPIRING_BONUS_INVALID_MONTH');
    }
    // 소멸 수량은 비음수 정수다. Number.isFinite 만 보면 -1 이나 1.5 가 그대로
    // 화면에 뜬다(Edge 는 bigint 합계를 주므로 그런 값이 오면 계약 위반이다).
    if (
      typeof expiring_amount !== 'number' ||
      !Number.isSafeInteger(expiring_amount) ||
      expiring_amount < 0
    ) {
      throw new Error('EXPIRING_BONUS_INVALID_AMOUNT');
    }

    return { prediction_month, expiring_amount };
  });
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new Error('EXPIRING_BONUS_INVALID_JSON');
  }
}

/**
 * `YYYY-MM` → 소멸 시각 문구용 날짜.
 * 보너스 스타캔디는 해당 월 **15일 00:00 (KST)** 에 소멸한다(정책 문구와 동일).
 */
export function bonusExpiryDateLabel(predictionMonth: string, locale: string): string {
  const [y, m] = predictionMonth.split('-').map(Number);
  // KST 15일 00:00 == UTC 14일 15:00
  const utc = new Date(Date.UTC(y, m - 1, 14, 15, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(utc);
}
