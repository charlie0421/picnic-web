import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import type { CookieOptions } from "@supabase/ssr";

/**
 * 서버 환경 체크 - 엄격한 검증
 */
function assertServerEnvironment() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createClient는 서버 환경에서만 호출해야 합니다. 클라이언트에서는 createClientComponentClient를 사용하세요.",
    );
  }
  
  if (typeof process === "undefined") {
    throw new Error("서버 환경이 아닙니다. process 객체를 찾을 수 없습니다.");
  }
}

/**
 * 안전한 쿠키 스토어 생성 함수
 */
async function createSafeCookieStore() {
  try {
    const { cookies } = await import("next/headers");
    
    const cookieStore = await cookies();
    
    return {
      get: (name: string) => {
        try {
          const cookie = cookieStore.get(name);
          return cookie?.value;
        } catch (error) {
          // Request scope 밖에서 호출된 경우 undefined 반환
          return undefined;
        }
      },
      set: (name: string, value: string, options?: CookieOptions) => {
        try {
          cookieStore.set(name, value, options);
        } catch (error) {
          // Request scope 밖에서는 무시
        }
      },
      remove: (name: string, options?: CookieOptions) => {
        try {
          cookieStore.delete(name);
        } catch (error) {
          // Request scope 밖에서는 무시
        }
      },
    };
  } catch (error) {
    // next/headers를 사용할 수 없는 환경에서는 빈 구현 반환
    return {
      get: () => undefined,
      set: () => {},
      remove: () => {},
    };
  }
}

/**
 * 서버 컴포넌트에서만 사용할 수 있는 Supabase 클라이언트 생성
 * Next.js 15 App Router 환경에서 안전하게 cookies 사용
 */
export const createClient = cache(async () => {
  assertServerEnvironment();

  const cookieStore = await createSafeCookieStore();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name);
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.remove(name, options);
        },
      },
    },
  );
});

export default createClient;

/**
 * 서버 액션에서 사용할 수 있는 Supabase 클라이언트
 */
export async function createServerActionClient() {
  assertServerEnvironment();
  
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();

    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete(name);
          },
        },
      },
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn("서버 액션에서 next/headers 사용 불가능:", error);
    }
    
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: () => undefined,
          set: () => {},
          remove: () => {},
        },
      },
    );
  }
}

// 호환성을 위한 deprecated 별칭
export const createServerComponentClient = createClient; 