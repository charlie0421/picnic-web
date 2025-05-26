import AuthCallback from '@/components/client/auth/AuthCallback';
import { Suspense } from 'react';

// 타입 정의 수정
type PageProps = {
  params: Promise<{ provider: string }>;
};

/**
 * 소셜 로그인 콜백 페이지
 *
 * 이 페이지는 서버 컴포넌트로 구현되고,
 * 필요한 인증 로직은 클라이언트 컴포넌트로 분리되어 있습니다.
 */
export default async function AuthCallbackPage({ params }: PageProps) {
  const { provider } = await params;

  return (
    <Suspense fallback={<div>인증 처리 중...</div>}>
      <AuthCallback provider={provider} />
    </Suspense>
  );
}
