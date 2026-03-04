/**
 * 이미지 최적화 및 프록시 URL 생성
 */

import {
  AvatarTransformOptions,
  SUPABASE_RENDER_PATH,
  SUPABASE_RENDER_SIGN_PATH,
  SUPABASE_OBJECT_PATH,
  hasTransformOptions,
  sanitizeDimension,
  clampQuality,
} from './types';

export function getOptimizedSupabaseImageUrl(
  originalUrl: string,
  options: AvatarTransformOptions,
): string | null {
  if (!hasTransformOptions(options)) {
    return null;
  }

  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseBase) {
    return null;
  }

  try {
    const normalizedBase = supabaseBase.replace(/\/$/, '');
    const sourceUrl = new URL(originalUrl);
    const supabaseUrl = new URL(normalizedBase);

    if (sourceUrl.origin !== supabaseUrl.origin) {
      return null;
    }

    let resourcePath: string | null = null;
    let isSignedPath = false;

    if (sourceUrl.pathname.startsWith(`${SUPABASE_OBJECT_PATH}sign/`)) {
      isSignedPath = true;
      resourcePath = sourceUrl.pathname.slice(
        `${SUPABASE_OBJECT_PATH}sign/`.length,
      );
    } else if (sourceUrl.pathname.startsWith(SUPABASE_OBJECT_PATH)) {
      resourcePath = sourceUrl.pathname.slice(SUPABASE_OBJECT_PATH.length);
    } else if (sourceUrl.pathname.startsWith(SUPABASE_RENDER_PATH)) {
      resourcePath = sourceUrl.pathname.slice(SUPABASE_RENDER_PATH.length);
    } else if (sourceUrl.pathname.startsWith(SUPABASE_RENDER_SIGN_PATH)) {
      isSignedPath = true;
      resourcePath = sourceUrl.pathname.slice(SUPABASE_RENDER_SIGN_PATH.length);
    }

    if (!resourcePath) {
      return null;
    }

    if (resourcePath.startsWith('/')) {
      resourcePath = resourcePath.slice(1);
    }

    const params = new URLSearchParams(sourceUrl.search);
    ['w', 'width', 'h', 'height', 'resize', 'quality', 'format'].forEach(
      (key) => params.delete(key),
    );

    const width = sanitizeDimension(options.width);
    const height = sanitizeDimension(options.height);
    const quality = clampQuality(options.quality);

    if (width) {
      params.set('width', width.toString());
    }
    if (height) {
      params.set('height', height.toString());
    }

    if (options.resize) {
      params.set('resize', options.resize);
    } else if (width || height) {
      params.set('resize', 'cover');
    }

    if (quality) {
      params.set('quality', quality.toString());
    } else if (width || height) {
      params.set('quality', '85');
    }

    if (options.format) {
      params.set('format', options.format);
    }

    const query = params.toString();
    const renderPath = isSignedPath
      ? `${normalizedBase}${SUPABASE_RENDER_SIGN_PATH}${resourcePath}`
      : `${normalizedBase}${SUPABASE_RENDER_PATH}${resourcePath}`;

    return `${renderPath}${query ? `?${query}` : ''}`;
  } catch (error) {
    console.warn('🖼️ [ImageUtils] Supabase 이미지 변환 실패:', {
      originalUrl,
      options,
      error,
    });
    return null;
  }
}

/**
 * 프록시를 통해 이미지 URL을 가져오는 함수
 */
export function getProxiedImageUrl(originalUrl: string): string {
  try {
    const encodedUrl = encodeURIComponent(originalUrl);
    return `/api/proxy-image?url=${encodedUrl}`;
  } catch (error) {
    console.warn('🖼️ [ImageUtils] 프록시 URL 생성 실패:', originalUrl, error);
    return originalUrl;
  }
}

/**
 * Google 이미지 URL을 안전한 형태로 변환
 */
export function getSafeGoogleImageUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Google 이미지 서비스인지 확인
    if (urlObj.hostname.includes('googleusercontent.com')) {
      // 이미지 크기를 작게 조정하여 요청 부하 감소
      const searchParams = new URLSearchParams(urlObj.search);

      // 기존 크기 파라미터 제거하고 작은 크기로 설정
      if (urlObj.pathname.includes('=s') || urlObj.search.includes('sz=')) {
        // s96-c 형태의 크기 파라미터를 s64-c로 변경
        url = url.replace(/=s\d+-c/, '=s64-c');
        url = url.replace(/sz=\d+/, 'sz=64');
      } else {
        // 크기 파라미터가 없으면 추가
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}sz=64`;
      }

      // 캐시 버스팅을 위한 타임스탬프 추가 (하루 단위)
      const dayTimestamp = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}t=${dayTimestamp}`;
    }

    return url;
  } catch (error) {
    console.warn('🖼️ [ImageUtils] Google 이미지 URL 변환 실패:', url, error);
    return url;
  }
}
