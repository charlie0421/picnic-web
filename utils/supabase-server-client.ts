import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import { cache } from 'react';

// createClient 함수를 캐싱하여 동일한 요청 내에서 재사용
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookie = await cookieStore.get(name);
          return cookie?.value;
        },
        async set(name: string, value: string, options: any) {
          try {
            await cookieStore.set({ name, value, ...options });
          } catch (error) {
            // 쿠키 설정 실패 시 무시
          }
        },
        async remove(name: string, options: any) {
          try {
            await cookieStore.delete({ name, ...options });
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
