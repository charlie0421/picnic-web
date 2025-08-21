import React, { useEffect, useMemo, useState } from 'react';
import { getSafeAvatarUrl, preloadImage } from '@/utils/image-utils';

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
  className = ''
}) => {
  const initialSrc = useMemo(() => getSafeAvatarUrl(avatarUrl || null), [avatarUrl]);

  const [resolvedSrc, setResolvedSrc] = useState<string>(initialSrc || '/images/default-avatar.svg');
  const [isFallback, setIsFallback] = useState<boolean>(!avatarUrl);

  useEffect(() => {
    let mounted = true;
    const next = initialSrc || '/images/default-avatar.svg';

    // 아바타가 있는 경우 사전 로드 후 설정하여 onError 루프 방지
    const run = async () => {
      if (!avatarUrl) {
        if (!mounted) return;
        setResolvedSrc('/images/default-avatar.svg');
        setIsFallback(true);
        return;
      }
      const ok = await preloadImage(next);
      if (!mounted) return;
      if (ok) {
        setResolvedSrc(next);
        setIsFallback(false);
      } else {
        setResolvedSrc('/images/default-avatar.svg');
        setIsFallback(true);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [initialSrc, avatarUrl]);

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