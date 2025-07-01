'use client';

import { useEffect, useState } from 'react';

interface EnvironmentStatus {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 환경 변수 유효성 검증 컴포넌트
 * 필수 환경 변수가 누락되었거나 잘못된 경우 사용자에게 알림을 표시합니다.
 */
export function EnvironmentValidator({ children }: { children: React.ReactNode }) {
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus>({
    isValid: true,
    errors: [],
    warnings: []
  });
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const validateEnvironment = () => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // 필수 환경 변수 확인
      const requiredVars = [
        {
          name: 'NEXT_PUBLIC_SUPABASE_URL',
          value: process.env.NEXT_PUBLIC_SUPABASE_URL,
          validator: (value: string) => {
            if (!value) return '값이 설정되지 않았습니다.';
            if (!value.startsWith('https://')) return 'https://로 시작해야 합니다.';
            if (!value.includes('.supabase.co')) return '.supabase.co 도메인이 포함되어야 합니다.';
            return null;
          }
        },
        {
          name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
          value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          validator: (value: string) => {
            if (!value) return '값이 설정되지 않았습니다.';
            if (value.length < 100) return '키가 너무 짧습니다. (최소 100자 필요)';
            if (!value.startsWith('eyJ')) return 'JWT 형식이 아닙니다. eyJ로 시작해야 합니다.';
            return null;
          }
        }
      ];

      // 필수 변수 검증
      for (const envVar of requiredVars) {
        const error = envVar.validator(envVar.value || '');
        if (error) {
          errors.push(`${envVar.name}: ${error}`);
        }
      }

      // 선택적 환경 변수 확인
      const optionalVars = [
        'NEXT_PUBLIC_SUPABASE_STORAGE_URL'
      ];

      for (const varName of optionalVars) {
        if (!process.env[varName]) {
          warnings.push(`${varName}이 설정되지 않았습니다. (선택사항)`);
        }
      }

      setEnvStatus({
        isValid: errors.length === 0,
        errors,
        warnings
      });
      setIsChecking(false);
    };

    // 약간의 지연 후 검증 실행 (초기 렌더링 이후)
    const timeoutId = setTimeout(validateEnvironment, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  // 검증 중일 때는 아무것도 표시하지 않음
  if (isChecking) {
    return <>{children}</>;
  }

  // 환경 변수가 유효하면 자식 컴포넌트 렌더링
  if (envStatus.isValid) {
    return <>{children}</>;
  }

  // 환경 변수 오류가 있으면 오류 페이지 표시
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* 오류 아이콘 */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-6">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>

          {/* 제목 */}
          <div className="text-center">
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              환경 설정 오류
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              애플리케이션을 실행하기 위해 필요한 환경 변수가 올바르게 설정되지 않았습니다.
            </p>
          </div>

          {/* 오류 목록 */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-red-800 mb-3">해결해야 할 문제:</h3>
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <ul className="text-sm text-red-700 space-y-1">
                {envStatus.errors.map((error, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-red-500 mr-2">•</span>
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 경고 목록 (있는 경우) */}
          {envStatus.warnings.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-yellow-800 mb-3">권장사항:</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <ul className="text-sm text-yellow-700 space-y-1">
                  {envStatus.warnings.map((warning, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-yellow-500 mr-2">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 해결 방법 */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-900 mb-3">해결 방법:</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <ol className="text-sm text-blue-700 space-y-2">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 font-medium">1.</span>
                  <span>프로젝트 루트에 <code className="bg-blue-100 px-1 rounded">.env.local</code> 파일을 생성하세요.</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 font-medium">2.</span>
                  <span>필요한 환경 변수를 설정하세요.</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2 font-medium">3.</span>
                  <span>애플리케이션을 재시작하세요.</span>
                </li>
              </ol>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              페이지 새로고침
            </button>
            
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.open('/ko/debug-env', '_blank');
                  }
                }}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                디버그 페이지 열기
              </button>
            )}
          </div>

          {/* 개발 환경에서만 표시되는 상세 정보 */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  개발자 정보 보기
                </summary>
                <div className="mt-3 bg-gray-50 rounded p-3 space-y-1">
                  <div>
                    <strong>NODE_ENV:</strong> {process.env.NODE_ENV}
                  </div>
                  <div>
                    <strong>NEXT_PUBLIC_SUPABASE_URL:</strong>{' '}
                    {process.env.NEXT_PUBLIC_SUPABASE_URL ? 
                      `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...` : 
                      '❌ 설정되지 않음'
                    }
                  </div>
                  <div>
                    <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY:</strong>{' '}
                    {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 
                      `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20)}... (길이: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length})` : 
                      '❌ 설정되지 않음'
                    }
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EnvironmentValidator; 