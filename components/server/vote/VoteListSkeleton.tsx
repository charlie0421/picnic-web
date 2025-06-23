import React from 'react';

/**
 * 투표 리스트 로딩 시 표시될 스켈레톤 UI
 */
export default function VoteListSkeleton() {
  return (
    <div className="space-y-8">
      {/* 필터 섹션 스켈레톤 */}
      <div className="flex flex-wrap gap-2 justify-center animate-pulse">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-10 w-20 bg-gray-200 rounded-full"></div>
        ))}
      </div>
      
      {/* 투표 카드 그리드 스켈레톤 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, index) => (
          <div 
            key={index}
            className="bg-white rounded-xl shadow-lg overflow-hidden animate-pulse"
          >
            {/* 이미지 영역 */}
            <div className="h-48 bg-gray-200"></div>
            
            {/* 컨텐츠 영역 */}
            <div className="p-6">
              {/* 제목 */}
              <div className="h-6 bg-gray-200 rounded mb-3 w-3/4"></div>
              
              {/* 설명 */}
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 bg-gray-200 rounded mb-4 w-2/3"></div>
              
              {/* 카운트다운 */}
              <div className="flex justify-center mb-4">
                <div className="h-12 bg-gray-200 rounded w-48"></div>
              </div>
              
              {/* 상위 3위 영역 */}
              <div className="flex justify-center items-end gap-2 mb-4">
                <div className="w-16 h-20 bg-gray-200 rounded"></div>
                <div className="w-20 h-24 bg-gray-200 rounded"></div>
                <div className="w-16 h-18 bg-gray-200 rounded"></div>
              </div>
              
              {/* 리워드 섹션 */}
              <div className="bg-yellow-50 rounded-lg p-3">
                <div className="h-4 bg-gray-200 rounded mb-2 w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 