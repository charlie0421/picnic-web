'use client';

import React from 'react';
import Image from 'next/image';

interface LoadingSpinnerProps {
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ className = '' }) => {
  return (
    <div className={`min-h-screen flex items-center justify-center bg-gray-50 ${className}`}>
      <div className="text-center">
        {/* 로고 아이콘 with 펄스 애니메이션 */}
        <div className="relative inline-block">
          <Image
            src="/images/logo.png"
            alt="Picnic Loading"
            width={64}
            height={64}
            priority
            className="w-16 h-16 rounded-lg animate-pulse drop-shadow-lg"
          />
          {/* 추가 글로우 효과 */}
          <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-400 to-indigo-400 opacity-30 animate-ping" />
          {/* 회전 링 효과 */}
          <div className="absolute -inset-2 border-2 border-transparent border-t-blue-400 border-r-indigo-400 rounded-lg animate-spin opacity-70" />
        </div>
        
        {/* 로딩 텍스트 */}
        <div className="mt-4 text-gray-600 text-sm font-medium animate-pulse">
          Loading...
        </div>
      </div>
    </div>
  );
};

export default LoadingSpinner; 