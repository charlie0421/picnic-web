'use client';

import React from 'react';
import Image from 'next/image';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';

export default function GlobalLoadingOverlay() {
  const { isLoading } = useGlobalLoading();

  // 디버깅용 콘솔 로그
  console.log('🔍 [GlobalLoadingOverlay] 렌더링:', { isLoading });

  if (!isLoading) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 bottom-0 z-[9999] bg-black/50 backdrop-blur-sm"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div 
        className="flex flex-col items-center justify-center"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          src="/images/logo.png"
          alt="Picnic Loading"
          width={80}
          height={80}
          className="w-20 h-20 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
          priority
        />
      </div>
    </div>
  );
} 