'use client';

// 이 컴포넌트는 더 이상 사용되지 않습니다. 
// 서버 컴포넌트 구조로 변경되었습니다.
// StarCandyProductsFetcherServer -> StarCandyProductsPresenter 구조를 사용하세요.

interface StarCandyProductsWrapperProps {
  className?: string;
}

export function StarCandyProductsWrapper({ className }: StarCandyProductsWrapperProps) {
  return (
    <div className={className}>
      <p>이 컴포넌트는 더 이상 사용되지 않습니다. 서버 컴포넌트 구조로 변경되었습니다.</p>
    </div>
  );
} 