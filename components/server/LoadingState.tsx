import React from 'react';

interface LoadingStateProps {
  message?: string;
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
export default function LoadingState({ message = '로딩 중...' }: LoadingStateProps) {
  return (
    <div className='flex flex-col items-center justify-center min-h-[200px] py-10'>
      <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4'></div>
      <p className='text-gray-600'>{message}</p>
    </div>
  );
} 