import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  extractSupabaseStorageReference,
  type AvatarTransformOptions,
} from '@/utils/image-utils';

export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const duration =
    typeof expiresIn === 'number' && !Number.isNaN(expiresIn)
      ? Math.max(1, Math.floor(expiresIn))
      : 60 * 60;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, duration, options);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || '서명 URL 생성에 실패했습니다.' },
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

