import type { WalletSummary } from '@/types/wallet';

const REQUIRED_KEYS = ['contract_version', 'star', 'bonus', 'cotton',
  'cotton_expiring_amount', 'cotton_next_expires_at', 'snapshot_at'] as const;
const BALANCE_KEYS = ['star', 'bonus', 'cotton', 'cotton_expiring_amount'] as const;

// 잔액은 항상 음이 아닌 정수. '', ' ' -> BigInt 0n, '1.5' -> SyntaxError, null/undefined -> TypeError,
// '-1' -> 음수 허용 등 BigInt() 자체의 관대한/크래시하는 동작에 기대지 않고 형식을 먼저 검증한다.
const NON_NEGATIVE_DECIMAL_RE = /^(0|[1-9][0-9]*)$/;

export function parseWalletSummary(raw: unknown): WalletSummary {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') throw new Error('WALLET_SUMMARY_INVALID');
  for (const key of REQUIRED_KEYS) {
    if (!(key in (row as Record<string, unknown>))) throw new Error(`WALLET_SUMMARY_MISSING_${key}`);
  }
  for (const key of BALANCE_KEYS) {
    const value = (row as Record<string, unknown>)[key];
    if (typeof value !== 'string' || !NON_NEGATIVE_DECIMAL_RE.test(value)) {
      throw new Error(`WALLET_SUMMARY_INVALID_${key}`);
    }
  }
  return row as WalletSummary;
}

export function totalAvailable(summary: WalletSummary): bigint {
  return BigInt(summary.star) + BigInt(summary.bonus) + BigInt(summary.cotton);
}

export function formatWalletAmount(value: string, locale: string): string {
  try {
    return BigInt(value).toLocaleString(locale);
  } catch {
    return value;
  }
}
