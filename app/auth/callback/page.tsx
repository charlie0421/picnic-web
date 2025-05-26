import AuthCallback from '@/components/client/auth/AuthCallback';
import { Suspense } from 'react';

/**
 * 범용 OAuth 콜백 페이지
 * 
 * Supabase에서 OAuth 처리 후 /auth/callback로 리다이렉트할 때 사용
 * AuthCallback 컴포넌트에서 URL 파라미터나 기타 방법으로 provider를 감지
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div>OAuth 인증 처리 중...</div>}>
      <AuthCallback />
    </Suspense>
  );
} 