import React from 'react';

/**
 * FAQ 페이지 로딩 시 표시될 스켈레톤 UI
 * 서버 컴포넌트로 구현 (인터랙션이 없는 정적 UI)
 */
export default function FAQSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* 제목 스켈레톤 */}
        <div className="h-8 bg-gray-200 rounded w-32 mb-6 animate-pulse"></div>

        {/* 카테고리 선택 스켈레톤 */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-10 bg-gray-200 rounded-full w-20 animate-pulse"
              ></div>
            ))}
          </div>
        </div>

        {/* FAQ 아이템 스켈레톤 */}
        <div className="space-y-4">
          <div className="divide-y divide-gray-200">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="py-4">
                <div className="w-full flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1">
                    <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                  </div>
                  <div className="w-5 h-5 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 