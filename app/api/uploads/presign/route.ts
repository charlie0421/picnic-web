import { NextRequest, NextResponse } from 'next/server';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getServerUser } from '@/lib/supabase/server';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // Authentication: only logged-in users may obtain presigned upload URLs.
    // Without this, any unauthenticated client could upload arbitrary files
    // (including HTML/JS) into the posts/ prefix up to MAX_UPLOAD_BYTES.
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bucket = process.env.S3_BUCKET as string;
    if (!bucket) {
      console.error('S3_BUCKET env var not configured');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const body = (await req.json().catch(() => null)) as
      | { contentType?: unknown; filename?: unknown }
      | null;
    const contentType = typeof body?.contentType === 'string' ? body.contentType : '';

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 415 }
      );
    }

    // Server-derived key. The client-supplied filename is intentionally NOT
    // used in the S3 path to prevent path traversal and to keep uploads
    // namespaced under the authenticated user's ID for ownership checks.
    const ext = EXT_BY_TYPE[contentType] ?? 'bin';
    const key = `posts/${user.id}/${randomUUID()}.${ext}`;

    const { url, fields } = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 0, MAX_UPLOAD_BYTES],
        ['eq', '$Content-Type', contentType],
      ],
      Expires: 60,
      Fields: { 'Content-Type': contentType },
    });

    return NextResponse.json({
      url,
      fields,
      key,
      publicUrl: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  } catch (e) {
    console.error('presign error:', e);
    return NextResponse.json({ error: 'failed to presign' }, { status: 500 });
  }
}
