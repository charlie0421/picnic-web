// app/auth/loading/page.tsx
import { Suspense } from 'react';
import AuthCallbackClient from '@/components/client/auth/AuthCallback/AuthCallbackClient';
import CallbackLoading from '@/components/server/auth/CallbackLoading';

/**
 * 전용 인증 로딩 페이지.
 * 전용 로딩 UI와 인증 처리 클라이언트를 결합합니다.
 */
export default function AuthLoadingPage() {
  return (
    <>
      <CallbackLoading />
      {/* 
        인증 처리는 클라이언트에서 이루어집니다.
        Suspense는 클라이언트에서 searchParams를 안전하게 읽기 위해 필요합니다.
      */}
      <Suspense fallback={null}>
        <AuthCallbackClient />
      </Suspense>
    </>
  );
}
