import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/supabase/server';
import {
  extractSupabaseStorageReference,
  type AvatarTransformOptions,
} from '@/utils/image-utils';

export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Buckets that authenticated users are allowed to generate signed URLs for. */
const ALLOWED_BUCKETS = ['avatars', 'media', 'public'];

/** Maximum signed URL lifetime (1 hour) to limit blast radius of leaked URLs. */
const MAX_EXPIRES_IN = 60 * 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUserScopedPath(path: string): { uuid: string } | null {
  const firstSegment = path.split('/')[0] ?? '';
  if (UUID_REGEX.test(firstSegment)) {
    return { uuid: firstSegment };
  }
  return null;
}

interface RequestPayload {
  bucket?: string;
  path?: string;
  sourceUrl?: string;
  expiresIn?: number;
  transform?: AvatarTransformOptions;
}

function sanitizeTransformOptions(
  transform?: AvatarTransformOptions,
): Record<string, number | string> {
  if (!transform) {
    return {};
  }

  const sanitized: Record<string, number | string> = {};

  if (typeof transform.width === 'number' && !Number.isNaN(transform.width)) {
    sanitized.width = Math.max(1, Math.round(transform.width));
  }

  if (typeof transform.height === 'number' && !Number.isNaN(transform.height)) {
    sanitized.height = Math.max(1, Math.round(transform.height));
  }

  if (
    typeof transform.quality === 'number' &&
    !Number.isNaN(transform.quality)
  ) {
    sanitized.quality = Math.min(100, Math.max(1, Math.round(transform.quality)));
  }

  if (transform.resize) {
    sanitized.resize = transform.resize;
  }

  if (transform.format) {
    sanitized.format = transform.format;
  }

  return sanitized;
}

export async function POST(request: NextRequest) {
  // Authentication check: only logged-in users can generate signed URLs
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json(
      { error: '인증이 필요합니다.' },
      { status: 401 },
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Supabase 환경변수가 설정되지 않았습니다.' },
      { status: 500 },
    );
  }

  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch (error) {
    return NextResponse.json(
      { error: '잘못된 요청 형식입니다.' },
      { status: 400 },
    );
  }

  let { bucket, path, sourceUrl, expiresIn = 60 * 60, transform } = payload;

  if ((!bucket || !path) && typeof sourceUrl === 'string') {
    const reference = extractSupabaseStorageReference(sourceUrl);
    if (reference) {
      bucket = reference.bucket;
      path = reference.path;
    }
  }

  bucket = bucket?.trim() || '';
  path = path?.replace(/^\/+/, '').trim() || '';

  if (!bucket || !path) {
    return NextResponse.json(
      { error: 'bucket 또는 path 정보가 부족합니다.' },
      { status: 400 },
    );
  }

  // Validate bucket against allowlist to prevent access to unauthorized storage
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json(
      { error: '허용되지 않은 버킷입니다.' },
      { status: 403 },
    );
  }

  // Per-bucket path ownership enforcement.
  // - 'media': user-uploaded content. If the first segment is a UUID, it must
  //   match the authenticated user. Non-UUID prefixes (shared/common media)
  //   are allowed by design.
  // - 'avatars': intentionally NOT prefix-checked. Avatars are publicly
  //   readable across users, and we have no reliable way to distinguish
  //   "viewing another user's avatar" (legitimate) from "signing someone
  //   else's avatar path" (also harmless, since avatars are public-read).
  //   Adding a check here would break legitimate cross-user avatar fetches.
  // - 'public': shared assets, no user ownership concept.
  if (bucket === 'media') {
    const scoped = isUserScopedPath(path);
    if (scoped && scoped.uuid.toLowerCase() !== user.id.toLowerCase()) {
      return NextResponse.json(
        { error: '해당 경로에 대한 권한이 없습니다.' },
        { status: 403 },
      );
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });

  const sanitizedTransform = sanitizeTransformOptions(transform);

  const options: {
    download?: string;
    transform?: Record<string, number | string>;
  } = {};

  if (Object.keys(sanitizedTransform).length > 0) {
    options.transform = sanitizedTransform;
  }

  const requestedExpires =
    typeof expiresIn === 'number' && !Number.isNaN(expiresIn)
      ? expiresIn
      : MAX_EXPIRES_IN;
  const duration = Math.min(
    MAX_EXPIRES_IN,
    Math.max(1, Math.floor(requestedExpires)),
  );

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, duration, options);

    if (error || !data?.signedUrl) {
      // Never surface Supabase error.message to clients — it can leak bucket
      // internals or path existence. Log server-side only.
      console.error('🖼️ [API] Supabase 서명 URL 생성 실패:', error);
      return NextResponse.json(
        { error: '서명 URL 생성에 실패했습니다.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        url: data.signedUrl,
        path,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('🖼️ [API] Supabase 서명 URL 생성 오류:', error);
    return NextResponse.json(
      { error: '서명 URL 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

