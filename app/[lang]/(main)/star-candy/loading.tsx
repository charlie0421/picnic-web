import React from 'react';

/**
 * 별사탕 페이지 간소화된 로딩 상태
 */

export default function StarCandyLoading() {
  return (
    <main className="container mx-auto px-4 py-8 min-h-screen">
      {/* 최소화된 로딩 인디케이터 */}
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    </main>
  );
} 