'use server';

import { createSupabaseServerClient, isWithdrawnUser } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isFileEntry, validateAttachments } from '@/lib/qna/attachment-policy';

export async function createQnaThreadAction(_: { error: string | null }, formData: FormData) {
  let title = formData.get('title') as string;
  const content = formData.get('content') as string;
  const lang = (formData.get('lang') as string) || 'en';
  const categoryCode = (formData.get('category_code') as string) || null;
  const files = formData
    .getAll('attachments')
    .filter((f): f is File => isFileEntry(f) && f.size > 0);

  // Initialize supabase client early (needed to fetch category label)
  const supabase = await createSupabaseServerClient();

  // Enforce title for CONCERT2025* categories as the category label (localized)
  if (categoryCode && categoryCode.startsWith('CONCERT2025')) {
    try {
      const { data: cat } = await supabase
        .from('qna_categories')
        .select('label')
        .eq('code', categoryCode)
        .single();
      const labelObj: any = cat?.label || {};
      const labelText = labelObj?.[lang] || labelObj?.['en'] || labelObj?.['ko'] || categoryCode || 'CONCERT2025';
      title = typeof labelText === 'string' ? labelText : String(labelText);
    } catch (e) {
      // Fallback if fetch fails
      title = 'CONCERT2025';
    }
  }

  if (!title.trim() || !content.trim()) {
    return { error: 'Title and content are required.' };
  }

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'User not authenticated.' };
  }

  // 탈퇴 회원 체크
  const isWithdrawn = await isWithdrawnUser(user.id);
  if (isWithdrawn) {
    return { error: 'A member who has unsubscribed.' };
  }

  // 스레드를 만들기 전에 첨부를 검증한다 (/api/qna/messages 와 같은 정책)
  const validation = await validateAttachments(files);
  if (!validation.ok) {
    return { error: validation.error };
  }

  const { data: threadData, error: threadError } = await supabase
    .from('qna_threads')
    .insert({ title, user_id: user.id, category_code: categoryCode })
    .select()
    .single();

  if (threadError || !threadData) {
    console.error('Error creating Q&A thread:', threadError);
    return { error: 'Failed to create a new Q&A thread.' };
  }

  const { data: messageData, error: messageError } = await supabase
    .from('qna_messages')
    .insert({
      thread_id: threadData.id,
      user_id: user.id,
      content: content,
    })
    .select()
    .single();

  if (messageError) {
    console.error('Error creating initial message:', messageError);
    // Optional: Clean up the created thread if the message fails
    await supabase.from('qna_threads').delete().match({ id: threadData.id });
    return { error: 'Failed to create the initial message.' };
  }

  // Handle attachments for the initial message
  if (validation.files.length > 0 && messageData) {
    for (const { file, contentType, ext } of validation.files) {
      try {
        const uuid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
        const originalName = file.name || '';
        const safeFileName = `${uuid}${ext}`;
        const filePath = `${user.id}/${threadData.id}/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('qna_attachments')
          .upload(filePath, file, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          console.error('Error uploading initial attachment:', uploadError);
          return { error: 'Failed to upload attachment.' };
        }

        const { error: attachmentError } = await supabase
          .from('qna_attachments')
          .insert({
            message_id: messageData.id,
            file_name: originalName || safeFileName,
            file_path: filePath,
            file_type: contentType,
            file_size: file.size,
          });

        if (attachmentError) {
          console.error('Error saving initial attachment metadata:', attachmentError);
          return { error: 'Failed to save attachment metadata.' };
        }
      } catch (e) {
        console.error('Unexpected error while handling initial attachments:', e);
        return { error: 'Failed to process attachments.' };
      }
    }
  }

  // Notify watchers/moderators (optional) about new question (basic: no watchers)
  try {
    await supabase.functions.invoke('notify-qna-event', {
      body: {
        type: 'question_created',
        question_id: threadData.id,
        question_author_id: user.id,
        watchers: [],
      }
    });
  } catch (_) {}

  revalidatePath(`/${lang}/mypage/qna`);
  revalidatePath(`/${lang}/mypage/qna/${threadData.id}`);
  redirect(`/${lang}/mypage/qna/${threadData.id}`);
}
