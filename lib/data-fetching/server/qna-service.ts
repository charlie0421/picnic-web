import { createSupabaseServerClient } from '@/lib/supabase/server';
import { QnaThreads as QnaThread } from '@/types/interfaces';
import type { Pagination } from '@/types/mypage-common';
import { PostgrestError } from '@supabase/supabase-js';

interface GetQnaThreadsParams {
  page?: number;
  limit?: number;
}

interface GetQnaThreadsResult {
  qnaThreads: QnaThread[] | null;
  pagination: Pagination | null;
  error: PostgrestError | string | null;
}

export async function getQnaThreads({
  page = 1,
  limit = 10,
}: GetQnaThreadsParams): Promise<GetQnaThreadsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { qnaThreads: [], pagination: null, error: 'User not authenticated' };
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const { data, error, count } = await supabase
      .from('qna_threads')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching Q&A threads:', error);
      return { qnaThreads: null, pagination: null, error };
    }

    const totalCount = count ?? 0;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      qnaThreads: data as QnaThread[],
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
      },
      error: null,
    };
  } catch (e) {
    const error = e as Error;
    console.error('Unexpected error fetching Q&A threads:', error);
    return {
      qnaThreads: null,
      pagination: null,
      error: error.message,
    };
  }
}

export async function getQnaThreadDetails(threadId: number) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'User not authenticated' };
  }

  let { data, error } = await supabase
    .from('qna_threads')
    .select(
      `
      id,
      user_id,
      title,
      status,
      created_at,
      updated_at,
      qna_messages (
        id,
        thread_id,
        content,
        created_at,
        is_admin_message,
        user_id,
        user_profiles (
          avatar_url,
          nickname
        ),
        qna_attachments (
          id,
          message_id,
          file_name,
          file_path,
          file_type,
          file_size,
          created_at
        )
      )
    `
    )
    .eq('id', threadId)
    .eq('user_id', user.id)
    .single();

  if (error) {
    console.error(`Error fetching Q&A thread ${threadId}:`, error);
    return { data: null, error };
  }
  
      if (data && data.qna_messages) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const customDomain = 'https://api.picnic.fan';

      console.log('[Debug QNA Service] Supabase URL from env:', supabaseUrl);
      console.log('[Debug QNA Service] Custom Domain:', customDomain);

      data.qna_messages.forEach(message => {
        if (Array.isArray(message.user_profiles)) {
          (message as any).user_profiles = message.user_profiles[0] || null;
        }

        if (message.qna_attachments) {
          message.qna_attachments.forEach(attachment => {
            if (attachment.file_path) {
              const { data: publicUrlData } = supabase.storage
                .from('qna_attachments')
                .getPublicUrl(attachment.file_path);
              
              let publicUrl = publicUrlData.publicUrl;
              console.log(`[Debug QNA Service] Original Public URL for ${attachment.file_path}:`, publicUrl);
              
              if (supabaseUrl) {
                  publicUrl = publicUrl.replace(supabaseUrl, customDomain);
                  console.log(`[Debug QNA Service] Modified URL for ${attachment.file_path}:`, publicUrl);
              }
              attachment.file_path = publicUrl;
            }
          });
        }
      });
    }

  return { data: data as unknown as QnaThread, error: null };
}
