import React from 'react';

interface VoteListSkeletonProps {
  /** 표시할 스켈레톤 카드 개수 */
  itemCount?: number;
  /** 필터 섹션 스켈레톤 표시 여부 */
  showFilterSkeleton?: boolean;
  /** 그리드 레이아웃 타입 */
  layout?: 'grid' | 'list';
  /** 애니메이션 활성화 여부 */
  animated?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 투표 리스트 로딩 시 표시될 스켈레톤 UI
 * 
 * @example
 * ```tsx
 * <VoteListSkeleton 
 *   itemCount={6} 
 *   showFilterSkeleton={true}
 *   layout="grid"
 *   animated={true}
 * />
 * ```
 */
export default function VoteListSkeleton({
  itemCount = 6,
  showFilterSkeleton = true,
  layout = 'grid',
  animated = true,
  className = '',
}: VoteListSkeletonProps) {
  const animationClass = animated ? 'animate-shimmer' : 'bg-gray-200';
  
  // 개별 스켈레톤 카드 컴포넌트
  const SkeletonCard = ({ index }: { index: number }) => (
    <div 
      className="bg-white rounded-xl shadow-lg overflow-hidden"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* 이미지 영역 */}
      <div className={`h-48 ${animationClass} bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}></div>
      
      {/* 컨텐츠 영역 */}
      <div className="p-4 space-y-3">
        {/* 제목 */}
        <div className={`h-6 ${animationClass} rounded-md bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}></div>
        
        {/* 설명 라인들 */}
        <div className="space-y-2">
          <div className={`h-4 ${animationClass} rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 w-3/4`}></div>
          <div className={`h-4 ${animationClass} rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 w-1/2`}></div>
        </div>
        
        {/* 투표 상태 및 기간 */}
        <div className="flex justify-between items-center">
          <div className={`h-6 w-16 ${animationClass} rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}></div>
          <div className={`h-4 w-20 ${animationClass} rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}></div>
        </div>
        
        {/* 투표 항목 미리보기 (작은 원형 이미지들) */}
        <div className="flex space-x-2 mt-4">
          {[...Array(4)].map((_, i) => (
            <div 
              key={i}
              className={`w-8 h-8 rounded-full ${animationClass} bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}
              style={{ animationDelay: `${(index * 100) + (i * 50)}ms` }}
            ></div>
          ))}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs text-gray-400 ${animationClass} bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}>
          </div>
        </div>
      </div>
    </div>
  );

  // 리스트 레이아웃 스켈레톤 카드
  const SkeletonListCard = ({ index }: { index: number }) => (
    <div 
      className="bg-white rounded-lg shadow-md p-4 flex items-center space-x-4"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* 이미지 */}
      <div className={`w-20 h-20 rounded-lg ${animationClass} bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 flex-shrink-0`}></div>
      
      {/* 컨텐츠 */}
      <div className="flex-1 space-y-3">
        {/* 제목 */}
        <div className={`h-5 ${animationClass} rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 w-3/4`}></div>
        
        {/* 설명 */}
        <div className={`h-4 ${animationClass} rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 w-1/2`}></div>
        
        {/* 상태와 날짜 */}
        <div className="flex items-center space-x-4">
          <div className={`h-6 w-16 ${animationClass} rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}></div>
          <div className={`h-4 w-24 ${animationClass} rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}></div>
        </div>
      </div>
      
      {/* 투표 버튼 영역 */}
      <div className={`w-20 h-10 ${animationClass} rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 flex-shrink-0`}></div>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 필터 섹션 스켈레톤 */}
      {showFilterSkeleton && (
        <div className="flex flex-wrap gap-3 justify-center">
          {[...Array(4)].map((_, index) => (
            <div 
              key={index}
              className={`h-10 w-20 ${animationClass} rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`}
              style={{ animationDelay: `${index * 50}ms` }}
            ></div>
          ))}
        </div>
      )}
      
      {/* 투표 카드 그리드/리스트 스켈레톤 */}
      {layout === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(itemCount)].map((_, index) => (
            <SkeletonCard key={index} index={index} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {[...Array(itemCount)].map((_, index) => (
            <SkeletonListCard key={index} index={index} />
          ))}
        </div>
      )}
      
      {/* 로딩 표시 */}
      <div className="flex justify-center items-center py-8">
        <div className="flex items-center space-x-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
          <span className="text-sm font-medium">투표 목록을 불러오는 중...</span>
        </div>
      </div>
    </div>
  );
} 