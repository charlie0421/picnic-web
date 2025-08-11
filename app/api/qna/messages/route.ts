import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const content = (formData.get('content') as string) || '';
    const threadId = formData.get('thread_id') as string;
    // Support multiple attachments sent as repeated "attachments" fields
    const files = (formData.getAll('attachments') as File[]).filter(
      (f) => f && typeof f === 'object' && 'size' in f
    );

    if (!threadId) {
      return NextResponse.json({ error: 'Thread ID is required.' }, { status: 400 });
    }

    if (!content.trim() && (files.length === 0 || files.every((f) => f.size === 0))) {
      return NextResponse.json({ error: 'Content or attachment is required.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'User not authenticated.' }, { status: 401 });
    }

    const { data: messageData, error: messageError } = await supabase
      .from('qna_messages')
      .insert({
        thread_id: parseInt(threadId, 10),
        user_id: user.id,
        content,
      })
      .select()
      .single();

    if (messageError || !messageData) {
      console.error('Error creating message:', messageError);
      return NextResponse.json({ error: 'Failed to create the message.' }, { status: 500 });
    }

    if (files.length > 0) {
      for (const file of files) {
        if (!file || file.size === 0) continue;
        const filePath = `${user.id}/${threadId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('qna_attachments')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          return NextResponse.json({ error: 'Failed to upload attachment.' }, { status: 500 });
        }

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
          return NextResponse.json({ error: 'Failed to save attachment metadata.' }, { status: 500 });
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
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}


