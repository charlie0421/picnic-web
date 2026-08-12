import type { WalletSummary } from '@/types/wallet';

const REQUIRED_KEYS = ['contract_version', 'star', 'bonus', 'cotton',
  'cotton_expiring_amount', 'cotton_next_expires_at', 'snapshot_at'] as const;

export function parseWalletSummary(raw: unknown): WalletSummary {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') throw new Error('WALLET_SUMMARY_INVALID');
  for (const key of REQUIRED_KEYS) {
    if (!(key in (row as Record<string, unknown>))) throw new Error(`WALLET_SUMMARY_MISSING_${key}`);
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
