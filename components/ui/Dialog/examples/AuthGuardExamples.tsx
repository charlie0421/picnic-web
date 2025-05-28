'use client';

import { useState } from 'react';
import { useAuthGuard, useRequireAuth } from '@/hooks/useAuthGuard';
import {
  withRequireAuth,
  withOptionalAuth,
} from '@/components/auth/withAuthGuard';
import { useLoginRequired } from '@/components/ui/Dialog';
import { useLanguageStore } from '@/stores/languageStore';
import { VoteButton } from '@/components/client/vote/common/VoteButton';

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
  return (
    <div className='max-w-4xl mx-auto space-y-8 p-6'>
      <h2 className='text-2xl font-bold text-center'>인증 가드 시스템 예제</h2>

      <div className='grid gap-6'>
        <AuthGuardHookExample />
        <AuthGuardHOCExample />
        <DirectLoginDialogExample />
        <CustomCallbackExample />
        <VoteButtonExample />
      </div>
    </div>
  );
}
