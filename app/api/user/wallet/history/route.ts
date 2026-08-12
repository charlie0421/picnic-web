import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUser } from '@/lib/supabase/server';
import type { CurrencyHistoryPage } from '@/types/wallet';

const ALLOWED_CURRENCIES = ['STAR_CANDY', 'BONUS_STAR_CANDY', 'COTTON_CANDY'] as const;
type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

function isAllowedCurrency(value: unknown): value is AllowedCurrency {
  return typeof value === 'string' && (ALLOWED_CURRENCIES as readonly string[]).includes(value);
}

// 플래그 OFF 동안 유일하게 명시적으로 에러를 던지는 지점(WALLET_COTTON_READ_DISABLED, P0001)에 대한 방어.
// 그 외 에러는 500 처리 대상이므로 null.
export function normalizeHistoryError(message: string | undefined): CurrencyHistoryPage | null {
  if (message && message.includes('WALLET_COTTON_READ_DISABLED')) {
    return { items: [], total_count: '0', next_cursor: null, snapshot_at: null };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const currencyParam = searchParams.get('currency');
  if (!isAllowedCurrency(currencyParam)) {
    return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
  }
  const cursor = searchParams.get('cursor');
  const limitParam = Number(searchParams.get('limit'));
  const limit = Number.isInteger(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 20;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase.rpc as any)('get_currency_history', {
    p_currency: currencyParam,
    p_cursor: cursor ?? null,
    p_limit: limit,
  });

  if (error) {
    const normalized = normalizeHistoryError(error.message);
    if (normalized) {
      return NextResponse.json({ success: true, page: normalized, disabled: true });
    }
    console.error('[/api/user/wallet/history] get_currency_history error:', error.message);
    return NextResponse.json({ error: 'WALLET_HISTORY_LOAD_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ success: true, page: data as CurrencyHistoryPage });
}
