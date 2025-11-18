'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cache } from 'react';

const SUPABASE_TIMEOUT_MS = 4000;

const FALLBACK_NOTICES = [
  {
    id: 0,
    title: {
      ko: '공지사항을 불러오지 못했습니다',
      en: 'Unable to load notices',
    },
    content: {
      ko: '잠시 후 다시 시도해주세요.',
      en: 'Please try again in a moment.',
    },
    created_at: new Date().toISOString(),
    is_pinned: false,
  },
] as const;

async function withTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        console.warn(`[notice-service] ${label} exceeded ${SUPABASE_TIMEOUT_MS}ms. Using fallback data.`);
        resolve(fallback);
      }, SUPABASE_TIMEOUT_MS);
    }),
  ]);
}

// NOTICE: Do not use this function on the client side.
// It is intended for server-side use only.
export const getNotices = cache(async () => {
  const fetchPromise = (async () => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('notices')
        .select('id, title, content, created_at, is_pinned')
        .eq('status', 'PUBLISHED')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('getNotices error:', error);
        throw new Error(error.message);
      }

      return (data || []).length > 0 ? data : [...FALLBACK_NOTICES];
    } catch (error) {
      console.error('getNotices catch error:', error);
      return [...FALLBACK_NOTICES];
    }
  })();

  return withTimeout(fetchPromise, [...FALLBACK_NOTICES], 'getNotices');
});

export const getNoticeById = async (id: number) => {
  if (isNaN(id)) {
    console.error('Invalid ID provided to getNoticeById');
    return { data: null, error: new Error('Invalid ID') };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .eq('id', id)
    .eq('status', 'PUBLISHED')
    .single();

  if (error) {
    console.error(`getNoticeById error:`, error);
    if (error.code === 'PGRST116') {
      return { data: null, error: new Error('Notice not found') };
    }
  }

  return { data, error: error ? new Error(error.message) : null };
};
