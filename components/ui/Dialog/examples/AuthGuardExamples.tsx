'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider-enhanced';
import { useAuthGuard, useRequireAuth } from '@/hooks/useAuthGuard';
import {
  withRequireAuth,
  withOptionalAuth,
} from '@/components/auth/withAuthGuard';
import { useLoginRequired } from '@/components/ui/Dialog';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteButton } from '@/components/client/vote/common/VoteButton';
import {
  getRedirectUrl,
  clearRedirectUrl,
  clearAllAuthData,
} from '@/utils/auth-redirect';
import { Card } from '@/components/common';

// 1. 훅을 사용한 예제
export function AuthGuardHookExample() {
  const { checkAuth, withAuth, navigateWithAuth, isAuthenticated } =
    useRequireAuth();
  const { t } = useLanguageStore();

  const handleVote = async () => {
    await withAuth(async () => {
      console.log('투표 실행!');
      // 실제 투표 로직
    });
  };

  const handleNavigateToProfile = async () => {
    await navigateWithAuth('/mypage');
  };

  return (
    <div className='space-y-4 p-4'>
      <h3 className='text-lg font-semibold'>인증 가드 훅 예제</h3>

      <div className='space-y-2'>
        <p>현재 인증 상태: {isAuthenticated ? '로그인됨' : '로그인 안됨'}</p>

        <button
          onClick={handleVote}
          className='px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
        >
          투표하기 (인증 필요)
        </button>

        <button
          onClick={handleNavigateToProfile}
          className='px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700'
        >
          마이페이지로 이동 (인증 필요)
        </button>
      </div>
    </div>
  );
}

// 2. HOC를 사용한 예제
function ProtectedComponent() {
  return (
    <div className='p-4 bg-green-50 rounded'>
      <h3 className='text-lg font-semibold text-green-800'>보호된 컴포넌트</h3>
      <p className='text-green-600'>
        이 컴포넌트는 로그인한 사용자만 볼 수 있습니다.
      </p>
    </div>
  );
}

function OptionalAuthComponent() {
  return (
    <div className='p-4 bg-blue-50 rounded'>
      <h3 className='text-lg font-semibold text-blue-800'>
        선택적 인증 컴포넌트
      </h3>
      <p className='text-blue-600'>
        이 컴포넌트는 로그인 여부와 관계없이 볼 수 있습니다.
      </p>
    </div>
  );
}

// HOC 적용
const ProtectedWithAuth = withRequireAuth(ProtectedComponent);
const OptionalWithAuth = withOptionalAuth(OptionalAuthComponent);

export function AuthGuardHOCExample() {
  return (
    <div className='space-y-4 p-4'>
      <h3 className='text-lg font-semibold'>인증 가드 HOC 예제</h3>

      <div className='space-y-4'>
        <ProtectedWithAuth />
        <OptionalWithAuth />
      </div>
    </div>
  );
}

// 3. 직접 로그인 다이얼로그 사용 예제
export function DirectLoginDialogExample() {
  const showLoginRequired = useLoginRequired();
  const { t } = useLanguageStore();
  const [result, setResult] = useState<string>('');

  const handleShowLoginDialog = async () => {
    const confirmed = await showLoginRequired({
      title: '프리미엄 기능',
      description:
        '이 기능은 프리미엄 회원만 사용할 수 있습니다. 로그인하시겠습니까?',
      redirectUrl: '/premium-feature',
      loginText: t('dialog.login_required.login_button') || '로그인하기',
      cancelText: t('dialog.login_required.cancel_button') || '나중에',
    });

    setResult(confirmed ? '로그인 선택됨' : '취소됨');
  };

  return (
    <div className='space-y-4 p-4'>
      <h3 className='text-lg font-semibold'>직접 로그인 다이얼로그 예제</h3>

      <button
        onClick={handleShowLoginDialog}
        className='px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700'
      >
        프리미엄 기능 사용하기
      </button>

      {result && <p className='text-sm text-gray-600'>결과: {result}</p>}
    </div>
  );
}

