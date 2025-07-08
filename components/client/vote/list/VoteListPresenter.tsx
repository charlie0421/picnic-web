'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Vote } from '@/types/interfaces';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { getVoteStatus } from '@/components/server/utils';
import { VoteStatus } from '@/stores/voteFilterStore';
import { VoteCard } from '..';

export interface VoteListPresenterProps {
  votes: Vote[];
  onVoteClick?: (voteId: string | number) => void;
  className?: string;
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
}

export function VoteListPresenter({ 
  votes, 
  onVoteClick,
  className,
  hasMore = false,
  isLoading = false,
  onLoadMore
}: VoteListPresenterProps) {
  const router = useRouter();
  const { t } = useLocaleRouter();
  const [selectedStatus, setSelectedStatus] = useState<VoteStatus | 'all'>('all');
  
  const filteredVotes = votes.filter(vote => {
    if (selectedStatus === 'all') return true;
    const voteStatus = getVoteStatus(vote);
    return voteStatus === selectedStatus;
  });
  
  const handleVoteClick = (voteId: string | number) => {
    if (onVoteClick) {
      onVoteClick(voteId);
    } else {
      // 기본 라우팅 동작
      router.push(`/vote/${voteId}`);
    }
  };
  
  return (
    <div className={className}>
      {/* 투표 목록 */}
      {filteredVotes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVotes.map(vote => (
              <VoteCard
                key={vote.id}
                vote={vote}
                onClick={() => handleVoteClick(vote.id)}
              />
            ))}
          </div>
          
          {/* 페이지네이션 */}
          {hasMore && onLoadMore && (
            <div className="flex justify-center mt-8">
              <button
                onClick={onLoadMore}
                disabled={isLoading}
                className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? '로딩 중...' : '더보기'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">{t('text_vote_no_items')}</p>
        </div>
      )}
    </div>
  );
} 