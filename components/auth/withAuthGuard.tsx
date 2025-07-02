'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth-provider-enhanced';
import { useLoginRequired } from '@/components/ui/Dialog';
import { saveRedirectUrl } from '@/utils/auth-redirect';
import { useLanguageStore } from '@/stores/languageStore';

export interface WithAuthGuardOptions {
  redirectUrl?: string;
  fallback?: React.ComponentType;
  loadingComponent?: React.ComponentType;
  onAuthRequired?: (redirectUrl?: string) => void;
  onAuthSuccess?: () => void;
  requireAuth?: boolean;
}

export function withAuthGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithAuthGuardOptions = {},
) {
  const {
    redirectUrl,
    fallback: FallbackComponent,
    loadingComponent: LoadingComponent,
    onAuthRequired,
    onAuthSuccess,
    requireAuth = true,
  } = options;

  const AuthGuardedComponent = (props: P) => {
    const { isAuthenticated, isLoading, user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const showLoginRequired = useLoginRequired();
    const { t } = useLanguageStore();
    const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

    useEffect(() => {
      const checkAuth = async () => {
        // 로딩 중이면 대기
        if (isLoading) {
          return;
        }

        // 인증이 필요하지 않으면 통과
        if (!requireAuth) {
          setHasCheckedAuth(true);
          return;
        }

        // 인증되어 있으면 성공 콜백 실행
        if (isAuthenticated && user) {
          if (onAuthSuccess) {
            onAuthSuccess();
          }
          setHasCheckedAuth(true);
          return;
        }

        // 인증되지 않았으면 로그인 다이얼로그 표시
        const currentRedirectUrl = redirectUrl || pathname;

        // 리다이렉트 URL 미리 저장
        if (currentRedirectUrl) {
          saveRedirectUrl(currentRedirectUrl);
        }

        if (onAuthRequired) {
          onAuthRequired(currentRedirectUrl);
          return;
        }

        // 기본 로그인 다이얼로그 표시
        const confirmed = await showLoginRequired({
          redirectUrl: currentRedirectUrl,
          title: t('dialog.login_required.title') || '로그인이 필요합니다',
          description:
            t('dialog.login_required.description') ||
            '이 페이지에 접근하려면 로그인이 필요합니다. 로그인 페이지로 이동하시겠습니까?',
        });

        if (!confirmed) {
          // 사용자가 로그인을 거부한 경우 이전 페이지로 이동
          router.back();
        }
      };

      checkAuth();
    }, [
      isLoading,
      isAuthenticated,
      user,
      pathname,
      router,
      showLoginRequired,
      t,
    ]);

    // 로딩 중
    if (isLoading || !hasCheckedAuth) {
      if (LoadingComponent) {
        return <LoadingComponent />;
      }

      return (
        <div className='flex items-center justify-center min-h-screen'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
        </div>
      );
    }

    // 인증이 필요하지만 인증되지 않은 경우
    if (requireAuth && !isAuthenticated) {
      if (FallbackComponent) {
        return <FallbackComponent />;
      }

      return (
        <div className='flex items-center justify-center min-h-screen'>
          <div className='text-center'>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white mb-2'>
              {t('dialog.login_required.title') || '로그인이 필요합니다'}
            </h2>
            <p className='text-gray-600 dark:text-gray-400'>
              {t('dialog.login_required.description') ||
                '이 페이지에 접근하려면 로그인이 필요합니다.'}
            </p>
          </div>
        </div>
      );
    }

    // 인증 통과 - 원래 컴포넌트 렌더링
    return <WrappedComponent {...props} />;
  };

  // 디스플레이 이름 설정 (디버깅용)
  AuthGuardedComponent.displayName = `withAuthGuard(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return AuthGuardedComponent;
}

// 편의 HOC들
export function withRequireAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<WithAuthGuardOptions, 'requireAuth'>,
) {
  return withAuthGuard(WrappedComponent, { ...options, requireAuth: true });
}

export function withOptionalAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<WithAuthGuardOptions, 'requireAuth'>,
) {
  return withAuthGuard(WrappedComponent, { ...options, requireAuth: false });
}
