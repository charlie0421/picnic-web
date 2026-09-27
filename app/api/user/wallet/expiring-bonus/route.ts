import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getServerUser, isWithdrawnUser } from '@/lib/supabase/server';
import { parseExpiringBonus } from '@/lib/wallet/expiring-bonus';

/**
 * 소멸 예정 보너스 스타캔디 조회.
 *
 * 앱과 같은 Edge Function(`expiring-bonus`)을 쓴다. 이 함수는 anon 키로 노출되지 않고
 * 사용자 JWT 로 본인 데이터만 계산하므로, 브라우저가 직접 호출하지 않고 BFF 를 경유한다.
 */
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
  const { data, error } = await supabase.functions.invoke('expiring-bonus', { body: {} });

  if (error) {
    console.error('[/api/user/wallet/expiring-bonus] invoke error:', error.message);
    return NextResponse.json({ error: 'EXPIRING_BONUS_LOAD_FAILED' }, { status: 500 });
  }

  try {
    return NextResponse.json({ success: true, months: parseExpiringBonus(data) });
  } catch (e) {
    console.error('[/api/user/wallet/expiring-bonus] parse error:', e);
    return NextResponse.json({ error: 'EXPIRING_BONUS_LOAD_FAILED' }, { status: 500 });
  }
}
