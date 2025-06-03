'use client';

import React from 'react';
import Link from 'next/link';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

interface AuthCallbackSkeletonProps {
  status?: string;
  error?: string;
  onRetry?: () => void;
}

/**
 * 인증 콜백 로딩 스켈레톤 컴포넌트
 * 인증 처리 중에 표시되는 로딩 화면
 */
const AuthCallbackSkeleton: React.FC<AuthCallbackSkeletonProps> = ({ 
  status = '로그인 처리 중...', 
  error, 
  onRetry 
}) => {
  const { getLocalizedPath } = useLocaleRouter();

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
          <div className="text-center">
            {/* 오류 아이콘 */}
            <div className="mx-auto mb-6 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            
            {/* 오류 메시지 */}
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              로그인 오류
            </h2>
            <p className="text-gray-600 mb-6 whitespace-pre-line">
              {error}
            </p>
            
            {/* 버튼들 */}
            <div className="space-y-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  다시 시도
                </button>
              )}
              <Link 
                href={getLocalizedPath('/login')}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                로그인 페이지로 돌아가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8">
        <div className="text-center">
          {/* 로딩 애니메이션 */}
          <div className="mx-auto mb-6 w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          
          {/* 메시지 */}
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            로그인 처리 중...
          </h2>
          <p className="text-gray-600 mb-6 whitespace-pre-line">
            {status}
          </p>
          
          {/* 뒤로가기 링크 */}
          <Link 
            href={getLocalizedPath('/login')}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            로그인 페이지로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthCallbackSkeleton; 