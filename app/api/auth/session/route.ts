import { NextResponse } from 'next/server';
import { logError } from '@/utils/log-error';
import { getServerUser, isWithdrawnUser } from '@/lib/supabase/server';

export async function GET() {
  try {
    const user = await getServerUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    // 탈퇴 계정(또는 확인 불가)은 세션 정보를 내주지 않는다 — middleware 가 /api 를 제외하므로 여기서 막는다
    if (await isWithdrawnUser(user.id, { failClosed: true })) {
      return NextResponse.json({ user: null, error: 'A member who has unsubscribed.' }, { status: 403 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        // 필요한 다른 사용자 정보를 여기에 추가할 수 있습니다.
        // 민감한 정보는 제외해야 합니다.
      },
    });
  } catch (error) {
    logError('[/api/auth/session] error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
} 