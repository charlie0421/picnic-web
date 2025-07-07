import { Link } from 'lucide-react';
import React from 'react';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {/* 심플한 로딩바 */}
        <div className="relative">
          {/* 외부 원 */}
          <div className="w-20 h-20 border-4 border-gray-200 rounded-full"></div>
          {/* 회전하는 로딩바 */}
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        
        {/* 간단한 점 애니메이션 */}
        <div className="flex justify-center items-center mt-6 space-x-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
        </div>
      </div>
    </div>
  );
} 