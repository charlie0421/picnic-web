import React from 'react';


interface LoadingStateProps {
  message?: string;
  fullPage?: boolean;
  size?: 'small' | 'medium' | 'large';
}

/**
 * 서버 컴포넌트에서 데이터 로딩 중 표시할 컴포넌트
 *
 * Next.js의 Suspense 또는 loading.tsx 파일과 함께 사용할 수 있습니다.
 *
 * @example
 * // app/[lang]/(main)/vote/[id]/loading.tsx
 * import { LoadingState } from '@/components/server';
 *
 * export default function VoteLoading() {
 *   return <LoadingState message="투표 데이터를 불러오는 중입니다..." />;
 * }
 */
export default function LoadingState({
  message = '로딩 중...',
  fullPage = false,
  size = 'medium',
}: LoadingStateProps) {
  // 전체 페이지 로딩인 경우 공통 컴포넌트 사용
  if (fullPage) {
    return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    </div>
  );
  }

  // 부분 로딩인 경우 기존 스타일 유지하되 텍스트 제거
  const containerHeight = 'min-h-[200px]';

  return (
    <div className={`flex items-center justify-center ${containerHeight} py-10`}>
      <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    </div>
  );
}
