'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cache } from 'react';

// NOTICE: Do not use this function on the client side.
// It is intended for server-side use only.
export const getNotices = cache(async () => {
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

    return data || [];
  } catch (error) {
    console.error('getNotices catch error:', error);
    return [];
  }
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
