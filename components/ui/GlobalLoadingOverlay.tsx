'use client';

import React from 'react';
import Image from 'next/image';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';

export default function GlobalLoadingOverlay() {
  const { isLoading } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <>
      {/* 상단 프로그레스 바 */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-500 animate-pulse shadow-lg">
        <div className="h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 animate-pulse"></div>
      </div>
      
      {/* 중앙 로고 (배경 없이) */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg">
        <Image
          src="/images/logo.png"
          alt="Picnic Loading"
          width={40}
          height={40}
          className="w-10 h-10 rounded-full animate-scale-pulse object-cover"
          priority
        />
      </div>
    </>
  );
} 