import React from 'react';

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
  return (
    <div 
      style={{ borderRadius, overflow: 'hidden' }}
      className={className}
    >
      <img
        src={avatarUrl}
        alt="프로필 이미지"
        className="w-full h-full object-cover rounded-full bg-gray-200"
        loading="lazy"
        onError={(e) => {
          // 이미지 로딩 실패 시 기본 이미지로 대체
          e.currentTarget.src = '/images/default-avatar.png';
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