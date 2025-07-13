import React from 'react';

/**
 * 충전 히스토리 페이지 로딩 시 표시될 스켈레톤 UI
 * 서버 컴포넌트로 구현 (인터랙션이 없는 정적 UI)
 */
export default function RechargeHistorySkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Skeleton */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="container mx-auto">
          <div className="h-8 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-6 border border-primary-100/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-5 bg-gray-200 rounded w-24 animate-pulse"></div>
                  <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16 mb-2 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-md border border-white/30 overflow-hidden">
              {/* 상단 그라데이션 바 */}
              <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
              
              <div className="relative p-4">
                <div className="flex items-start space-x-4">
                  {/* 결제 정보 */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="h-6 bg-gray-200 rounded w-48 mb-1 animate-pulse"></div>
                        <div className="h-0.5 w-12 bg-gray-200 rounded-full animate-pulse"></div>
                      </div>
                      <div className="text-right">
                        <div className="h-5 bg-gray-200 rounded w-20 mb-1 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                      </div>
                    </div>

                    {/* 결제 상세 정보 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-12 mb-1 animate-pulse"></div>
                        <div className="h-5 bg-gray-200 rounded w-16 animate-pulse"></div>
                      </div>
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-16 mb-1 animate-pulse"></div>
                        <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
                      </div>
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-12 mb-1 animate-pulse"></div>
                        <div className="h-5 bg-gray-200 rounded w-24 animate-pulse"></div>
                      </div>
                      <div>
                        <div className="h-4 bg-gray-200 rounded w-8 mb-1 animate-pulse"></div>
                        <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  {/* 금액 정보 */}
                  <div className="flex-shrink-0 text-right">
                    <div className="h-8 bg-gray-200 rounded w-24 mb-2 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                  </div>
                </div>

                {/* 하단 메타 정보 */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4">
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 더 불러오기 버튼 스켈레톤 */}
        <div className="flex justify-center mt-8">
          <div className="h-12 bg-gray-200 rounded-lg w-32 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
} 