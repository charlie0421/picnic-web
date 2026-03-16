'use client';

import { useAuth } from '@/lib/supabase/auth-provider';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { getRedirectUrl, clearRedirectUrl } from '@/utils/auth-redirect';

export default function TestRedirectPage() {
  const { isAuthenticated, user } = useAuth();
  const { withAuth } = useRequireAuth();

  const handleVoteAction = async () => {
    await withAuth(async () => {
      alert('투표가 완료되었습니다!');
    });
  };

  return (
    <div className='container mx-auto py-6 max-w-4xl'>
      <h1 className='text-3xl font-bold mb-8 text-center'>
        리다이렉트 플로우 테스트
      </h1>

      <div className='mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200'>
        <h2 className='text-xl font-semibold mb-4 text-blue-800'>
          테스트 가이드
        </h2>
        <div className='space-y-2 text-sm text-blue-600'>
          <p>1. 로그아웃 상태에서 &ldquo;투표하기&rdquo; 버튼 클릭</p>
          <p>2. 로그인 필요 다이얼로그 확인</p>
          <p>3. 로그인 후 이 페이지로 리다이렉트되는지 확인</p>
        </div>
      </div>

      <div className='space-y-4 p-6 bg-white rounded-lg border'>
        <div className='text-sm space-y-1'>
          <p>인증 상태: {isAuthenticated ? '로그인됨' : '로그아웃됨'}</p>
          <p>사용자 ID: {user?.id || 'N/A'}</p>
          <p>저장된 리다이렉트 URL: {getRedirectUrl() || 'N/A'}</p>
        </div>

        <div className='space-y-2'>
          <button
            onClick={handleVoteAction}
            className='w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'
          >
            투표하기 (인증 필요)
          </button>

          <button
            onClick={() => clearRedirectUrl()}
            className='w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600'
          >
            리다이렉트 URL 제거
          </button>
        </div>
      </div>
    </div>
  );
}
