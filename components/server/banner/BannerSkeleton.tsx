import React from 'react';

/**
 * 배너 로딩 시 표시될 스켈레톤 UI
 */
export default function BannerSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, index) => (
        <div 
          key={index}
          className="h-40 bg-gray-200 rounded-lg animate-pulse relative overflow-hidden"
        >
          {/* 그라데이션 오버레이 */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-300/50 to-transparent" />
          {/* 텍스트 영역 스켈레톤 */}
          <div className="absolute bottom-4 left-4">
            <div className="h-5 bg-gray-300 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-300 rounded w-24"></div>
          </div>
        </div>
      ))}
    </div>
  );
} 