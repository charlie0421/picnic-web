import 'server-only';

import { createPublicSupabaseServerClient } from '@/lib/supabase/server';
import { cache } from 'react';

const SUPABASE_TIMEOUT_MS = 4000;

// notice 목록·상세 페이지는 ISR 이다.
// - 쿠키 없는 공개 클라이언트로 조회한다 (notices: RLS 없음).
// - 조회 실패·타임아웃은 예외로 전파한다. 예전에는 "공지사항을 불러오지 못했습니다" 가짜 공지나 오류 문구를
//   정상 결과처럼 반환했는데, ISR 에서는 그 화면이 캐시에 저장돼 정상 페이지를 덮는다.
//   예외면 Next 가 마지막 정상 페이지를 계속 제공하고 다음 요청에서 다시 시도한다.
// - sitemap 도 getNotices 를 쓴다. sitemap 은 try/catch 로 공지 구간만 건너뛴다.

async function rejectOnTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`[notice-service] ${label} exceeded ${SUPABASE_TIMEOUT_MS}ms`)),
          SUPABASE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// NOTICE: Do not use this function on the client side.
// It is intended for server-side use only.
export const getNotices = cache(async () => {
  const fetchNotices = async () => {
    const supabase = createPublicSupabaseServerClient();
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, content, created_at, is_pinned')
      .eq('status', 'PUBLISHED')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getNotices error:', error);
      throw new Error(`getNotices failed: ${error.message}`);
    }

    // 공지가 없는 것은 오류가 아니다 — 페이지가 "공지 없음" 을 보여 준다.
    return data ?? [];
  };

  return rejectOnTimeout(fetchNotices(), 'getNotices');
});

export const getNoticeById = async (id: number) => {
  if (isNaN(id)) {
    console.error('Invalid ID provided to getNoticeById');
    return { data: null, error: new Error('Invalid ID') };
  }

  const supabase = createPublicSupabaseServerClient();
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .eq('id', id)
    .eq('status', 'PUBLISHED')
    .single();

  if (error) {
    // 없는 공지(PGRST116)는 정상 응답이다. 그 밖의 오류는 조회 장애이므로 전파한다.
    if (error.code === 'PGRST116') {
      return { data: null, error: new Error('Notice not found') };
    }
    console.error(`getNoticeById error:`, error);
    throw new Error(`getNoticeById failed: ${error.message}`);
  }

  return { data, error: null };
};
