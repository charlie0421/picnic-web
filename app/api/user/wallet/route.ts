import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUser } from '@/lib/supabase/server';
import { parseWalletSummary } from '@/lib/wallet/parse';

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_wallet_summary');
  if (error) {
    console.error('[/api/user/wallet] get_wallet_summary error:', error.message);
    return NextResponse.json({ error: 'WALLET_LOAD_FAILED' }, { status: 500 });
  }
  try {
    return NextResponse.json({ success: true, wallet: parseWalletSummary(data) });
  } catch (e) {
    console.error('[/api/user/wallet] parse error:', e);
    return NextResponse.json({ error: 'WALLET_LOAD_FAILED' }, { status: 500 });
  }
}
