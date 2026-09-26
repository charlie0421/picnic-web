import { NextResponse } from 'next/server';
import {
  createSupabaseServerClient,
  isWithdrawnUser,
} from '@/lib/supabase/server';
import {
  MAX_REQUEST_BYTES,
  isFileEntry,
  validateAttachments,
} from '@/lib/qna/attachment-policy';

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError('User not authenticated.', 401);
    }

    if (await isWithdrawnUser(user.id)) {
      return jsonError('A member who has unsubscribed.', 403);
    }

    const rawContentLength = req.headers.get('content-length');
    if (rawContentLength) {
      if (!/^\d+$/.test(rawContentLength)) {
        return jsonError('Invalid Content-Length.', 400);
      }
      const contentLength = Number(rawContentLength);
      if (!Number.isSafeInteger(contentLength)) {
        return jsonError('Invalid Content-Length.', 400);
      }
      if (contentLength > MAX_REQUEST_BYTES) {
        return jsonError('Request body is too large.', 413);
      }
    }

    const formData = await req.formData();
    const rawContent = formData.get('content');
    const content = typeof rawContent === 'string' ? rawContent : '';
    const rawThreadId = formData.get('thread_id');
    // Support multiple attachments sent as repeated "attachments" fields
    const files = formData
      .getAll('attachments')
      .filter(
        (file): file is File => isFileEntry(file) && file.size > 0,
      );

    if (
      typeof rawThreadId !== 'string' ||
      !/^[1-9]\d*$/.test(rawThreadId)
    ) {
      return jsonError('Thread ID must be a positive integer.', 400);
    }
    const threadId = Number(rawThreadId);
    if (!Number.isSafeInteger(threadId)) {
      return jsonError('Thread ID must be a positive integer.', 400);
    }

    const validation = await validateAttachments(files);
    if (!validation.ok) {
      return jsonError(validation.error, validation.status);
    }
    const verifiedFiles = validation.files;

    if (
      !content.trim() &&
      (files.length === 0 || files.every((file) => file.size === 0))
    ) {
      return jsonError('Content or attachment is required.', 400);
    }

    const { data: thread, error: threadError } = await supabase
      .from('qna_threads')
      .select('id')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (threadError) {
      console.error('Error checking Q&A thread ownership:', threadError);
      return jsonError('Failed to verify thread ownership.', 500);
    }
    if (!thread) {
      return jsonError('Thread not found or access denied.', 403);
    }

    const { data: messageData, error: messageError } = await supabase
      .from('qna_messages')
      .insert({
        thread_id: threadId,
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (messageError || !messageData) {
      console.error('Error creating message:', messageError);
      return NextResponse.json({ success: false, error: 'Failed to create the message.' }, { status: 500 });
    }

    if (verifiedFiles.length > 0) {
      for (const { file, contentType, ext } of verifiedFiles) {
        if (!file || file.size === 0) continue;

        // Generate UUID filename with an extension derived from verified magic.
        const uuid =
          globalThis.crypto?.randomUUID?.() ||
          Math.random().toString(36).slice(2);
        const originalName = file.name || '';

        const safeFileName = `${uuid}${ext}`;
        const filePath = `${user.id}/${threadId}/${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from('qna_attachments')
          .upload(filePath, file, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          return NextResponse.json({ success: false, error: 'Failed to upload attachment.' }, { status: 500 });
        }

        const { error: attachmentError } = await supabase
          .from('qna_attachments')
          .insert({
            message_id: messageData.id,
            file_name: originalName || safeFileName,
            file_path: filePath,
            file_type: contentType,
            file_size: file.size
          });

        if (attachmentError) {
          console.error('Error saving attachment metadata:', attachmentError);
          return NextResponse.json({ success: false, error: 'Failed to save attachment metadata.' }, { status: 500 });
        }
      }
    }

    // Fetch full message with relations
    const { data: fullMessage, error: fetchError } = await supabase
      .from('qna_messages')
      .select(
        `
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
      `
      )
      .eq('id', messageData.id)
      .single();

    if (fetchError || !fullMessage) {
      console.error('Error fetching full message after insert:', fetchError);
      return NextResponse.json({ success: true, data: messageData });
    }

    // Normalize user_profiles and convert file paths to public URLs
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

    return NextResponse.json({ success: true, data: fullMessage });
  } catch (error) {
    console.error('Unexpected error in POST /api/qna/messages:', error);
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
