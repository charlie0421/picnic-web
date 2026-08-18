import type { Database } from '@/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { SupabaseAuthError } from './error'
import { createClient } from '@supabase/supabase-js'

function resolveCookieDomain(hostname: string | null | undefined) {
  if (!hostname) return undefined;
  // 로컬/개발 환경: 도메인 강제 설정 금지 (host-only 쿠키)
  if (
    hostname.includes('localhost') ||
    hostname.startsWith('127.') ||
    hostname.endsWith('.local')
  ) {
    return undefined;
  }
  // 프로덕션 도메인: picnic.fan 하위 도메인에서만 루트 도메인으로 고정
  if (hostname === 'picnic.fan' || hostname.endsWith('.picnic.fan')) {
    return '.picnic.fan';
  }
  // 이외 호스트(프리뷰/브랜치 등): 잘못된 크로스 도메인 방지를 위해 도메인 미설정
  return undefined;
}

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set in environment variables.");
  }
  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in environment variables.");
  }

  const reqHeaders = await headers();
  const currentHost = reqHeaders.get('host');
  const cookieDomain = resolveCookieDomain(currentHost);

  // ── @supabase/ssr 세대 불일치 격리 지점 ──────────────────────────────────
  // 설치된 @supabase/ssr@0.6.1 은 반환 타입을 SupabaseClient<Database, SchemaName, Schema>
  // 3-슬롯으로 하드코딩하는데, @supabase/supabase-js@2.86.2 의 SupabaseClient 는
  // <Database, SchemaNameOrClientOptions, SchemaName, Schema, ClientOptions> 5-슬롯이다.
  // 그래서 ssr 이 3번째로 넘기는 Schema 객체가 신형의 SchemaName(문자열 제약) 슬롯에
  // 대입돼 TS2344 제약 위반이 나는데, 위반 지점이 node_modules 의 .d.ts 안이라
  // skipLibCheck: true 가 진단을 삼킨다. 그 결과 Schema 슬롯이 기본값 평가에서 never 로
  // 떨어지고, 이 클라이언트를 쓰는 모든 곳에서 .from() 의 행 타입이 never 가 된다
  // (제네릭만 붙였을 때 129건).
  //
  // 캐스트를 이 한 곳에 격리해 호출 지점들이 올바른 Database 타입을 받게 한다.
  // lib/supabase/typed-rpc.ts 가 RPC 에 대해 쓰는 것과 같은 전략이다.
  // 근본 해결은 @supabase/ssr 을 5-슬롯 세대에 맞는 버전으로 올리는 것이며,
  // 그때 tsconfig 의 skipLibCheck 를 false 로 두고 TS2344 가 사라지면 완치 판정이다.
  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            const sanitized: CookieOptions = { ...options };
            // 도메인 강제/제거 정책 적용
            if (cookieDomain) {
              sanitized.domain = cookieDomain;
            } else if (sanitized.domain) {
              delete sanitized.domain;
            }
            cookieStore.set({ name, value, ...sanitized })
          } catch (error) {
            // The `set` method was called from a Server Component.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            const sanitized: CookieOptions = { ...options };
            if (cookieDomain) {
              sanitized.domain = cookieDomain;
            } else if (sanitized.domain) {
              delete sanitized.domain;
            }
            cookieStore.set({ name, value: '', ...sanitized })
          } catch (error) {
            // The `delete` method was called from a Server Component.
          }
        },
      },
    }
  ) as unknown as SupabaseClient<Database>
}

export function createPublicSupabaseServerClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not set in environment variables.");
  }
  if (!supabaseAnonKey) {
    throw new Error("SUPABASE_ANON_KEY is not set in environment variables.");
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
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

/**
 * 탈퇴 회원 에러 클래스
 */
export class WithdrawnUserError extends Error {
  constructor(message = 'A member who has unsubscribed.') {
    super(message);
    this.name = 'WithdrawnUserError';
  }
}

/**
 * 사용자가 탈퇴 회원인지 확인
 * @param userId 확인할 사용자 ID
 * @returns 탈퇴 회원이면 true, 아니면 false
 */
export async function isWithdrawnUser(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('deleted_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn(`[Auth] Failed to check user withdrawal status: ${error.message}`);
    return false;
  }

  return profile?.deleted_at != null;
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

/**
 * 인증 및 탈퇴 회원 체크를 포함한 래퍼 함수
 * 탈퇴 회원이면 WithdrawnUserError를 throw
 */
export async function withAuthAndWithdrawalCheck<T>(
  callback: (userId: string) => Promise<T>
): Promise<T> {
  const user = await getServerUser();
  if (!user) {
    throw new SupabaseAuthError('Authentication required.');
  }

  // 탈퇴 회원 체크
  const isWithdrawn = await isWithdrawnUser(user.id);
  if (isWithdrawn) {
    throw new WithdrawnUserError();
  }

  return callback(user.id);
} 