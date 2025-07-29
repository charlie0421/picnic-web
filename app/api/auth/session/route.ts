import { NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server';

export async function GET() {
  try {
    const user = await getServerUser();

    if (!user) {
      return NextResponse.json({ user: null });
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
    console.error('[/api/auth/session] error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
} 