/**
 * 소셜 로그인 제공자별 아바타 URL 추출 및 검증
 */

import { AvatarTransformOptions } from './types';
import {
  getOptimizedSupabaseImageUrl,
  getProxiedImageUrl,
  getSafeGoogleImageUrl,
} from './image-optimizer';

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
      't1.kakaocdn.net',
    ];

    const hasImageExtension = imageExtensions.some((ext) =>
      urlObj.pathname.toLowerCase().includes(ext),
    );

    const isKnownImageService = imageServices.some((service) =>
      urlObj.hostname.includes(service),
    );

    return hasImageExtension || isKnownImageService;
  } catch (_) {
    // new URL 실패 + 상대경로도 아님 → 유효하지 않음
    return false;
  }
}

/**
 * 안전한 아바타 URL 가져오기
 */
export function getSafeAvatarUrl(
  avatarUrl: string | null | undefined,
  fallbackUrl: string = '/images/default-avatar.svg',
  useProxy: boolean = false,
  transformOptions: AvatarTransformOptions = {},
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
  useProxy: boolean = false,
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
      console.warn(
        '🖼️ [ImageUtils] 프록시 이미지도 로딩 실패, 폴백으로 변경:',
        {
          original: originalSrc,
          fallback: fallbackUrl,
        },
      );
      img.src = fallbackUrl;
      return;
    }

    // Google 이미지인 경우 429 에러 대응
    if (originalSrc.includes('googleusercontent.com')) {
      console.warn(
        '🖼️ [ImageUtils] Google 이미지 로딩 실패 (429 가능성):',
        {
          original: originalSrc,
          useProxy,
          error: '429 Too Many Requests',
        },
      );

      // 프록시 사용 옵션이 활성화된 경우 프록시로 재시도
      if (useProxy) {
        img.src = getProxiedImageUrl(originalSrc);
        return;
      }

      // 로컬 스토리지에 실패한 URL 기록 (재시도 방지)
      try {
        const failedUrls = JSON.parse(
          localStorage.getItem('failed_image_urls') || '[]',
        );
        if (!failedUrls.includes(originalSrc)) {
          failedUrls.push(originalSrc);
          // 최대 50개까지만 저장
          if (failedUrls.length > 50) {
            failedUrls.shift();
          }
          localStorage.setItem(
            'failed_image_urls',
            JSON.stringify(failedUrls),
          );
        }
      } catch (error) {
        // localStorage 접근 실패 시 무시
      }
    } else {
      console.warn('🖼️ [ImageUtils] 이미지 로딩 실패, 폴백으로 변경:', {
        original: originalSrc,
        fallback: fallbackUrl,
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
    const failedUrls = JSON.parse(
      localStorage.getItem('failed_image_urls') || '[]',
    );
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
  provider?: string,
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
      return (
        userMetadata.picture?.data?.url ||
        userMetadata.picture ||
        userMetadata.avatar_url
      );

    case 'github':
      return userMetadata.avatar_url || userMetadata.picture;

    case 'discord':
      return userMetadata.avatar
        ? `https://cdn.discordapp.com/avatars/${userMetadata.id}/${userMetadata.avatar}.png`
        : userMetadata.picture || userMetadata.avatar_url;

    case 'kakao':
      return (
        userMetadata.picture ||
        userMetadata.profile_image ||
        userMetadata.avatar_url
      );

    default:
      // 일반적인 필드들 순서대로 시도
      const possibleFields = [
        'avatar_url',
        'picture',
        'photo',
        'image',
        'profile_image_url',
        'profile_picture',
        'profile_image',
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
