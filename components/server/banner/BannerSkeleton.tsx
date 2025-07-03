import React from 'react';

/**
 * 배너 로딩 시 표시될 스켈레톤 UI
 * 실제 BannerListPresenter의 Swiper 스타일에 맞게 구성
 */
export default function BannerSkeleton() {
  return (
    <div className="w-full">
      {/* Swiper 스타일의 그리드 레이아웃 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-12">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="relative w-full bg-gray-200 rounded-lg animate-pulse overflow-hidden"
            style={{ aspectRatio: '700/356' }}
          >
            {/* 그라데이션 오버레이 */}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-300/50 to-transparent" />
            
            {/* 하단 텍스트 영역 스켈레톤 */}
            <div className="absolute bottom-4 left-4">
              <div className="h-4 bg-gray-300 rounded w-24 mb-2"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 