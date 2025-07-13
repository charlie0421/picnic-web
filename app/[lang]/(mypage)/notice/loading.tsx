import React from 'react';

export default function NoticeLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* 제목 스켈레톤 */}
        <div className="h-8 bg-gray-200 rounded w-32 mb-6 animate-pulse"></div>

        {/* 공지사항 리스트 스켈레톤 */}
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {/* 고정 뱃지 (일부 아이템에만) */}
                    {index < 2 && (
                      <div className="h-5 bg-red-200 rounded-full w-8 animate-pulse"></div>
                    )}
                    {/* 제목 */}
                    <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                  </div>
                  
                  {/* 내용 미리보기 */}
                  <div className="space-y-2 mt-3">
                    <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                  </div>
                </div>

                {/* 날짜 */}
                <div className="flex-shrink-0 ml-4">
                  <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
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