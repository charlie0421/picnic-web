'use client';

import React from 'react';
import Image from 'next/image';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';

export default function GlobalLoadingOverlay() {
  const { isLoading } = useGlobalLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Image
        src="/images/logo.png"
        alt="Picnic Loading"
        width={80}
        height={80}
        className="w-20 h-20 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
        priority
      />
    </div>
  );
} 