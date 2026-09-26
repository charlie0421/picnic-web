import { NextResponse } from 'next/server';
import {
  createSupabaseServerClient,
  isWithdrawnUser,
} from '@/lib/supabase/server';

const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

const ATTACHMENT_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
} as const;

type AllowedAttachmentType = keyof typeof ATTACHMENT_TYPES;

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function isFileEntry(value: FormDataEntryValue): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as File).size === 'number' &&
    typeof (value as File).slice === 'function'
  );
}

function startsWithBytes(
  bytes: Uint8Array,
  expected: readonly number[],
  offset = 0,
): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

function ftypBrands(bytes: Uint8Array): string[] {
  if (asciiAt(bytes, 4, 4) !== 'ftyp') return [];

  const declaredBoxSize =
    ((bytes[0] ?? 0) * 0x1000000 +
      (bytes[1] ?? 0) * 0x10000 +
      (bytes[2] ?? 0) * 0x100 +
      (bytes[3] ?? 0)) >>>
    0;
  const boxEnd = Math.min(
    bytes.length,
    declaredBoxSize >= 16 ? declaredBoxSize : 64,
    64,
  );
  const brands = [asciiAt(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(asciiAt(bytes, offset, 4));
  }
  return brands;
}

function detectAttachmentType(bytes: Uint8Array): AllowedAttachmentType | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    startsWithBytes(bytes, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return 'image/png';
  }
  if (
    asciiAt(bytes, 0, 6) === 'GIF87a' ||
    asciiAt(bytes, 0, 6) === 'GIF89a'
  ) {
    return 'image/gif';
  }
  if (
    asciiAt(bytes, 0, 4) === 'RIFF' &&
    asciiAt(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }

  const brands = ftypBrands(bytes);
  if (brands.some((brand) => ['avif', 'avis'].includes(brand))) {
    return 'image/avif';
  }
  if (brands.length > 0) {
    return brands.includes('qt  ') ? 'video/quicktime' : 'video/mp4';
  }
  if (['moov', 'mdat', 'wide', 'free', 'skip'].includes(asciiAt(bytes, 4, 4))) {
    return 'video/quicktime';
  }
  return null;
}

async function detectFileType(
  file: File,
): Promise<AllowedAttachmentType | null> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return detectAttachmentType(bytes);
}

function normalizeDeclaredAttachmentType(contentType: string): string {
  return contentType === 'image/jpg' ? 'image/jpeg' : contentType;
}

function isAllowedAttachmentType(
  contentType: string,
): contentType is AllowedAttachmentType {
  return Object.hasOwn(ATTACHMENT_TYPES, contentType);
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

    if (files.length > MAX_ATTACHMENT_COUNT) {
      return jsonError('Too many attachments.', 400);
    }

    if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      return jsonError('An attachment is too large.', 413);
    }

    const totalAttachmentBytes = files.reduce(
      (total, file) => total + file.size,
      0,
    );
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return jsonError('Attachments are too large.', 413);
    }

    const verifiedFiles: Array<{
      file: File;
      contentType: AllowedAttachmentType;
    }> = [];
    for (const file of files) {
      const declaredContentType = normalizeDeclaredAttachmentType(
        file.type.toLowerCase(),
      );
      if (!isAllowedAttachmentType(declaredContentType)) {
        return jsonError('Unsupported attachment type.', 415);
      }
      const detectedContentType = await detectFileType(file);
      if (!detectedContentType) {
        return jsonError('Attachment content is not an allowed file type.', 415);
      }
      verifiedFiles.push({ file, contentType: detectedContentType });
    }

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
      for (const { file, contentType } of verifiedFiles) {
        if (!file || file.size === 0) continue;

        // Generate UUID filename with an extension derived from verified magic.
        const uuid =
          globalThis.crypto?.randomUUID?.() ||
          Math.random().toString(36).slice(2);
        const originalName = file.name || '';
        const ext = ATTACHMENT_TYPES[contentType];

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
