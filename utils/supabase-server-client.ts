import {createServerClient} from '@supabase/ssr';
import { cache } from 'react';

/**
 * 동적 임포트를 사용하여 App Router 환경에서만 next/headers를 로드
 * Pages Router 환경에서는 대체 구현을 사용
 */
const getAppRouterCookieStore = async () => {
  try {
    // App Router 전용 API (동적 임포트)
    const { cookies } = await import('next/headers');
    return cookies();
  } catch (error) {
    // Pages Router 환경인 경우 호환 가능한 대체 구현 반환
    console.warn('next/headers를 가져올 수 없습니다. Pages Router 환경으로 대체합니다.');
    return {
      get: (name: string) => ({ 
        value: document?.cookie
          ?.split('; ')
          ?.find(row => row.startsWith(`${name}=`))
          ?.split('=')[1] 
      }),
      set: () => {},
      delete: () => {}
    };
  }
};

/**
 * 서버 환경 감지
 * 브라우저에서는 false, 서버에서는 true 반환
 */
const isServerEnvironment = () => {
  return typeof window === 'undefined';
};

// createClient 함수를 캐싱하여 동일한 요청 내에서 재사용
export const createClient = cache(async () => {
  // 서버 환경이 아닌 경우 대체 구현 반환
  if (!isServerEnvironment()) {
    throw new Error(
      'createClient는 서버 환경에서만 호출해야 합니다. 클라이언트에서는 createClientComponentClient를 사용하세요.'
    );
  }

  const cookieStore = await getAppRouterCookieStore();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookie = cookieStore.get(name);
          return cookie?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // 쿠키 설정 실패 시 무시
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.delete({ name, ...options });
          } catch (error) {
            // 쿠키 삭제 실패 시 무시
          }
        },
      },
    }
  );
});

// 서버 컴포넌트에서 사용할 수 있는 캐싱 포함 Supabase 클라이언트
export const createServerComponentClient = cache(async () => {
  return await createClient();
});
