'use client';

import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const StarCandyProductsPresenter = dynamic(
  () => import('./StarCandyProductsPresenter').then(mod => ({ default: mod.StarCandyProductsPresenter })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">별사탕 충전</h1>
          <p className="text-gray-600">투표에 필요한 별사탕을 충전하세요</p>
        </div>
        <div className="flex justify-center items-center min-h-[200px]">
          <LoadingSpinner />
          <span className="ml-3 text-gray-600">상품 정보를 불러오는 중...</span>
        </div>
      </div>
    ),
  }
);

interface StarCandyProductsWrapperProps {
  className?: string;
}

export function StarCandyProductsWrapper({ className }: StarCandyProductsWrapperProps) {
  // 이 컴포넌트는 더 이상 사용되지 않습니다. 서버 컴포넌트 구조로 변경되었습니다.
  return (
    <div className={className}>
      <p>이 컴포넌트는 더 이상 사용되지 않습니다.</p>
    </div>
  );
} 