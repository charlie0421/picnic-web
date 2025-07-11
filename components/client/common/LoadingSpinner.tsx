'use client';

import React from 'react';
import Image from 'next/image';

interface LoadingSpinnerProps {
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ className = '' }) => {
  return (
    <div className={`min-h-screen flex items-center justify-center ${className}`}>
      <div className="text-center">
        {/* 로고 아이콘 with 펄스 애니메이션 */}
        <div className="relative inline-block">
          <Image
            src="/images/logo_alpha.png"
            alt="Picnic Loading"
            width={80}
            height={80}
            priority
            className="w-20 h-20 rounded-full animate-pulse drop-shadow-lg object-cover"
          />
        </div>
        
        {/* 로딩 텍스트 */}
        <div className="mt-6 text-gray-600 text-sm font-medium animate-pulse">
          Loading...
        </div>
      </div>
    </div>
  );
};