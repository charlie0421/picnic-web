import React from 'react';

export default function NoticeDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* 뒤로 가기 버튼 스켈레톤 */}
        <div className="mb-6">
          <div className="h-10 bg-gray-200 rounded w-24 animate-pulse"></div>
        </div>

        {/* 제목 및 메타 정보 스켈레톤 */}
        <div className="border-b border-gray-200 pb-6 mb-6">
          <div className="flex items-center space-x-2 mb-4">
            {/* 고정 뱃지 */}
            <div className="h-6 bg-red-200 rounded-full w-12 animate-pulse"></div>
            {/* 제목 */}
            <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse"></div>
          </div>

          {/* 날짜 정보 */}
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* 내용 스켈레톤 */}
        <div className="prose max-w-none">
          <div className="space-y-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className={`h-4 bg-gray-200 rounded animate-pulse ${
                  index % 4 === 3 ? 'w-2/3' : 'w-full'
                }`}
              ></div>
            ))}
          </div>

          {/* 이미지 플레이스홀더 */}
          <div className="my-8">
            <div className="h-48 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>

          {/* 추가 텍스트 */}
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className={`h-4 bg-gray-200 rounded animate-pulse ${
                  index % 3 === 2 ? 'w-3/4' : 'w-full'
                }`}
              ></div>
            ))}
          </div>
        </div>

        {/* 하단 네비게이션 스켈레톤 */}
        <div className="mt-12 pt-6 border-t border-gray-200">
          <div className="flex justify-between">
            <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded w-32 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
} 