'use client';

import { useState } from 'react';
import { Button } from '@/components/common';

export interface VoteButtonProps {
  voteId: string;
  voteItemId: string;
  onVote: (voteId: string, voteItemId: string) => Promise<void>;
  disabled?: boolean;
  hasVoted?: boolean;
  className?: string;
}

export function VoteButton({ 
  voteId, 
  voteItemId, 
  onVote,
  disabled = false,
  hasVoted = false,
  className 
}: VoteButtonProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleVote = async () => {
    if (disabled || hasVoted || isVoting) return;
    
    setIsVoting(true);
    setError(null);
    
    try {
      await onVote(voteId, voteItemId);
    } catch (err) {
      setError('투표 중 오류가 발생했습니다.');
      console.error('Vote error:', err);
    } finally {
      setIsVoting(false);
    }
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
        {hasVoted ? '투표 완료' : '투표하기'}
      </Button>
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
} 