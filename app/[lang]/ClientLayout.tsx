'use client';

import React, { useEffect, useState } from 'react';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { SimpleAuthProvider } from '@/lib/supabase/auth-provider-simple';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { Analytics } from '@vercel/analytics/react';
import { DialogProvider } from '@/components/ui/Dialog';
import { AuthRedirectHandler } from '@/components/auth/AuthRedirectHandler';
import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';
import { PageErrorBoundary, registerGlobalErrorHandler } from '@/components/common/ErrorBoundary';
import { ErrorProvider, useError } from '@/contexts/ErrorContext';
import { ErrorToast } from '@/components/common/GlobalErrorDisplay';

interface ClientLayoutProps {
  children: any;
  initialLanguage: string;
}

// 글로벌 에러 핸들러 등록 컴포넌트
function GlobalErrorIntegration() {
  const { addError } = useError();

  useEffect(() => {
    // Error Boundary에서 사용할 수 있도록 글로벌 에러 핸들러 등록
    registerGlobalErrorHandler({ addError });

    // 전역 에러 이벤트 리스너 등록
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled Promise Rejection:', event.reason);
      addError(
        event.reason instanceof Error ? event.reason : String(event.reason),
        { autoHide: true, duration: 8000 }
      );
    };

    const handleError = (event: ErrorEvent) => {
      console.error('Global Error:', event.error);
      addError(
        event.error || event.message,
        { autoHide: true, duration: 8000 }
      );
    };

    // 이벤트 리스너 등록
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      // 정리
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [addError]);

  return null;
}

export default function ClientLayout({
  children,
  initialLanguage,
}: ClientLayoutProps) {
  // Provider들을 항상 렌더링하여 하이드레이션 미스매치 방지
  return (
    <ErrorProvider
      maxErrors={10}
      defaultAutoHide={true}
      defaultDuration={5000}
    >
      <PageErrorBoundary 
        identifier="client-layout"
        propagateToGlobal={true}
        onError={(error) => {
          // 클라이언트 레이아웃 에러에 대한 추가 처리
          console.error('ClientLayout Error:', error.toLogData());
        }}
      >
        <NavigationProvider>
          <LanguageSyncProvider initialLanguage={initialLanguage}>
            <SupabaseProvider>
              {/* SimpleAuthProvider를 한 번만 제공 - React 에러 #310 방지 */}
              <SimpleAuthProvider>
                {/* @ts-ignore */}
                <DialogProvider>
                  {/* @ts-ignore */}
                  <AuthRedirectHandler>
                    <GlobalErrorIntegration />
                    {children}
                    <Analytics />
                    {/* 글로벌 에러 표시 컴포넌트 */}
                    <ErrorToast />
                  </AuthRedirectHandler>
                </DialogProvider>
              </SimpleAuthProvider>
            </SupabaseProvider>
          </LanguageSyncProvider>
        </NavigationProvider>
      </PageErrorBoundary>
    </ErrorProvider>
  );
}
