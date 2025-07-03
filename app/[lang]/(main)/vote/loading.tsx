import React from 'react';

/**
 * 투표 페이지 로딩 스켈레톤
 * 배너 섹션 + 투표 리스트 섹션을 포함
 */

// 베너 스켈레톤 (Swiper 스타일에 맞게 수정)
function BannerLoadingSkeleton() {
  return (
    <div className="w-full">
      {/* 슬라이드 배너들 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-12">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="relative w-full bg-gray-200 rounded-lg animate-pulse"
            style={{ aspectRatio: '700/356' }}
          >
            {/* 그라데이션 오버레이 */}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-300/50 to-transparent rounded-lg" />
            {/* 하단 텍스트 영역 */}
            <div className="absolute bottom-4 left-4">
              <div className="h-4 bg-gray-300 rounded w-24 mb-2"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 투표 리스트 스켈레톤 (실제 UI에 맞게 수정)
function VoteLoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* 필터 섹션 스켈레톤 - 실제 UI에 맞게 수정 */}
      <div className="flex justify-between items-center mb-4">
        {/* 왼쪽: 지역 필터 (전체/K-POP/뮤지컬) */}
        <div className="justify-start">
          <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-lg animate-pulse">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-8 w-16 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
        
        {/* 오른쪽: 상태 필터 (진행중/예정/종료) */}
        <div className="justify-end">
          <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-lg animate-pulse">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-8 w-16 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 투표 카드 그리드 스켈레톤 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div 
            key={index}
            className="bg-white rounded-xl shadow-lg overflow-hidden animate-pulse"
          >
            {/* 이미지 영역 */}
            <div className="h-48 bg-gray-200"></div>
            
            {/* 컨텐츠 영역 */}
            <div className="p-6">
              {/* 태그들 */}
              <div className="flex gap-1 mb-4">
                <div className="h-6 bg-gray-200 rounded-full w-16"></div>
                <div className="h-6 bg-gray-200 rounded-full w-12"></div>
                <div className="h-6 bg-gray-200 rounded-full w-14 ml-auto"></div>
              </div>
              
              {/* 제목 */}
              <div className="h-6 bg-gray-200 rounded mb-4 w-3/4"></div>
              
              {/* 카운트다운 */}
              <div className="flex justify-center mb-4">
                <div className="h-12 bg-gray-200 rounded w-48"></div>
              </div>
              
              {/* 포디움 형태 상위 3위 영역 - 색상 제거 */}
              <div className="flex justify-center items-end gap-2 mb-4 max-w-xs mx-auto">
                {/* 2위 - 왼쪽, 중간 높이 */}
                <div className="flex flex-col items-center flex-1">
                  <div className="w-full max-w-[85px] bg-gray-200 rounded border border-gray-300 animate-pulse">
                    <div className="h-32 bg-gray-300 rounded"></div>
                  </div>
                  <div className="mt-1 text-center">
                    <div className="text-sm">🥈</div>
                  </div>
                </div>
                
                {/* 1위 - 가운데, 가장 높음 */}
                <div className="flex flex-col items-center flex-1">
                  <div className="w-full max-w-[100px] bg-gray-200 rounded border border-gray-300 animate-pulse relative">
                    <div className="absolute -top-1 -right-1 text-sm">👑</div>
                    <div className="h-40 bg-gray-300 rounded"></div>
                  </div>
                  <div className="mt-1 text-center">
                    <div className="text-base font-bold">🥇</div>
                  </div>
                </div>
                
                {/* 3위 - 오른쪽, 가장 낮음 */}
                <div className="flex flex-col items-center flex-1">
                  <div className="w-full max-w-[75px] bg-gray-200 rounded border border-gray-300 animate-pulse">
                    <div className="h-28 bg-gray-300 rounded"></div>
                  </div>
                  <div className="mt-1 text-center">
                    <div className="text-sm">🥉</div>
                  </div>
                </div>
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

export default function VoteLoading() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      {/* 배너 섹션 */}
      <section>
        <BannerLoadingSkeleton />
      </section>

      {/* 투표 섹션 */}
      <section>
        <VoteLoadingSkeleton />
      </section>
    </main>
  );
} 