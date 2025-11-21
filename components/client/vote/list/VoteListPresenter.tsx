'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Vote } from '@/types/interfaces';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { getVoteStatus } from '@/components/server/utils';
import { VoteStatus } from '@/stores/voteFilterStore';
import VoteCard from './VoteCard';

const VoteCardSkeleton = () => (
  <div className="h-full rounded-xl border border-gray-100 bg-gray-100/80 animate-pulse" />
);

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export interface VoteListPresenterProps {
  votes: Vote[];
  onVoteClick?: (voteId: string | number) => void;
  className?: string;
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
  isInitialLoading?: boolean;
  locale?: string;
}

const INITIAL_VISIBLE_CARDS = 3;

export function VoteListPresenter({
  votes,
  onVoteClick,
  className,
  hasMore = false,
  isLoading = false,
  onLoadMore,
  isInitialLoading = false,
  locale,
}: VoteListPresenterProps) {
  const router = useRouter();
  const { t } = useLocaleRouter();
  const [selectedStatus, setSelectedStatus] = useState<VoteStatus | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(votes.length, INITIAL_VISIBLE_CARDS),
  );

  // 상태 전환(예정→진행, 진행→마감) 시점에 페이지 자동 새로고침
  const reloadTimerRef = useRef<number | null>(null);
  const nextTransitionTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || votes.length === 0) {
      return;
    }

    const win = window as WindowWithIdleCallback;
    const now = Date.now();
    const scheduleTransitionCheck = () => {
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

      const lastReloadTs = Number(sessionStorage.getItem('vote-last-reload-ts') || '0');
        const reloadedRecently = Date.now() - lastReloadTs < 15000;
      if (!reloadedRecently) {
        reloadTimerRef.current = window.setTimeout(() => {
            sessionStorage.setItem('vote-last-reload-ts', String(Date.now()));
          try {
            router.refresh();
          } catch {
            window.location.reload();
          }
        }, delay);
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const ts = nextTransitionTsRef.current;
        if (ts !== null && Date.now() >= ts) {
          const lastReloadTs = Number(sessionStorage.getItem('vote-last-reload-ts') || '0');
          const reloadedRecently = Date.now() - lastReloadTs < 15000;
          if (!reloadedRecently) {
              sessionStorage.setItem('vote-last-reload-ts', String(Date.now()));
            try {
              router.refresh();
            } catch {
              window.location.reload();
            }
          }
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
    };

    let idleHandle: number | null = null;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      cleanup = scheduleTransitionCheck();
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleHandle = win.requestIdleCallback(run, { timeout: 1000 });
    } else {
      run();
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleHandle);
      }
      cleanup?.();
    };
  }, [votes, router]);
  
  const filteredVotes = useMemo(() => {
    return votes.filter((vote) => {
    if (selectedStatus === 'all') return true;
    const voteStatus = getVoteStatus(vote);
    return voteStatus === selectedStatus;
  });
  }, [votes, selectedStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setVisibleCount(Math.min(filteredVotes.length, INITIAL_VISIBLE_CARDS));

    const win = window as WindowWithIdleCallback;
    const reveal = () => setVisibleCount(filteredVotes.length);
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    if (typeof win.requestIdleCallback === 'function') {
      idleHandle = win.requestIdleCallback(reveal, { timeout: 1200 });
    } else {
      timeoutHandle = window.setTimeout(reveal, 600);
    }

    return () => {
      if (idleHandle !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [filteredVotes.length]);

  const resolvedVisibleCount = Math.min(visibleCount, filteredVotes.length);
  const hiddenCount = Math.max(0, filteredVotes.length - resolvedVisibleCount);
  
  const handleVoteClick = (voteId: string | number) => {
    if (onVoteClick) {
      onVoteClick(voteId);
    } else {
      // 기본 라우팅 동작
      router.push(`/vote/${voteId}`);
    }
  };
  
  if (isInitialLoading) {
    return (
      <div className={className}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-56 rounded-xl bg-gray-200/70 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className={className}>
      {/* 투표 목록 */}
      {filteredVotes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVotes.slice(0, resolvedVisibleCount).map((vote, index) => (
              <VoteCard
                key={vote.id}
                vote={vote}
                isHero={index === 0}
                onClick={() => handleVoteClick(vote.id)}
                locale={locale}
              />
            ))}
            {hiddenCount > 0 &&
              Array.from({ length: hiddenCount }).map((_, idx) => (
                <VoteCardSkeleton key={`vote-card-skeleton-${idx}`} />
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