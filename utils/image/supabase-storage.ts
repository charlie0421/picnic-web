/**
 * Supabase Storage URL 파싱 및 서명 URL 생성
 */

import {
  AvatarTransformOptions,
  AvatarDebugLogPayload,
  SupabaseStorageReference,
  SUPABASE_OBJECT_PATH,
  ENABLE_AVATAR_DEBUG,
  encodePathSegment,
} from './types';

export function getSupabaseBase(): string | null {
  const supabaseBase =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
  if (!supabaseBase) {
    return null;
  }
  return supabaseBase.replace(/\/$/, '');
}

export function getSupabaseHost(): string | null {
  const base = getSupabaseBase();
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
  }
}

export function buildSupabaseObjectUrl(
  reference: SupabaseStorageReference,
): string | null {
  if (!reference.isPublic) {
    return null;
  }
  const base = getSupabaseBase();
  if (!base) return null;

  const bucket = encodePathSegment(reference.bucket);
  const pathSegments = reference.path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodePathSegment(segment));

  const objectPath = `${SUPABASE_OBJECT_PATH}public/${bucket}/${pathSegments.join('/')}`;
  return `${base}${objectPath}`;
}

export function sendAvatarDebugLog(payload: AvatarDebugLogPayload) {
  if (!ENABLE_AVATAR_DEBUG) return;
  try {
    const body = JSON.stringify({
      ...payload,
      loggedAt: Date.now(),
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/logs/avatar', blob);
    } else if (typeof fetch !== 'undefined') {
      fetch('/api/logs/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } else {
      console.info('🖼️ [AvatarDebug]', payload);
    }
  } catch (error) {
    console.warn('🖼️ [AvatarDebug] 로그 전송 실패:', error);
  }
}

export function extractSupabaseStorageReference(
  source: string | null | undefined,
): SupabaseStorageReference | null {
  if (!source) return null;

  const supabaseHost = getSupabaseHost();
  if (!supabaseHost) return null;

  const decodePathSegments = (segments: string[]) =>
    segments.map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const url = new URL(source);
      if (url.host !== supabaseHost) {
        return null;
      }

      const segments = url.pathname.split('/').filter(Boolean);
      const token = url.searchParams.get('token') || undefined;
      let bucket: string | undefined;
      let pathSegments: string[] = [];
      let isSigned = Boolean(token);
      let isPublic = false;

      const objectIndex = segments.indexOf('object');
      const renderIndex = segments.indexOf('render');

      if (objectIndex !== -1) {
        let idx = objectIndex + 1;
        if (segments[idx] === 'public') {
          isPublic = true;
          idx += 1;
        } else if (segments[idx] === 'sign') {
          isSigned = true;
          idx += 1;
        }
        bucket = segments[idx];
        pathSegments = segments.slice(idx + 1);
      } else if (renderIndex !== -1) {
        let idx = renderIndex + 2; // skip 'render', 'image'
        if (segments[idx - 1] !== 'image') {
          return null;
        }
    if (segments[idx] === 'sign') {
          isSigned = true;
          idx += 1;
    } else if (segments[idx] === 'public') {
      isPublic = true;
      idx += 1;
        }
        bucket = segments[idx];
        pathSegments = segments.slice(idx + 1);
      }

      if (!bucket || pathSegments.length === 0) {
        return null;
      }

      return {
        bucket,
        path: decodePathSegments(pathSegments).join('/'),
        isSigned,
        isPublic,
        originalUrl: url.toString(),
      };
    } catch (error) {
      console.warn('🖼️ [ImageUtils] Supabase URL 파싱 실패:', {
        source,
        error,
      });
      return null;
    }
  }

  const cleaned = source.replace(/^\/+/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const [bucket, ...rest] = parts;
  return {
    bucket,
    path: decodePathSegments(rest).join('/'),
    isSigned: false,
    isPublic: false,
    originalUrl: source,
  };
}

export async function fetchSignedSupabaseImageUrl(
  reference: SupabaseStorageReference | null,
  transform: AvatarTransformOptions = {},
  options: { signal?: AbortSignal; expiresIn?: number } = {},
): Promise<string | null> {
  if (!reference || reference.isSigned) {
    return null;
  }

  if (typeof fetch === 'undefined') {
    return null;
  }

  try {
    const response = await fetch('/api/storage/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucket: reference.bucket,
        path: reference.path,
        expiresIn: options.expiresIn ?? 60 * 60, // 1 hour
        transform,
      }),
      signal: options.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('🖼️ [ImageUtils] 서명 URL 생성 실패:', {
        status: response.status,
        body: errorText,
      });
      return null;
    }

    const data = await response.json();
    return typeof data?.url === 'string' ? data.url : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    console.warn('🖼️ [ImageUtils] 서명 URL 요청 오류:', error);
    return null;
  }
}
