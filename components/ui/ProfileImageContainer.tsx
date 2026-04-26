import React, { useEffect, useMemo, useState } from 'react';
import { resolveAvatarUrlClient } from '@/utils/image-utils';

interface ProfileImageContainerProps {
  avatarUrl: string | null;
  width: number;
  height: number;
  borderRadius?: number;
  className?: string;
}

export const ProfileImageContainer: React.FC<ProfileImageContainerProps> = ({
  avatarUrl,
  width,
  height,
  borderRadius = 0,
  className = '',
}) => {
  const fallbackUrl = '/images/default-avatar.svg';
  const transformOptions = useMemo(
    () => ({
      width,
      height,
      resize: 'cover' as const,
      quality: 85,
    }),
    [width, height],
  );

  const [resolvedSrc, setResolvedSrc] = useState<string>(fallbackUrl);
  const [isFallback, setIsFallback] = useState<boolean>(!avatarUrl);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadAvatar = async () => {
      try {
        const result = await resolveAvatarUrlClient(
          avatarUrl,
          transformOptions,
          {
            fallbackUrl,
            signal: controller.signal,
          },
        );
        if (cancelled) return;
        setResolvedSrc(result.url);
        setIsFallback(result.isFallback);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!cancelled) {
          console.warn('🖼️ [ProfileImageContainer] 아바타 로드 실패:', error);
          setResolvedSrc(fallbackUrl);
          setIsFallback(true);
        }
      }
    };

    loadAvatar();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [avatarUrl, transformOptions, fallbackUrl]);

  return (
    <div 
      style={{ borderRadius, overflow: 'hidden' }}
      className={className}
    >
      <img
        src={resolvedSrc}
        alt="프로필 이미지"
        width={width}
        height={height}
        className="object-cover rounded-full bg-gray-200"
        loading="lazy"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={(e) => {
          // 기본 이미지가 이미 적용된 경우 더 이상 변경하지 않음 (무한 루프 방지)
          if (isFallback || e.currentTarget.src.includes('default-avatar')) return;
          setResolvedSrc('/images/default-avatar.svg');
          setIsFallback(true);
        }}
      />
    </div>
  );
};

export const DefaultAvatar: React.FC<{ 
  width: number; 
  height: number; 
  className?: string; 
}> = ({ width, height, className = '' }) => {
  return (
    <div 
      className={`bg-gray-200 flex items-center justify-center rounded-full ${className}`}
      style={{ width, height }}
    >
      <span className="text-gray-500 text-lg">👤</span>
    </div>
  );
}; 