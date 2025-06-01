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
      title: t('vote_login_required_title'),
      description: artistName
        ? t('vote_login_required_description_with_artist', { artistName })
        : t('vote_login_required_description'),
      loginText: t('button_login'),
      cancelText: t('button_cancel'),
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
        const errorMessage = t('vote_error_general');
        setError(errorMessage);
        console.error('Vote error:', err);
      } finally {
        setIsVoting(false);
      }
    });
  };

  const getButtonText = () => {
    if (hasVoted) {
      return t('vote_button_completed');
    }
    if (isVoting) {
      return t('vote_button_voting');
    }
    if (isAuthenticated) {
      return t('vote_button_vote');
    }
    return t('vote_button_login_to_vote');
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
