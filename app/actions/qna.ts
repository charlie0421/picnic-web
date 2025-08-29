'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createQnaThreadAction(_: { error: string | null }, formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;
  const lang = (formData.get('lang') as string) || 'en';
  const files = (formData.getAll('attachments') as File[]).filter(
    (f) => f && typeof f === 'object' && 'size' in f && (f as File).size > 0
  );

  if (!title.trim() || !content.trim()) {
    return { error: 'Title and content are required.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'User not authenticated.' };
  }

  const { data: threadData, error: threadError } = await supabase
    .from('qna_threads')
    .insert({ title, user_id: user.id })
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
  if (files.length > 0 && messageData) {
    for (const file of files) {
      try {
        const uuid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
        let ext = '';
        const originalName = file.name || '';
        const dotIndex = originalName.lastIndexOf('.');
        if (dotIndex !== -1 && dotIndex < originalName.length - 1) {
          ext = originalName.slice(dotIndex).toLowerCase();
        } else if (file.type) {
          const mime = file.type.toLowerCase();
          if (mime === 'image/jpeg') ext = '.jpg';
          else if (mime === 'image/png') ext = '.png';
          else if (mime === 'image/gif') ext = '.gif';
          else if (mime === 'video/mp4') ext = '.mp4';
          else if (mime === 'video/quicktime') ext = '.mov';
          else if (mime === 'image/webp') ext = '.webp';
          else ext = '';
        }

        const safeFileName = `${uuid}${ext}`;
        const filePath = `${user.id}/${threadData.id}/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('qna_attachments')
          .upload(filePath, file, {
            contentType: file.type || undefined,
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
            file_type: file.type,
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

  revalidatePath(`/${lang}/mypage/qna`);
  redirect(`/${lang}/mypage/qna/${threadData.id}`);
}

export async function createQnaMessageAction(formData: FormData) {
    const content = formData.get('content') as string;
    const threadId = formData.get('thread_id') as string;
    const file = formData.get('attachment') as File;

    if (!content.trim() || !threadId) {
        return { error: 'Content and thread ID are required.' };
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'User not authenticated.' };
    }

    // Insert the message first
    const { data: messageData, error: messageError } = await supabase
        .from('qna_messages')
        .insert({
            thread_id: parseInt(threadId, 10),
            user_id: user.id,
            content: content,
        })
        .select()
        .single();
    
    if (messageError) {
        console.error('Error creating message:', messageError);
        return { error: 'Failed to create the message.' };
    }

    // Handle file upload if a file is present
    if (file && file.size > 0) {
        const filePath = `${user.id}/${threadId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
            .from('qna_attachments')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading file:', uploadError);
            // Optionally, delete the message if upload fails
            return { error: 'Failed to upload attachment.' };
        }

        // Insert attachment metadata into the database
        const { error: attachmentError } = await supabase
            .from('qna_attachments')
            .insert({
                message_id: messageData.id,
                file_name: file.name,
                file_path: filePath,
                file_type: file.type,
                file_size: file.size
            });
        
        if (attachmentError) {
            console.error('Error saving attachment metadata:', attachmentError);
            return { error: 'Failed to save attachment metadata.' };
        }
    }

    // Re-fetch the full message with relations so the client can update the list without a full page refresh
    const { data: fullMessage, error: fetchError } = await supabase
        .from('qna_messages')
        .select(`
            id,
            thread_id,
            user_id,
            content,
            created_at,
            is_admin_message,
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
        `)
        .eq('id', messageData.id)
        .single();

    if (fetchError || !fullMessage) {
        console.error('Error fetching full message after insert:', fetchError);
        return { success: true, data: messageData };
    }

    // Convert storage paths to public URLs (same logic as in qna-service)
    try {
        if (Array.isArray((fullMessage as any).user_profiles)) {
            (fullMessage as any).user_profiles = (fullMessage as any).user_profiles[0] || null;
        }

        if ((fullMessage as any).qna_attachments) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const customDomain = 'https://api.picnic.fan';

            (fullMessage as any).qna_attachments.forEach((attachment: any) => {
                if (attachment.file_path) {
                    const { data: publicUrlData } = supabase.storage
                        .from('qna_attachments')
                        .getPublicUrl(attachment.file_path);
                    let publicUrl = publicUrlData.publicUrl;
                    if (supabaseUrl) {
                        publicUrl = publicUrl.replace(supabaseUrl, customDomain);
                    }
                    attachment.file_path = publicUrl;
                }
            });
        }
    } catch (e) {
        console.warn('Failed to transform attachment URLs:', e);
    }

    // Do NOT call revalidatePath here to avoid full-route refresh; client updates list optimistically
    return { success: true, data: fullMessage };
}