// 4. 커스텀 콜백을 사용한 예제
export function CustomCallbackExample() {
  const { checkAuth } = useAuthGuard({
    onAuthRequired: (redirectUrl) => {
      console.log('커스텀 인증 필요 처리:', redirectUrl);
      // 커스텀 로직 (예: 특별한 로그인 플로우)
    },
    onAuthSuccess: () => {
      console.log('인증 성공!');
      // 성공 후 추가 로직
    },
  });

  const handleCustomAuth = async () => {
    const isAuthorized = await checkAuth();
    if (isAuthorized) {
      console.log('인증된 사용자 전용 기능 실행');
    }
  };

  return (
    <div className='space-y-4 p-4'>
      <h3 className='text-lg font-semibold'>커스텀 콜백 예제</h3>

      <button
        onClick={handleCustomAuth}
        className='px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700'
      >
        커스텀 인증 체크
      </button>
    </div>
  );
}

// 5. VoteButton을 사용한 실제 투표 예제
export function VoteButtonExample() {
  const { t } = useLanguageStore();
  const [voteResult, setVoteResult] = useState<string>('');

  const handleVote = async (voteId: string, voteItemId: string) => {
    // 실제 투표 API 호출 시뮬레이션
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) {
          // 90% 성공률
          setVoteResult(`투표 성공: ${voteItemId}에 투표했습니다!`);
          resolve();
        } else {
          reject(new Error('투표 처리 중 오류가 발생했습니다.'));
        }
      }, 1500);
    });
  };

  return (
    <div className='space-y-4 p-4'>
      <h3 className='text-lg font-semibold'>VoteButton 투표 예제</h3>

      <div className='grid gap-4 md:grid-cols-2'>
        <div className='p-4 border rounded-lg'>
          <h4 className='font-medium mb-2'>아티스트 A</h4>
          <VoteButton
            voteId='vote-123'
            voteItemId='artist-a'
            onVote={handleVote}
            artistName='아티스트 A'
            className='w-full'
          />
        </div>

        <div className='p-4 border rounded-lg'>
          <h4 className='font-medium mb-2'>아티스트 B</h4>
          <VoteButton
            voteId='vote-123'
            voteItemId='artist-b'
            onVote={handleVote}
            artistName='아티스트 B'
            className='w-full'
          />
        </div>
      </div>

      {voteResult && (
        <div className='p-3 bg-green-50 border border-green-200 rounded-lg'>
          <p className='text-green-800 text-sm'>{voteResult}</p>
        </div>
      )}

      <div className='text-sm text-gray-600'>
        <p>
          <strong>테스트 방법:</strong>
        </p>
        <ul className='list-disc list-inside mt-1 space-y-1'>
          <li>
            로그아웃 상태에서 투표 버튼 클릭 → 로그인 필요 다이얼로그 표시
          </li>
          <li>로그인 상태에서 투표 버튼 클릭 → 투표 진행</li>
          <li>아티스트별로 다른 메시지 확인</li>
        </ul>
      </div>
    </div>
  );
}

