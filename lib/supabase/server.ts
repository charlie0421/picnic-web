import { createServerClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import type { CookieOptions } from '@supabase/ssr';

// 쿠키 스토어 인터페이스
export interface CookieStore {
  get: (name: string) => { name: string; value: string } | undefined;
  set: (cookie: { name: string; value: string; [key: string]: any }) => void;
  remove?: (name: string, options?: any) => void;
}

/**
 * pages 라우터와 app 라우터 모두에서 사용할 수 있는 서버 Supabase 클라이언트 생성 함수
 * 
 * @param cookieStore 쿠키 저장소 (headers API 또는 req/res 객체)
 * @returns Supabase 클라이언트
 */
export function createServerSupabaseClientWithCookies(cookieStore: CookieStore) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.');
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.');
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        async get(name: string) {
          const cookie = await Promise.resolve(cookieStore.get(name));
          return cookie?.value;
        },
        async set(name: string, value: string, options: CookieOptions) {
          try {
            await Promise.resolve(cookieStore.set({ name, value, ...options }));
          } catch (error) {
            // 쿠키 설정 실패 시 로깅 (개발 환경에서만)
            if (process.env.NODE_ENV !== 'production') {
              console.warn('서버 Supabase 클라이언트: 쿠키 설정 실패', error);
            }
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            if (cookieStore.remove) {
              await Promise.resolve(cookieStore.remove(name, options));
            } else {
              await Promise.resolve(cookieStore.set({ name, value: '', ...options, maxAge: 0 }));
            }
          } catch (error) {
            // 쿠키 삭제 실패 시 로깅 (개발 환경에서만)
            if (process.env.NODE_ENV !== 'production') {
              console.warn('서버 Supabase 클라이언트: 쿠키 삭제 실패', error);
            }
          }
        },
      },
    }
  );
}

// 페이지 라우터용 임시 해결책 - 빈 쿠키 스토어로 인증 없는 클라이언트 생성
const emptyCookieStore: CookieStore = {
  get: () => undefined,
  set: () => {}
};

/**
 * App Router용 서버 Supabase 클라이언트를 생성합니다.
 * Next.js의 cookies() API를 사용하여 인증 쿠키를 읽습니다.
 * 
 * @returns Supabase 클라이언트 인스턴스
 */
export async function createServerSupabaseClient() {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = cookies();
    
    const appRouterCookieStore: CookieStore = {
      get: (name: string) => {
        const cookie = cookieStore.get(name);
        return cookie ? { name: cookie.name, value: cookie.value } : undefined;
      },
      set: (cookie: { name: string; value: string; [key: string]: any }) => {
        try {
          cookieStore.set(cookie.name, cookie.value, cookie);
        } catch (error) {
          // 쿠키 설정 실패 시 로깅 (개발 환경에서만)
          if (process.env.NODE_ENV !== 'production') {
            console.warn('서버 Supabase 클라이언트: 쿠키 설정 실패', error);
          }
        }
      },
      remove: (name: string, options?: any) => {
        try {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        } catch (error) {
          // 쿠키 삭제 실패 시 로깅 (개발 환경에서만)
          if (process.env.NODE_ENV !== 'production') {
            console.warn('서버 Supabase 클라이언트: 쿠키 삭제 실패', error);
          }
        }
      }
    };
    
    return createServerSupabaseClientWithCookies(appRouterCookieStore);
  } catch (error) {
    // App Router가 아닌 환경에서는 빈 쿠키 스토어 사용 (Pages Router 등)
    console.warn('⚠️ App Router가 아닌 환경 - 빈 쿠키 스토어 사용:', error);
    return createServerSupabaseClientWithCookies(emptyCookieStore);
  }
}

/**
 * Pages Router에서 사용할 Supabase 클라이언트를 생성합니다.
 * req/res 객체를 통해 쿠키를 관리합니다.
 * 
 * @param req Next.js 요청 객체
 * @param res Next.js 응답 객체
 * @returns Supabase 클라이언트
 */
