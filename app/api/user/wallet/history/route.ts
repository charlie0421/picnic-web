import { NextResponse, NextRequest } from 'next/server';
import { createSupabaseServerClient, getServerUser } from '@/lib/supabase/server';
import { normalizeHistoryError } from '@/lib/wallet/history-error';
import { parseCurrencyHistoryPage } from '@/lib/wallet/parse-history';
import { callRpc } from '@/lib/supabase/typed-rpc';

const ALLOWED_CURRENCIES = ['STAR_CANDY', 'BONUS_STAR_CANDY', 'COTTON_CANDY'] as const;
type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];

function isAllowedCurrency(value: unknown): value is AllowedCurrency {
  return typeof value === 'string' && (ALLOWED_CURRENCIES as readonly string[]).includes(value);
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

  // 캔디 내역은 앱과 동일하게 관리자 전용(§1-5). 페이지 가드(candy-history/page.tsx)만으로는
  // API 를 직접 호출하는 경로를 막지 못하므로 BFF 에서도 동일하게 확인한다.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_admin, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = !!(profile?.is_admin || profile?.is_super_admin);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await callRpc(supabase, 'get_currency_history', {
    p_currency: currencyParam,
    // 첫 페이지는 커서가 없다. 생성 타입은 함수 인자의 nullable 을 표현하지 못해
    // p_cursor 를 non-null string 으로 내보내므로 이 인자 한 곳만 좁게 격리한다.
    p_cursor: (cursor ?? null) as unknown as string,
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

  try {
    return NextResponse.json({ success: true, page: parseCurrencyHistoryPage(data) });
  } catch (e) {
    console.error('[/api/user/wallet/history] parse error:', e);
    return NextResponse.json({ error: 'WALLET_HISTORY_LOAD_FAILED' }, { status: 500 });
  }
}
