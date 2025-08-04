import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SupabaseAuthError } from './error'
import { createClient } from '@supabase/supabase-js'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

export function createPublicSupabaseServerClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
}

// ------------------- 호환성을 위한 별칭 함수들 -------------------

/** @deprecated use createSupabaseServerClient instead */
export const createServerSupabaseClient = createSupabaseServerClient;

/** @deprecated use createSupabaseServerClient instead */
export const createServerSupabaseClientWithCookies = createSupabaseServerClient;

/** @deprecated use createSupabaseServerClient instead */
export const createPublicSupabaseClient = createPublicSupabaseServerClient;


export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.warn(`[Auth] Supabase getUser error: ${error.message}`);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('[Auth] Unexpected error in getServerUser:', error);
    return null;
  }
}

export async function withAuth<T>(
  callback: (userId: string) => Promise<T>
): Promise<T> {
  const user = await getServerUser();
  if (!user) {
    throw new SupabaseAuthError('Authentication required.');
  }
  return callback(user.id);
} 