export function createServerSupabaseClientWithRequest(req: any, res: any) {
  // req/res 객체를 사용하여 쿠키 저장소 생성
  const cookieStore: CookieStore = {
    get: (name) => {
      const cookies = req.cookies;
      const value = cookies[name];
      return value ? { name, value } : undefined;
    },
    set: (cookie) => {
      const { name, value, maxAge, domain, path, sameSite, secure } = cookie;
      const cookieOptions = {
        maxAge: maxAge || 0,
        domain,
        path: path || '/',
        sameSite: sameSite || 'lax',
        secure: secure || false,
        httpOnly: true
      };
      
      res.setHeader('Set-Cookie', `${name}=${value}; ${Object.entries(cookieOptions)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => {
          if (k === 'httpOnly' || k === 'secure') return v ? k : '';
          if (k === 'maxAge') return v ? `Max-Age=${v}` : '';
          return `${k.charAt(0).toUpperCase() + k.slice(1)}=${v}`;
        })
        .filter(Boolean)
        .join('; ')}`);
    }
  };
  
  return createServerSupabaseClientWithCookies(cookieStore);
}

/**
 * 서버 컴포넌트에서 현재 인증 세션을 가져옵니다.
 * ⚠️ 내부적으로 getUser()를 사용하며, 더 빠른 getServerUser()를 직접 사용하는 것을 권장합니다.
 * @returns 현재 인증 세션 또는 null (호환성을 위해 세션 형태로 반환)
 */
export async function getServerSession() {
  const supabase = await createServerSupabaseClient();
  
  // getUser()로 사용자 정보 확인 (더 빠름)
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { data: { session: null }, error };
  }
  
  // 호환성을 위해 간단한 세션 객체 생성
  const mockSession = {
    user,
    access_token: 'token-from-cookies',
    refresh_token: null,
    expires_at: null,
    token_type: 'bearer' as const
  };
  
  return { data: { session: mockSession }, error: null };
}

/**
 * 서버 컴포넌트에서 현재 사용자 정보를 가져옵니다.
 * getSession()보다 빠르고 안정적입니다.
 * @returns 현재 사용자 정보 또는 null
 */
export async function getServerUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      // AuthSessionMissingError는 정상적인 로그아웃 상태이므로 경고만 표시
      if (error.message?.includes('Auth session missing')) {
        // 인증 세션이 없는 정상적인 상태
        return null;
      }
      console.warn('🔍 [Server] getUser 오류:', error);
      return null;
    }
    
    return user;
  } catch (error) {
    // 예상치 못한 오류 처리
    console.warn('🔍 [Server] getUser 예외:', error);
    return null;
  }
}

/**
 * 주어진 콜백을 인증된 사용자 컨텍스트에서 실행하는 유틸리티 함수입니다.
 * 인증되지 않은 경우 오류를 발생시킵니다.
 * 
 * @example
 * const result = await withAuth(async (userId) => {
 *   // 인증된 사용자에 대한 작업 수행
 *   return await db.users.findUnique({ where: { id: userId } });
 * });
 * 
 * @param callback 인증된 사용자 ID를 인자로 받는 콜백 함수
 * @returns 콜백 함수의 결과
 * @throws 인증되지 않은 경우 오류
 */
export async function withAuth<T>(
  callback: (userId: string) => Promise<T>
): Promise<T> {
  const user = await getServerUser();
  
  if (!user) {
    throw new Error('인증이 필요합니다');
  }
  
  return callback(user.id);
} 

/**
 * 정적 렌더링에서 공개 데이터 조회용 Supabase 클라이언트
 * 쿠키를 사용하지 않아 정적 렌더링과 ISR에서 안전하게 사용 가능
 * @returns 인증 없는 공개 데이터 전용 Supabase 클라이언트
 */
export function createPublicSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.');
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.');
  }

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        // 정적 렌더링을 위한 빈 쿠키 핸들러
        async get() { return undefined; },
        async set() { /* no-op */ },
        async remove() { /* no-op */ },
      },
    }
  );
} 