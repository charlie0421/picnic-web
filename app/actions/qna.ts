'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createQnaThreadAction(formData: FormData) {
  const title = formData.get('title') as string;
  const content = formData.get('content') as string;

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

  const { error: messageError } = await supabase.from('qna_messages').insert({
    thread_id: threadData.id,
    user_id: user.id,
    content: content,
  });

  if (messageError) {
    console.error('Error creating initial message:', messageError);
    // Optional: Clean up the created thread if the message fails
    await supabase.from('qna_threads').delete().match({ id: threadData.id });
    return { error: 'Failed to create the initial message.' };
  }

  revalidatePath('/mypage/qna');
  redirect(`/mypage/qna/${threadData.id}`);
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
                file_size: file.size,
                is_image: file.type.startsWith('image/'),
            });
        
        if (attachmentError) {
            console.error('Error saving attachment metadata:', attachmentError);
            return { error: 'Failed to save attachment metadata.' };
        }
    }

    revalidatePath(`/mypage/qna/${threadId}`);
    return { success: true, data: messageData };
}
