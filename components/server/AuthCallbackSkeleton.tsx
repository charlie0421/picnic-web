import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface AuthCallbackSkeletonProps {
  error?: string | null;
  onRetry?: () => void;
}

/**
 * 인증 콜백 페이지에서 사용하는 스켈레톤/로딩 UI
 * 정적 UI 부분은 서버 컴포넌트로 구현하고 
 * 버튼 클릭 같은 인터랙션이 필요한 부분만 클라이언트 컴포넌트로 분리
 */
export default function AuthCallbackSkeleton({
  error = null,
  onRetry,
}: AuthCallbackSkeletonProps) {
  // 에러 표시
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">로그인 오류</h1>
        <p className="text-red-500 mb-6">{error}</p>
        {/* 클라이언트 컴포넌트로 분리 필요한 부분 */}
        {onRetry ? (
          <div id="retry-button-container" data-retry-handler="true" />
        ) : (
          <Link
            href="/login"
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            로그인으로 돌아가기
          </Link>
        )}
      </div>
    );
  }

  // 심플한 로딩바
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        {/* 로고 아이콘 with 펄스 애니메이션 */}
        <div className="relative">
          <Image
            src="/images/logo.png"
            alt="Picnic Loading"
            width={80}
            height={80}
            priority
            className="w-20 h-20 rounded-full animate-pulse drop-shadow-lg object-cover"
          />
        </div>
        
        {/* 로딩 텍스트 */}
        <div className="mt-6 text-gray-600 text-sm font-medium animate-pulse">
          로그인 처리 중...
        </div>
      </div>
    </div>
  );
} 