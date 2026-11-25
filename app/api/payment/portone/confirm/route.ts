import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextRequest, NextResponse } from 'next/server';
import { logSafeError } from '@/utils/log-safe-error';
import { getServerUser, isWithdrawnUser } from '@/lib/supabase/server';

// PortOne v2 브라우저 SDK confirmUrl 엔드포인트
// 브라우저 SDK가 결제 직전 서버 컨펌을 위해 호출.
export const POST = withSafeErrors('payment.portone.confirm.post.unhandled', async function POST(_request: NextRequest) {
  try {
    // Verify user is authenticated
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, reason: 'unauthorized' },
        { status: 401 }
      );
    }

    // 탈퇴 계정 차단 — 민감 작업이라 조회 오류 시에도 차단(fail-closed)
    if (await isWithdrawnUser(user.id, { failClosed: true })) {
      return NextResponse.json({ error: 'A member who has unsubscribed.' }, { status: 403 });
    }

    // This legacy callback has no server-owned order or quote. Only an
    // order-scoped manual confirmation can authorize a PortOne payment.
    return NextResponse.json({ ok: false, reason: 'portone_disabled' }, { status: 403 });
  } catch (e) {
    logSafeError('payment.portone.confirm.failed', e);
    return NextResponse.json(
      { ok: false, reason: 'confirm_failed' },
      { status: 400 }
    );
  }
});
