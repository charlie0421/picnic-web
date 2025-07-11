'use client';

import React from 'react';
import Image from 'next/image';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';

export default function GlobalLoadingOverlay() {
  const { isLoading } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        {/* 앱 아이콘 with 펄스 애니메이션 */}
        <div className="relative">
          <Image
            src="/images/logo.png"
            alt="Picnic Loading"
            width={80}
            height={80}
            className="w-20 h-20 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
            priority
          />
        </div>
        
        {/* 로딩 텍스트 */}
        <div className="text-gray-800 text-sm font-medium animate-scale-pulse">
          Loading...
        </div>
      </div>
    </div>
  );
} 