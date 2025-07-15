import React from 'react';

/**
 * 충전 히스토리 페이지 로딩 시 표시될 스켈레톤 UI
 * RechargeHistoryClient 컴포넌트의 실제 레이아웃과 일치하도록 구현
 */
export default function RechargeHistorySkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-6">
        {/* 헤더 스켈레톤 */}
        <div className="mb-6">
          <div className="relative bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/30 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
            
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-xl animate-pulse"></div>
                  <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
                </div>
              </div>
              
              {/* 통계 카드들 스켈레톤 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { bgColor: 'from-primary-50 to-primary-100', borderColor: 'border-primary-200/50' },
                  { bgColor: 'from-secondary-50 to-secondary-100', borderColor: 'border-secondary-200/50' },
                  { bgColor: 'from-point-50 to-point-100', borderColor: 'border-point-200/50' }
                ].map((colors, index) => (
                  <div key={index} className={`bg-gradient-to-br ${colors.bgColor} rounded-xl p-3 border ${colors.borderColor}`}>
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-6 h-6 bg-gradient-to-r from-primary to-secondary rounded-lg animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                    </div>
                    <div className="space-y-1">
                      <div className="h-6 bg-gray-200 rounded w-16 animate-pulse"></div>
                      <div className="h-3 bg-gray-200 rounded w-20 animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 충전 내역 목록 스켈레톤 */}
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div 
              key={index} 
              className="group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-md hover:shadow-lg border border-white/30 overflow-hidden animate-pulse"
              style={{ 
                animationDelay: `${index * 100}ms`,
                animationDuration: '1.5s' 
              }}
            >
              {/* 상단 그라데이션 바 */}
              <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
              
              <div className="relative p-4">
                <div className="flex items-start space-x-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="h-6 bg-gray-200 rounded w-3/4 mb-1"></div>
                        <div className="h-0.5 w-12 bg-gray-200 rounded-full"></div>
                      </div>
                      <div className="flex-shrink-0 ml-4">
                        <div className="w-16 h-6 bg-gray-200 rounded-lg"></div>
                      </div>
                    </div>

                    {/* 충전 정보 그리드 스켈레톤 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* 받은 별사탕 */}
                      <div className="bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-3 border border-primary-100/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                          <div className="h-4 bg-gray-200 rounded w-20"></div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-5 h-5 bg-gray-200 rounded"></div>
                          <div className="h-5 bg-gray-200 rounded w-16"></div>
                        </div>
                      </div>

                      {/* 결제 금액 */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 border border-green-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                          <div className="h-4 bg-gray-200 rounded w-16"></div>
                        </div>
                        <div className="h-5 bg-gray-200 rounded w-20"></div>
                      </div>

                      {/* 결제 방법 */}
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                          <div className="h-4 bg-gray-200 rounded w-16"></div>
                        </div>
                        <div className="h-5 bg-gray-200 rounded w-12"></div>
                      </div>

                      {/* 결제일시 */}
                      <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-3 border border-orange-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                          <div className="h-4 bg-gray-200 rounded w-16"></div>
                        </div>
                        <div className="h-5 bg-gray-200 rounded w-24"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 로딩 인디케이터 스켈레톤 */}
        <div className="flex justify-center mt-8">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
            <div className="h-5 bg-gray-200 rounded w-24 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
} 