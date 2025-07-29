'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
// import { createClient } from '@supabase/supabase-js'; // createClient는 더 이상 직접 사용하지 않음

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let browserSupabase: BrowserSupabaseClient | null = null;

// supabaseUrl과 supabaseAnonKey를 인자로 받아 클라이언트를 생성하는 함수
// 이 함수는 Provider나 앱의 최상위 레벨에서 한 번만 호출되어야 합니다.
export function initializeBrowserSupabaseClient(supabaseUrl: string, supabaseAnonKey: string): BrowserSupabaseClient {
  if (browserSupabase) {
    // console.warn('[Supabase Client] 이미 초기화되었습니다.');
    return browserSupabase;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL 또는 Anon Key가 제공되지 않았습니다.');
  }

  console.log('🔧 [Client] 새로운 Supabase 클라이언트 생성');

  browserSupabase = createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        autoRefreshToken: true,
        persistSession: true,
      },
    }
  );

  return browserSupabase;
}

// 초기화된 클라이언트 인스턴스를 가져오는 함수
export function getBrowserSupabaseClient(): BrowserSupabaseClient {
  if (!browserSupabase) {
    // 이 오류는 initializeBrowserSupabaseClient가 호출되지 않았음을 의미합니다.
    // 앱의 진입점에서 환경 변수를 사용하여 초기화해야 합니다.
    throw new Error('Supabase 클라이언트가 초기화되지 않았습니다. 앱의 루트에서 initializeBrowserSupabaseClient를 호출해주세요.');
  }
  return browserSupabase;
}

// 편의를 위한 나머지 함수들은 getBrowserSupabaseClient를 사용하도록 수정
export async function getCurrentUser() {
  const supabase = getBrowserSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentSession() {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !user) {
    return null;
  }
  return {
    user,
    access_token: 'token-from-cookies',
    refresh_token: null,
    expires_at: null,
    token_type: 'bearer' as const
  };
}

export async function signOut() {
  const supabase = getBrowserSupabaseClient();
  await supabase.auth.signOut();
  browserSupabase = null; // 로그아웃 시 인스턴스 제거
  // 필요하다면 페이지를 새로고침하거나 리디렉션합니다.
  window.location.reload();
} 