'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Provider } from '@supabase/supabase-js';

export async function handleSocialLogin(provider: Provider) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.BASE_URL}/api/auth/callback`,
    },
  });

  if (error) {
    console.error('Social login error:', error);
    // TODO: 사용자에게 오류를 표시하는 페이지로 리디렉션
    return redirect('/login?error=social_login_failed');
  }

  if (data.url) {
    return redirect(data.url);
  }
} 