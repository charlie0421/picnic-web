/**
 * 이미지 URL 검증 및 안전한 처리 유틸리티
 */

export interface AvatarTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  format?: 'webp' | 'png' | 'jpg' | 'jpeg' | 'avif';
}

const SUPABASE_RENDER_PATH = '/storage/v1/render/image/';
const SUPABASE_RENDER_SIGN_PATH = '/storage/v1/render/image/sign/';
const SUPABASE_OBJECT_PATH = '/storage/v1/object/';
const ENABLE_AVATAR_DEBUG =
  process.env.NEXT_PUBLIC_ENABLE_AVATAR_LOG === 'true';

type AvatarDebugStep = {
  stage: string;
  url?: string | null;
  result?: 'success' | 'error';
  message?: string;
  isSignedCandidate?: boolean;
  timestamp?: number;
};

interface AvatarDebugLogPayload {
  original: string | null | undefined;
  final: string;
  isFallback: boolean;
  isSigned: boolean;
  transform: AvatarTransformOptions;
  steps: AvatarDebugStep[];
}
 
export interface SupabaseStorageReference {
  bucket: string;
  path: string;
  isSigned: boolean;
  isPublic: boolean;
  originalUrl?: string;
}

export interface ResolveAvatarOptions {
  fallbackUrl?: string;
  useProxy?: boolean;
  signal?: AbortSignal;
  expiresIn?: number;
}

function hasTransformOptions(options: AvatarTransformOptions): boolean {
  return Boolean(
    options &&
      (options.width ||
        options.height ||
        options.quality ||
        options.resize ||
        options.format),
  );
}

function sanitizeDimension(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.max(1, Math.round(value));
}

function clampQuality(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(100, Math.max(1, Math.round(value)));
}

