import React from 'react';
import { SafeAvatar, SimpleAvatar } from './SafeAvatar';

interface ProfileImageContainerProps {
  avatarUrl: string;
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
  // 크기에 따라 적절한 size 선택
  const getSize = (width: number) => {
    if (width <= 32) return 'sm';
    if (width <= 48) return 'md';
    if (width <= 64) return 'lg';
    return 'xl';
  };

  const size = getSize(width);
  
  return (
    <div 
      style={{ borderRadius, overflow: 'hidden' }}
      className={className}
    >
      <SafeAvatar
        src={avatarUrl}
        size={size}
        className="object-cover"
        alt="프로필 이미지"
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