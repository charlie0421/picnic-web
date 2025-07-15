import React from 'react';

/**
 * 게시글 히스토리 페이지 로딩 시 표시될 스켈레톤 UI
 * PostsClient 컴포넌트의 실제 레이아웃과 일치하도록 구현
 */
export default function PostsSkeleton() {
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

        {/* 게시글 목록 스켈레톤 */}
        <div className="space-y-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div 
              key={index} 
              className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden animate-pulse"
              style={{ 
                animationDelay: `${index * 100}ms`,
                animationDuration: '1.5s' 
              }}
            >
              <div className="p-6">
                <div className="space-y-4">
                  {/* 게시물 제목 스켈레톤 */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200/50">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                  </div>

                  {/* 게시물 내용 스켈레톤 */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-full"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>

                  {/* 게시판 정보 및 통계 그리드 스켈레톤 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 게시판 */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 border border-green-200/50">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                        <div className="h-4 bg-gray-200 rounded w-16"></div>
                      </div>
                      <div className="h-5 bg-gray-200 rounded w-20"></div>
                    </div>

                    {/* 조회수 */}
                    <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-3 border border-purple-200/50">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                        <div className="h-4 bg-gray-200 rounded w-12"></div>
                      </div>
                      <div className="h-5 bg-gray-200 rounded w-8"></div>
                    </div>

                    {/* 댓글 수 */}
                    <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-3 border border-orange-200/50">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                        <div className="h-4 bg-gray-200 rounded w-12"></div>
                      </div>
                      <div className="h-5 bg-gray-200 rounded w-8"></div>
                    </div>
                  </div>

                  {/* 작성일 스켈레톤 */}
                  <div className="bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 border border-point-100/50">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-6 h-6 bg-gray-200 rounded-lg"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                    </div>
                    <div className="h-5 bg-gray-200 rounded w-40"></div>
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