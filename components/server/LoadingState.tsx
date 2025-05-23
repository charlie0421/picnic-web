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
  // size에 따른 스피너 크기 결정
  const spinnerSize =
    size === 'small' ? 'h-8 w-8' : size === 'large' ? 'h-16 w-16' : 'h-12 w-12';

  // 전체 페이지 여부에 따른 높이 조정
  const containerHeight = fullPage ? 'min-h-screen' : 'min-h-[200px]';

  return (
    <div
      className={`flex flex-col items-center justify-center ${containerHeight} py-10`}
    >
      <div
        className={`animate-spin rounded-full ${spinnerSize} border-t-2 border-b-2 border-primary mb-4`}
      ></div>
      <p className='text-gray-600'>{message}</p>
    </div>
  );
}
