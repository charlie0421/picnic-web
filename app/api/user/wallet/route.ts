import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUser, isWithdrawnUser } from '@/lib/supabase/server';
import { parseWalletSummary } from '@/lib/wallet/parse';
import { callRpc } from '@/lib/supabase/typed-rpc';

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  // 탈퇴 계정 차단 — middleware matcher 가 /api 를 제외하므로 API 에서 직접 막는다(조회 오류 시에도 차단)
  if (await isWithdrawnUser(user.id, { failClosed: true })) {
    return NextResponse.json({ error: 'A member who has unsubscribed.' }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await callRpc(supabase, 'get_wallet_summary');
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
