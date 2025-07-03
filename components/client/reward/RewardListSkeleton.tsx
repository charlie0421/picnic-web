'use client';

import React from 'react';

export function RewardListSkeleton() {
  return (
    <section>
      {/* Reward Cards Grid Skeleton - 실제 리워드 UI와 동일한 그리드 구조 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow-md overflow-hidden animate-pulse"
          >
            {/* Reward Image - aspect-square로 정사각형 비율 */}
            <div className="aspect-square bg-gray-200"></div>
            
            {/* Content - 실제 UI와 동일한 padding */}
            <div className="p-3">
              {/* Title - 한 줄로 제한된 제목 */}
              <div className="h-5 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
} 