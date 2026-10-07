import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextResponse } from 'next/server';
import { logSafeError } from '@/utils/log-safe-error';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const POST = withSafeErrors('auth.register.post.unhandled', async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // 추가적인 옵션이나 메타데이터를 여기에 추가할 수 있습니다.
      // options: {
      //   data: {
      //     full_name: 'Test User',
      //   }
      // }
    });

    if (error) {
      logSafeError('auth.register.signup.failed', error);
      return NextResponse.json({ error: 'Registration failed' }, { status: 400 });
    }

    // 이메일 인증이 활성화된 경우, user 객체는 있지만 session은 null일 수 있습니다.
    return NextResponse.json({ user: data.user, session: data.session });
  } catch (error) {
    logSafeError('auth.register.failed', error);
    const status = 500;
    return NextResponse.json(
      { error: 'Registration failed' },
      { status }
    );
  }
});
