'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/supabase/auth-provider';
import { RetryButton } from '@/components/client/RetryButton';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    console.error(error);
  }, [error]);

  if (isLoading) {
    return <div>Loading user status...</div>;
  }

  // 로그인 실패 또는 인증이 필요한 경우
  if (error.message.includes('Auth') || !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-2xl font-bold mb-4">Authentication Error</h2>
        {isAuthenticated ? (
          <p className="mb-4">An unexpected error occurred.</p>
        ) : (
          <p className="mb-4">You are not logged in.</p>
        )}
        <RetryButton />
      </div>
    );
  }

  // 그 외 일반적인 에러
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-4">Something went wrong in Server Component!</h2>
      <p className="mb-4">{error.message}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
      >
        Try again
      </button>
    </div>
  );
} 