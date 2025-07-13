import React from 'react';

/**
 * 게시글 히스토리 페이지 로딩 시 표시될 스켈레톤 UI
 * 서버 컴포넌트로 구현 (인터랙션이 없는 정적 UI)
 */
export default function PostsSkeleton() {
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
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
              <div className="flex flex-col space-y-4">
                {/* 게시판 정보 및 날짜 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="h-6 bg-gray-200 rounded-full w-16 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                </div>

                {/* 제목 */}
                <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>

                {/* 내용 미리보기 */}
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                </div>

                {/* 메타 정보 */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-4">
                    <div className="h-4 bg-gray-200 rounded w-12 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
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