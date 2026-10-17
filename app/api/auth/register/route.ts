import { withSafeErrors } from '@/utils/with-safe-errors';
import { NextResponse } from 'next/server';
import { logSafeError, logSafeWarn } from '@/utils/log-safe-error';
import { isClientAuthError } from '@/utils/log-severity';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const POST = withSafeErrors('auth.register.post.unhandled', async function POST(request: Request) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      // 다른 입력 검증(400)처럼 남기지 않는다. 누구나 보낼 수 있는 본문이다(#75).
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { email, password } = body ?? {};

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
      // 중복 가입·약한 비밀번호처럼 요청자가 원인이면 WARN, SMTP 한도·설정·장애는 ERROR (#75).
      (isClientAuthError(error) ? logSafeWarn : logSafeError)('auth.register.signup.failed', error);
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
