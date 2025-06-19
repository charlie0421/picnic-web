/**
 * 이미지 URL 검증 및 안전한 처리 유틸리티
 */

/**
 * 이미지 URL이 유효한지 검증
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
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
    
  } catch (error) {
    console.warn('🖼️ [ImageUtils] URL 검증 실패:', url, error);
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
    }, 3000); // 3초 타임아웃
    
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
  fallbackUrl: string = '/images/default-avatar.png'
): string {
  if (!avatarUrl) {
    return fallbackUrl;
  }
  
  if (!isValidImageUrl(avatarUrl)) {
    console.warn('🖼️ [ImageUtils] 유효하지 않은 아바타 URL:', avatarUrl);
    return fallbackUrl;
  }
  
  return avatarUrl;
}

/**
 * React 컴포넌트용 이미지 에러 핸들러
 */
export function createImageErrorHandler(
  fallbackUrl: string = '/images/default-avatar.png'
) {
  return (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = event.currentTarget;
    const originalSrc = img.src;
    
    // 이미 폴백 이미지인 경우 무한 루프 방지
    if (img.src === fallbackUrl || img.src.includes('default-avatar')) {
      console.warn('🖼️ [ImageUtils] 폴백 이미지도 로딩 실패');
      return;
    }
    
    console.warn('🖼️ [ImageUtils] 이미지 로딩 실패, 폴백으로 변경:', {
      original: originalSrc,
      fallback: fallbackUrl
    });
    
    img.src = fallbackUrl;
  };
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
      return userMetadata.picture || userMetadata.avatar_url;
      
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
          return url;
        }
      }
      
      return null;
  }
} 