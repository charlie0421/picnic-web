import React from 'react';
import Image from 'next/image';

/**
 * 별사탕 페이지 간소화된 로딩 상태
 */

export default function StarCandyLoading() {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      {/* 깔끔한 로딩 인디케이터 */}
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="relative">
          <Image
            src="/images/logo.png"
            alt="Star Candy Loading"
            width={48}
            height={48}
            priority
            className="w-12 h-12 rounded-full animate-pulse drop-shadow-lg object-cover"
          />
        </div>
        <div className="mt-4 text-gray-600 text-sm font-medium animate-pulse">
          별사탕 로딩 중...
        </div>
      </div>
    </main>
  );
} 