function encodePathSegment(segment: string): string {
  try {
    return encodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function buildSupabaseObjectUrl(
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

function sendAvatarDebugLog(payload: AvatarDebugLogPayload) {
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

function getSupabaseBase(): string | null {
  const supabaseBase =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
  if (!supabaseBase) {
    return null;
  }
  return supabaseBase.replace(/\/$/, '');
}

function getSupabaseHost(): string | null {
  const base = getSupabaseBase();
  if (!base) return null;
  try {
    return new URL(base).host;
  } catch {
    return null;
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

export async function resolveAvatarUrlClient(
  avatarUrl: string | null | undefined,
  transform: AvatarTransformOptions = {},
  options: ResolveAvatarOptions = {},
): Promise<{ url: string; isFallback: boolean; isSigned: boolean }> {
  const debugSteps: AvatarDebugStep[] = [];
  const recordStep = ENABLE_AVATAR_DEBUG
    ? (step: AvatarDebugStep) => {
        debugSteps.push({ ...step, timestamp: Date.now() });
      }
    : () => {};
  const finalize = (result: {
    url: string;
    isFallback: boolean;
    isSigned: boolean;
  }) => {
    if (ENABLE_AVATAR_DEBUG) {
      sendAvatarDebugLog({
        original: avatarUrl ?? null,
        final: result.url,
        isFallback: result.isFallback,
        isSigned: result.isSigned,
        transform,
        steps: debugSteps,
      });
    }
    return result;
  };

  recordStep({ stage: 'start', url: avatarUrl || null });

  const fallbackUrl = options.fallbackUrl ?? '/images/default-avatar.svg';
  const useProxy = options.useProxy ?? false;

  if (typeof window === 'undefined') {
    const resolved = getSafeAvatarUrl(
      avatarUrl,
      fallbackUrl,
      useProxy,
      transform,
    );
    const isFallback = !avatarUrl || !resolved || resolved === fallbackUrl;
    recordStep({
      stage: 'ssr',
      url: resolved,
      result: isFallback ? 'error' : 'success',
    });
    return finalize({
      url: isFallback ? fallbackUrl : resolved,
      isFallback,
      isSigned: false,
    });
  }

  if (!avatarUrl) {
    recordStep({
      stage: 'empty-avatar',
      url: fallbackUrl,
      result: 'error',
      message: 'avatarUrl is empty',
    });
    return finalize({ url: fallbackUrl, isFallback: true, isSigned: false });
  }

  const reference =
    extractSupabaseStorageReference(avatarUrl) ||
    extractSupabaseStorageReference(
      getSafeAvatarUrl(avatarUrl, fallbackUrl, useProxy),
    );

  const originalUrlWithoutTransform = getSafeAvatarUrl(
    avatarUrl,
    fallbackUrl,
    useProxy,
  );

  let finalUrl = getSafeAvatarUrl(
    avatarUrl,
    fallbackUrl,
    useProxy,
    transform,
  ) || fallbackUrl;
  let wasSigned = false;

  if (reference && options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (reference && !reference.isSigned) {
    const signedUrl = await fetchSignedSupabaseImageUrl(reference, transform, {
      signal: options.signal,
      expiresIn: options.expiresIn,
    });
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (signedUrl) {
      finalUrl = signedUrl;
      wasSigned = true;
      recordStep({
        stage: 'signed-url',
        url: signedUrl,
        isSignedCandidate: true,
      });
    }
  }

  if (!finalUrl) {
    recordStep({
      stage: 'no-final-url',
      url: fallbackUrl,
      result: 'error',
      message: 'finalUrl is empty',
    });
    return finalize({ url: fallbackUrl, isFallback: true, isSigned: wasSigned });
  }

  try {
    const ok = await preloadImage(finalUrl);
    if (ok) {
      recordStep({
        stage: 'initial-load',
        url: finalUrl,
        result: 'success',
        isSignedCandidate: wasSigned,
      });
      return finalize({ url: finalUrl, isFallback: false, isSigned: wasSigned });
    }
    recordStep({
      stage: 'initial-load',
      url: finalUrl,
      result: 'error',
      message: 'preload_image_false',
      isSignedCandidate: wasSigned,
    });
  } catch (error) {
    recordStep({
      stage: 'initial-load',
      url: finalUrl,
      result: 'error',
      message: error instanceof Error ? error.message : String(error),
      isSignedCandidate: wasSigned,
    });
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.warn('🖼️ [ImageUtils] 아바타 이미지 사전 로드 실패:', {
      avatarUrl,
      error,
    });
  }

  const fallbackCandidates: Array<{
    url: string;
    isSigned: boolean;
  }> = [];

  if (reference) {
    if (wasSigned && hasTransformOptions(transform)) {
      const signedWithoutTransform = await fetchSignedSupabaseImageUrl(
        reference,
        {},
        { signal: options.signal, expiresIn: options.expiresIn },
      );
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (signedWithoutTransform) {
        fallbackCandidates.push({
          url: signedWithoutTransform,
          isSigned: true,
        });
      }
    }

    if (!reference.isSigned) {
      const objectUrl = buildSupabaseObjectUrl(reference);
      if (objectUrl) {
        fallbackCandidates.push({
          url: objectUrl,
          isSigned: false,
        });
      }
    }
  }

  if (
    originalUrlWithoutTransform &&
    originalUrlWithoutTransform !== finalUrl &&
    originalUrlWithoutTransform !== fallbackUrl
  ) {
    fallbackCandidates.push({
      url: originalUrlWithoutTransform,
      isSigned: wasSigned,
    });
  }

  if (avatarUrl && avatarUrl !== finalUrl) {
    fallbackCandidates.push({
      url: avatarUrl,
      isSigned: wasSigned,
    });
  }

  for (const candidate of fallbackCandidates) {
    if (!candidate.url) continue;
    recordStep({
      stage: 'fallback-candidate',
      url: candidate.url,
      isSignedCandidate: candidate.isSigned,
    });
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const ok = await preloadImage(candidate.url);
      if (ok) {
        recordStep({
          stage: 'fallback-candidate',
          url: candidate.url,
          result: 'success',
          isSignedCandidate: candidate.isSigned,
        });
        return finalize({
          url: candidate.url,
          isFallback: false,
          isSigned: candidate.isSigned,
        });
      }
      recordStep({
        stage: 'fallback-candidate',
        url: candidate.url,
        result: 'error',
        message: 'preload_image_false',
        isSignedCandidate: candidate.isSigned,
      });
    } catch (error) {
      recordStep({
        stage: 'fallback-candidate',
        url: candidate.url,
        result: 'error',
        message: error instanceof Error ? error.message : String(error),
        isSignedCandidate: candidate.isSigned,
      });
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.warn('🖼️ [ImageUtils] 아바타 폴백 로드 실패:', {
        candidate: candidate.url,
        error,
      });
    }
  }

  if (reference) {
    const objectUrl = buildSupabaseObjectUrl(reference);
    if (objectUrl) {
      recordStep({
        stage: 'object-url',
        url: objectUrl,
        isSignedCandidate: reference.isSigned,
      });
      try {
        const ok = await preloadImage(objectUrl);
        if (ok) {
          recordStep({
            stage: 'object-url',
            url: objectUrl,
            result: 'success',
            isSignedCandidate: reference.isSigned,
          });
          return finalize({
            url: objectUrl,
            isFallback: false,
            isSigned: reference.isSigned,
          });
        }
        recordStep({
          stage: 'object-url',
          url: objectUrl,
          result: 'error',
          message: 'preload_image_false',
          isSignedCandidate: reference.isSigned,
        });
      } catch (error) {
        recordStep({
          stage: 'object-url',
          url: objectUrl,
          result: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
        console.warn('🖼️ [ImageUtils] 공개 오브젝트 URL 로드 실패:', {
          objectUrl,
          error,
        });
      }
    }
  }

  recordStep({
    stage: 'final-fallback',
    url: fallbackUrl,
    result: 'error',
    message: '모든 폴백 실패',
  });
  return finalize({ url: fallbackUrl, isFallback: true, isSigned: wasSigned });
}

function getOptimizedSupabaseImageUrl(
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

/**
 * 이미지 URL이 유효한지 검증
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    // 상대 경로(/images/..), data URL은 유효로 간주
    if (url.startsWith('/') || url.startsWith('data:')) {
      return true;
    }

    const urlObj = new URL(url);
    
    // HTTP/HTTPS만 허용
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    
    // 이미지 확장자 또는 알려진 이미지 서비스 확인
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const imageServices = [
      'googleusercontent.com',
      'graph.facebook.com', 
      'pbs.twimg.com',
      'cdn.discordapp.com',
      'avatars.githubusercontent.com',
      'platform-lookaside.fbsbx.com',
      'lh3.googleusercontent.com',
      't1.kakaocdn.net'
    ];
    
    const hasImageExtension = imageExtensions.some(ext => 
      urlObj.pathname.toLowerCase().includes(ext)
    );
    
    const isKnownImageService = imageServices.some(service => 
      urlObj.hostname.includes(service)
    );
    
    return hasImageExtension || isKnownImageService;
    
  } catch (_) {
    // new URL 실패 + 상대경로도 아님 → 유효하지 않음
    return false;
  }
}

/**
 * 이미지 로딩 테스트 (프리로딩)
 */
export function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isValidImageUrl(url)) {
      resolve(false);
      return;
    }
    
    const img = new Image();
    const timeout = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, 5000); // 5초 타임아웃으로 증가
    
    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    
    img.onerror = () => {
      clearTimeout(timeout);
      console.warn('🖼️ [ImageUtils] 이미지 로딩 실패:', url);
      resolve(false);
    };
    
    img.src = url;
  });
}

/**
 * 안전한 아바타 URL 가져오기
 */
export function getSafeAvatarUrl(
  avatarUrl: string | null | undefined, 
  fallbackUrl: string = '/images/default-avatar.svg',
  useProxy: boolean = false,
  transformOptions: AvatarTransformOptions = {}
): string {
  if (!avatarUrl) {
    return fallbackUrl;
  }
  
  // 상대 경로 또는 data URL은 그대로 사용 (정적 에셋/인라인)
  if (avatarUrl.startsWith('/') || avatarUrl.startsWith('data:')) {
    return avatarUrl;
  }

  if (!isValidImageUrl(avatarUrl)) {
    if (/^https?:/i.test(avatarUrl)) {
      console.warn('🖼️ [ImageUtils] 유효하지 않은 아바타 URL:', avatarUrl);
    }
    return fallbackUrl;
  }

  let processedUrl = avatarUrl;

  const supabaseOptimizedUrl = getOptimizedSupabaseImageUrl(
    processedUrl,
    transformOptions,
  );
  if (supabaseOptimizedUrl) {
    processedUrl = supabaseOptimizedUrl;
  }
  
  // Google 이미지 URL인 경우 안전한 형태로 변환
  if (processedUrl.includes('googleusercontent.com')) {
    const safeUrl = getSafeGoogleImageUrl(processedUrl);
    
    // 프록시 사용 옵션이 활성화된 경우
    if (useProxy) {
      return getProxiedImageUrl(safeUrl);
    }
    
    return safeUrl;
  }
  
  return processedUrl;
}

/**
 * React 컴포넌트용 이미지 에러 핸들러 (개선된 버전)
 */
export function createImageErrorHandler(
  fallbackUrl: string = '/images/default-avatar.svg',
  useProxy: boolean = false
) {
  return (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = event.currentTarget;
    const originalSrc = img.src;
    
    // 이미 폴백 이미지인 경우 무한 루프 방지
    if (img.src === fallbackUrl || img.src.includes('default-avatar')) {
      console.warn('🖼️ [ImageUtils] 폴백 이미지도 로딩 실패');
      return;
    }
    
    // 이미 프록시를 사용 중인 경우 폴백으로 변경
    if (img.src.includes('/api/proxy-image')) {
      console.warn('🖼️ [ImageUtils] 프록시 이미지도 로딩 실패, 폴백으로 변경:', {
        original: originalSrc,
        fallback: fallbackUrl
      });
      img.src = fallbackUrl;
      return;
    }
    
    // Google 이미지인 경우 429 에러 대응
    if (originalSrc.includes('googleusercontent.com')) {
      console.warn('🖼️ [ImageUtils] Google 이미지 로딩 실패 (429 가능성):', {
        original: originalSrc,
        useProxy,
        error: '429 Too Many Requests'
      });
      
      // 프록시 사용 옵션이 활성화된 경우 프록시로 재시도
      if (useProxy) {
        img.src = getProxiedImageUrl(originalSrc);
        return;
      }
      
      // 로컬 스토리지에 실패한 URL 기록 (재시도 방지)
      try {
        const failedUrls = JSON.parse(localStorage.getItem('failed_image_urls') || '[]');
        if (!failedUrls.includes(originalSrc)) {
          failedUrls.push(originalSrc);
          // 최대 50개까지만 저장
          if (failedUrls.length > 50) {
            failedUrls.shift();
          }
          localStorage.setItem('failed_image_urls', JSON.stringify(failedUrls));
        }
      } catch (error) {
        // localStorage 접근 실패 시 무시
      }
    } else {
      console.warn('🖼️ [ImageUtils] 이미지 로딩 실패, 폴백으로 변경:', {
        original: originalSrc,
        fallback: fallbackUrl
      });
    }
    
    img.src = fallbackUrl;
  };
}

/**
 * 실패한 이미지 URL인지 확인
 */
export function isFailedImageUrl(url: string): boolean {
  try {
    const failedUrls = JSON.parse(localStorage.getItem('failed_image_urls') || '[]');
    return failedUrls.includes(url);
  } catch (error) {
    return false;
  }
}

/**
 * 소셜 로그인 제공자별 아바타 URL 추출
 */
export function extractAvatarFromProvider(
  userMetadata: any, 
  provider?: string
): string | null {
  if (!userMetadata || typeof userMetadata !== 'object') {
    return null;
  }
  
  // 제공자별 특별 처리
  switch (provider) {
    case 'google':
      const googleUrl = userMetadata.picture || userMetadata.avatar_url;
      return googleUrl ? getSafeGoogleImageUrl(googleUrl) : null;
      
    case 'facebook':
      return userMetadata.picture?.data?.url || userMetadata.picture || userMetadata.avatar_url;
      
    case 'github':
      return userMetadata.avatar_url || userMetadata.picture;
      
    case 'discord':
      return userMetadata.avatar ? 
        `https://cdn.discordapp.com/avatars/${userMetadata.id}/${userMetadata.avatar}.png` :
        userMetadata.picture || userMetadata.avatar_url;
        
    case 'kakao':
      return userMetadata.picture || userMetadata.profile_image || userMetadata.avatar_url;
      
    default:
      // 일반적인 필드들 순서대로 시도
      const possibleFields = [
        'avatar_url',
        'picture', 
        'photo',
        'image',
        'profile_image_url',
        'profile_picture',
        'profile_image'
      ];
      
      for (const field of possibleFields) {
        const url = userMetadata[field];
        if (url && typeof url === 'string' && isValidImageUrl(url)) {
          // Google 이미지인 경우 안전한 형태로 변환
          if (url.includes('googleusercontent.com')) {
            return getSafeGoogleImageUrl(url);
          }
          return url;
        }
      }
      
      return null;
  }
} 