import React from 'react';
import Image from 'next/image';

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
  message,
  fullPage = false,
  size = 'medium',
}: LoadingStateProps) {
  // 전체 페이지 로딩인 경우 공통 컴포넌트 사용
  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          {/* 로고 아이콘 with 펄스 애니메이션 */}
          <div className="relative inline-block">
            <Image
              src="/images/logo.png"
              alt="Picnic Loading"
              width={80}
              height={80}
              priority
              className="w-20 h-20 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
            />
          </div>
          
          {/* 로딩 텍스트 - 메시지가 있을 때만 표시 */}
          {message && (
            <div className="mt-6 text-gray-600 text-sm font-medium animate-scale-pulse">
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 부분 로딩인 경우 기존 스타일 유지하되 텍스트 제거
  const containerHeight = 'min-h-[200px]';

  return (
    <div className={`flex items-center justify-center ${containerHeight} py-10`}>
      <div className="text-center">
        {/* 로고 아이콘 with 펄스 애니메이션 */}
        <div className="relative inline-block">
          <Image
            src="/images/logo.png"
            alt="Picnic Loading"
            width={64}
            height={64}
            priority
            className="w-16 h-16 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
          />
        </div>
        
        {/* 로딩 텍스트 - 메시지가 있을 때만 표시 */}
        {message && (
          <div className="mt-4 text-gray-600 text-sm font-medium animate-scale-pulse">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
