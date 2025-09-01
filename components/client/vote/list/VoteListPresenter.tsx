'use client';

import { useEffect, useRef, useState } from 'react';
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

  // 상태 전환(예정→진행, 진행→마감) 시점에 페이지 자동 새로고침
  const reloadTimerRef = useRef<number | null>(null);
  const nextTransitionTsRef = useRef<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    let nextTimestamp: number | null = null;

    for (const v of votes) {
      if (!v) continue;
      if (v.start_at) {
        const ts = new Date(v.start_at).getTime();
        if (!Number.isNaN(ts) && ts > now) {
          nextTimestamp = nextTimestamp === null ? ts : Math.min(nextTimestamp, ts);
        }
      }
      if (v.stop_at) {
        const ts = new Date(v.stop_at).getTime();
        if (!Number.isNaN(ts) && ts > now) {
          nextTimestamp = nextTimestamp === null ? ts : Math.min(nextTimestamp, ts);
        }
      }
    }

    if (reloadTimerRef.current) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }

    if (nextTimestamp !== null) {
      nextTransitionTsRef.current = nextTimestamp;
      const delay = Math.max(0, nextTimestamp - Date.now());
      reloadTimerRef.current = window.setTimeout(() => {
        // 전체 페이지 새로고침
        window.location.reload();
      }, delay);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const ts = nextTransitionTsRef.current;
        if (ts !== null && Date.now() >= ts) {
          window.location.reload();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [votes]);
  
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
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  '더보기'
                )}
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