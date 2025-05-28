'use client';

import { useState } from 'react';
import { Button } from '@/components/common';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { useLanguageStore } from '@/stores/languageStore';

export interface VoteButtonProps {
  voteId: string;
  voteItemId: string;
  onVote: (voteId: string, voteItemId: string) => Promise<void>;
  disabled?: boolean;
  hasVoted?: boolean;
  className?: string;
  artistName?: string; // 투표 대상 아티스트 이름 (다이얼로그에서 사용)
}

export const VoteButton = ({
  voteId,
  voteItemId,
  onVote,
  disabled = false,
  hasVoted = false,
  className,
  artistName,
}: VoteButtonProps) => {
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguageStore();

  const { withAuth, isAuthenticated } = useRequireAuth({
    // 커스텀 로그인 다이얼로그 메시지
    customLoginMessage: {
      title: t('vote.login_required.title') || '투표하려면 로그인이 필요합니다',
      description: artistName
        ? t('vote.login_required.description_with_artist')?.replace(
            '{artistName}',
            artistName,
          ) ||
          `${artistName}에게 투표하려면 로그인이 필요합니다. 로그인하시겠습니까?`
        : t('vote.login_required.description') ||
          '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
      loginText: t('dialog.login_required.login_button') || '로그인',
      cancelText: t('dialog.login_required.cancel_button') || '취소',
    },
  });

  const handleVote = async () => {
    if (disabled || hasVoted || isVoting) return;

    // 인증이 필요한 투표 액션을 실행
    await withAuth(async () => {
      setIsVoting(true);
      setError(null);

      try {
        await onVote(voteId, voteItemId);
      } catch (err) {
        const errorMessage =
          t('vote.error.general') || '투표 중 오류가 발생했습니다.';
        setError(errorMessage);
        console.error('Vote error:', err);
      } finally {
        setIsVoting(false);
      }
    });
  };

  const getButtonText = () => {
    if (hasVoted) {
      return t('vote.button.completed') || '투표 완료';
    }
    if (isVoting) {
      return t('vote.button.voting') || '투표 중...';
    }
    if (isAuthenticated) {
      return t('vote.button.vote') || '투표하기';
    }
    return t('vote.button.login_to_vote') || '로그인 후 투표하기';
  };

  return (
    <div className={className}>
      <Button
        onClick={handleVote}
        disabled={disabled || hasVoted || isVoting}
        loading={isVoting}
        variant={hasVoted ? 'secondary' : 'primary'}
        fullWidth
      >
        {getButtonText()}
      </Button>

      {error && (
        <p className='mt-2 text-sm text-red-600 text-center'>{error}</p>
      )}
    </div>
  );
};
