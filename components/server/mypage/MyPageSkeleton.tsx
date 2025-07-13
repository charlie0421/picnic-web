import React from 'react';

/**
 * 마이페이지 메인 로딩 시 표시될 스켈레톤 UI
 * 서버 컴포넌트로 구현 (인터랙션이 없는 정적 UI)
 */
export default function MyPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="container mx-auto">
          <div className="h-8 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
          
          {/* 사용자 정보 카드 */}
          <div className="bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-6 border border-primary-100/50 mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <div className="h-6 bg-gray-200 rounded w-32 mb-2 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* 통계 카드 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
                  <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16 mb-2 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 메뉴 섹션 */}
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-6 bg-gray-200 rounded w-24 mb-2 animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                </div>
                <div className="w-6 h-6 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>

        {/* 최근 활동 섹션 */}
        <div className="mt-8">
          <div className="h-6 bg-gray-200 rounded w-32 mb-6 animate-pulse"></div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div>
                      <div className="h-5 bg-gray-200 rounded w-40 mb-1 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                    </div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 