// 전체 예제를 모은 컴포넌트
export function AuthGuardExamples() {
  const { isAuthenticated, user } = useAuth();
  const { withAuth } = useRequireAuth();
  const [debugInfo, setDebugInfo] = useState<any>({});

  // 디버깅 정보 업데이트
  useEffect(() => {
    const updateDebugInfo = () => {
      // sessionStorage와 localStorage 상태 확인
      const sessionStorageData = {};
      const localStorageData = {};

      try {
        // sessionStorage 데이터 수집
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && (key.includes('redirect') || key.includes('auth'))) {
            sessionStorageData[key] = sessionStorage.getItem(key);
          }
        }

        // localStorage 데이터 수집
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('redirect') || key.includes('auth'))) {
            localStorageData[key] = localStorage.getItem(key);
          }
        }
      } catch (error) {
        console.warn('Storage 접근 오류:', error);
      }

      // 인증 상태 검증
      const hasValidAuth = isAuthenticated && user && user.id;
      const hasStaleAuthData =
        !hasValidAuth &&
        (localStorage.getItem('auth_success') ||
          localStorage.getItem('auth_provider') ||
          localStorage.getItem('auth_timestamp'));

      setDebugInfo({
        isAuthenticated,
        userId: user?.id || null,
        userEmail: user?.email || null,
        hasValidAuth,
        hasStaleAuthData,
        currentPath:
          typeof window !== 'undefined' ? window.location.pathname : null,
        savedRedirectUrl: getRedirectUrl(),
        sessionStorage: sessionStorageData,
        localStorage: localStorageData,
        timestamp: new Date().toLocaleTimeString(),
      });
    };

    updateDebugInfo();
    const interval = setInterval(updateDebugInfo, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  const handleVoteAction = async () => {
    await withAuth(async () => {
      alert('투표가 완료되었습니다!');
    });
  };

  const handleClearRedirectUrl = () => {
    clearRedirectUrl();
    alert('리다이렉트 URL이 제거되었습니다.');
  };

  const handleSetTestRedirectUrl = () => {
    const testUrl = '/ko/vote/123';
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('auth_redirect_url', testUrl);
      sessionStorage.setItem('auth_redirect_timestamp', Date.now().toString());
      alert(`테스트 리다이렉트 URL 설정: ${testUrl}`);
    }
  };

  const handleClearAllStorage = () => {
    if (typeof window !== 'undefined') {
      // clearAllAuthData 함수 사용
      clearAllAuthData();
      alert('모든 인증 관련 저장소 데이터가 제거되었습니다.');
    }
  };

  const handleClearStaleAuthData = () => {
    if (typeof window !== 'undefined') {
      // 잘못된 인증 데이터만 정리
      const authKeys = ['auth_success', 'auth_provider', 'auth_timestamp'];
      authKeys.forEach((key) => {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
        }
      });
      alert('잘못된 인증 데이터가 정리되었습니다.');
    }
  };

  const handleTestGoogleLogin = () => {
    if (typeof window !== 'undefined') {
      // 구글 로그인 테스트
      window.location.href = '/api/auth/google';
    }
  };

  const handleCheckSupabaseSession = async () => {
    if (typeof window !== 'undefined') {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        console.log('🔍 Supabase 세션 확인:', {
          hasSession: !!session,
          userId: session?.user?.id,
          userEmail: session?.user?.email,
          provider: session?.user?.app_metadata?.provider,
          expiresAt: session?.expires_at,
          error: error?.message,
        });

        alert(
          `Supabase 세션 상태:\n${JSON.stringify(
            {
              hasSession: !!session,
              userId: session?.user?.id,
              userEmail: session?.user?.email,
              provider: session?.user?.app_metadata?.provider,
              error: error?.message,
            },
            null,
            2,
          )}`,
        );
      } catch (error) {
        console.error('세션 확인 오류:', error);
        alert(`세션 확인 오류: ${error}`);
      }
    }
  };

  return (
    <div className='space-y-6 p-6'>
      <h2 className='text-2xl font-bold'>인증 가드 테스트</h2>

      {/* 디버깅 정보 */}
      <Card>
        <Card.Header>
          <h3 className='text-lg font-semibold'>디버깅 정보</h3>
        </Card.Header>
        <Card.Body>
          <div className='space-y-2 text-sm'>
            <div>
              <strong>인증 상태:</strong>{' '}
              {debugInfo.isAuthenticated ? '✅ 로그인됨' : '❌ 로그아웃됨'}
            </div>
            <div>
              <strong>유효한 인증:</strong>{' '}
              {debugInfo.hasValidAuth ? '✅ 유효함' : '❌ 무효함'}
            </div>
            {debugInfo.hasStaleAuthData && (
              <div className='text-red-600'>
                <strong>⚠️ 잘못된 인증 데이터:</strong> 로컬 스토리지에 오래된
                인증 데이터가 남아있습니다.
              </div>
            )}
            <div>
              <strong>사용자 ID:</strong> {debugInfo.userId || 'N/A'}
            </div>
            <div>
              <strong>사용자 이메일:</strong> {debugInfo.userEmail || 'N/A'}
            </div>
            <div>
              <strong>현재 경로:</strong> {debugInfo.currentPath || 'N/A'}
            </div>
            <div>
              <strong>저장된 리다이렉트 URL:</strong>{' '}
              {debugInfo.savedRedirectUrl || 'N/A'}
            </div>
            <div>
              <strong>마지막 업데이트:</strong> {debugInfo.timestamp}
            </div>

            {/* sessionStorage 정보 */}
            <div className='mt-4 pt-4 border-t'>
              <strong>SessionStorage:</strong>
              <div className='ml-4 mt-2 space-y-1'>
                {debugInfo.sessionStorage &&
                Object.keys(debugInfo.sessionStorage).length > 0 ? (
                  Object.entries(debugInfo.sessionStorage).map(
                    ([key, value]) => (
                      <div key={key} className='text-xs'>
                        <span className='font-mono text-blue-600'>{key}:</span>{' '}
                        {String(value)}
                      </div>
                    ),
                  )
                ) : (
                  <div className='text-xs text-gray-500'>관련 데이터 없음</div>
                )}
              </div>
            </div>

            {/* localStorage 정보 */}
            <div className='mt-4 pt-4 border-t'>
              <strong>LocalStorage:</strong>
              <div className='ml-4 mt-2 space-y-1'>
                {debugInfo.localStorage &&
                Object.keys(debugInfo.localStorage).length > 0 ? (
                  Object.entries(debugInfo.localStorage).map(([key, value]) => (
                    <div key={key} className='text-xs'>
                      <span className='font-mono text-green-600'>{key}:</span>{' '}
                      {String(value)}
                    </div>
                  ))
                ) : (
                  <div className='text-xs text-gray-500'>관련 데이터 없음</div>
                )}
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* 테스트 버튼들 */}
      <Card>
        <Card.Header>
          <h3 className='text-lg font-semibold'>테스트 액션</h3>
        </Card.Header>
        <Card.Body className='space-y-4'>
          <button
            onClick={handleVoteAction}
            className='w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors'
          >
            투표하기 (인증 필요)
          </button>

          <button
            onClick={() => {
              // 실제 투표 페이지로 이동하여 테스트
              if (typeof window !== 'undefined') {
                window.location.href = '/ko/vote/1';
              }
            }}
            className='w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors'
          >
            실제 투표 페이지로 이동 (테스트용)
          </button>

          <button
            onClick={handleClearRedirectUrl}
            className='w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors'
          >
            리다이렉트 URL 제거
          </button>

          <button
            onClick={handleSetTestRedirectUrl}
            className='w-full px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors'
          >
            테스트 리다이렉트 URL 설정
          </button>

          <button
            onClick={handleClearAllStorage}
            className='w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
          >
            모든 인증 관련 저장소 데이터 제거
          </button>

          <button
            onClick={handleClearStaleAuthData}
            className='w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
          >
            잘못된 인증 데이터 정리
          </button>

          {isAuthenticated && (
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/login';
                }
              }}
              className='w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
            >
              로그인 페이지로 이동 (테스트용)
            </button>
          )}

          <button
            onClick={handleTestGoogleLogin}
            className='w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
          >
            구글 로그인 테스트
          </button>

          <button
            onClick={handleCheckSupabaseSession}
            className='w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors'
          >
            스파바 세션 확인
          </button>
        </Card.Body>
      </Card>

      {/* 기존 예제들 */}
      <VoteButtonExample />
    </div>
  );
}
