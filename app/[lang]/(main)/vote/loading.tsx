import React from 'react';
import Image from 'next/image';

/**
 * 투표 페이지 간소화된 로딩 상태
 * 빠른 페이지 전환을 위해 최소화된 로딩 UI
 */

export default function VoteLoading() {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      {/* 깔끔한 로딩 인디케이터 */}
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="relative">
          <Image
            src="/images/logo.png"
            alt="Vote Loading"
            width={48}
            height={48}
            priority
            className="w-12 h-12 rounded-full animate-pulse drop-shadow-lg object-cover"
          />
        </div>
        <div className="mt-4 text-gray-600 text-sm font-medium animate-pulse">
          투표 페이지 로딩 중...
        </div>
      </div>
    </main>
  );
} 