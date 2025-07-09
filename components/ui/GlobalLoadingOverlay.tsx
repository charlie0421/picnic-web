'use client';

import React from 'react';
import Image from 'next/image';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';

export default function GlobalLoadingOverlay() {
  const { isLoading } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center space-y-4">
        {/* 앱 아이콘 with 펄스 애니메이션 */}
        <div className="relative">
          <Image
            src="/favicon/favicon-192x192.png"
            alt="Picnic Loading"
            width={80}
            height={80}
            className="animate-pulse drop-shadow-lg"
            priority
          />
          {/* 추가 글로우 효과 */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary-400 to-secondary-400 opacity-30 animate-ping" />
          {/* 회전 링 효과 */}
          <div className="absolute -inset-2 border-2 border-transparent border-t-primary-400 border-r-secondary-400 rounded-full animate-spin opacity-70" />
        </div>
        
        {/* 로딩 텍스트 */}
        <div className="text-white text-sm font-medium animate-pulse">
          Loading...
        </div>
      </div>
    </div>
  );
} 