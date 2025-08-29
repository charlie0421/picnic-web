'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import Image from 'next/image';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import VoteLoadingSkeleton from './VoteLoadingSkeleton';
import { useVoteStore } from '@/stores/voteStore';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

export interface VoteListProps {
  votes?: Vote[];
  isLoading?: boolean;
  error?: string | null;
  onVoteClick?: (voteId: string | number) => void;
  className?: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadMoreText?: string;
  emptyMessage?: string;
  // 스토어 사용 여부 (기본값: false - 기존 동작 유지)
  useStore?: boolean;
}

export function VoteList({
  votes: propVotes = [],
  isLoading: propIsLoading = false,
  error: propError = null,
  onVoteClick,
  className = '',
  hasMore = false,
  onLoadMore,
  loadMoreText = '더보기',
  emptyMessage,
  useStore = false
}: VoteListProps) {
  const { t } = useLocaleRouter();
  
  // Zustand 스토어 상태
  const { currentVote } = useVoteStore();

  // 스토어 사용 여부에 따라 상태 결정
  const votes = useStore && currentVote.vote ? [currentVote.vote] : propVotes;
  const isLoading = useStore ? currentVote.isLoading : propIsLoading;
  const error = useStore ? currentVote.error : propError;

  // emptyMessage가 제공되지 않으면 번역된 기본값 사용
  const finalEmptyMessage = emptyMessage || t('text_vote_no_items');

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 상태 전환(예정→진행, 진행→마감) 시점에 페이지 자동 새로고침
  const reloadTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // votes 기준으로 가장 가까운 다음 전환 시각 계산
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

    // 기존 타이머 정리
    if (reloadTimerRef.current) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }

    // 다음 전환 시각이 있으면 해당 시각에 새로고침 예약
    if (nextTimestamp !== null) {
      const delay = Math.max(0, nextTimestamp - Date.now());
      reloadTimerRef.current = window.setTimeout(() => {
        window.location.reload();
      }, delay);
    }

    return () => {
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [votes]);

  // 로딩 상태 처리
  if (isLoading && votes.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <VoteLoadingSkeleton />
        <VoteLoadingSkeleton />
        <VoteLoadingSkeleton />
      </div>
    );
  }

  // 에러 상태 처리
  if (error) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="mb-4">
          <svg
            className="w-16 h-16 text-red-300 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
            />
          </svg>
        </div>
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // 빈 상태 처리
  if (votes.length === 0) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4">
            <svg
              className="w-16 h-16 text-gray-300 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">{finalEmptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 투표 목록 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {votes.map((vote) => (
          <VotePodiumCard
            key={vote.id}
            vote={vote}
            onClick={() => onVoteClick?.(vote.id)}
          />
        ))}
      </div>

      {/* 더보기 버튼 */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              loadMoreText
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// 포디움 전용 카드 (상위 3개 랭킹 간단 표시)
function VotePodiumCard({
  vote,
  onClick,
}: {
  vote: Vote;
  onClick?: () => void;
}) {
  const { currentLocale, t, push } = useLocaleRouter();

  const topItems = useMemo(() => {
    const items = (((vote as any).vote_item as Array<VoteItem & { artist?: any }>) || ((vote as any).voteItem as Array<VoteItem & { artist?: any }>)) || [];
    return [...items]
      .map((it) => ({
        ...it,
        vote_total: it.vote_total ?? 0,
        artist: it.artist || null,
      }))
      .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
      .slice(0, 3);
  }, [vote]);

  const handleClick = () => {
    if (onClick) return onClick();
    push(`/vote/${vote.id}`);
  };

  return (
    <div
      className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 hover:shadow-xl transition-all duration-300 h-full flex flex-col"
      role="button"
      onClick={handleClick}
    >
      {/* 헤더: 투표 제목 */}
      <div className="p-4">
        <h3 className="font-extrabold text-lg text-gray-900 truncate">
          {getLocalizedString(vote.title, currentLocale)}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{t('label_tabbar_vote_active')}</p>
      </div>

      {/* 포디움 영역 */}
      <div className="px-4 pb-4 flex-1">
        {topItems.length === 0 ? (
          <div className="py-8 bg-gray-50 rounded-lg text-center text-gray-500">
            {t('text_vote_processing')}
          </div>
        ) : (
          <div className="flex items-end justify-center gap-3">
            {/* 2위 */}
            <PodiumItem item={topItems[1]} rank={2} locale={currentLocale} t={t} className="translate-y-2" />
            {/* 1위 */}
            <PodiumItem item={topItems[0]} rank={1} locale={currentLocale} t={t} highlight />
            {/* 3위 */}
            <PodiumItem item={topItems[2]} rank={3} locale={currentLocale} t={t} className="translate-y-3" />
          </div>
        )}
      </div>
    </div>
  );
}

function PodiumItem({
  item,
  rank,
  locale,
  t,
  className = '',
  highlight = false,
}: {
  item?: VoteItem & { artist?: any; vote_total?: number | null };
  rank: 1 | 2 | 3;
  locale: string;
  t: (key: string, args?: Record<string, string>) => string;
  className?: string;
  highlight?: boolean;
}) {
  if (!item) {
    return <div className="w-24 sm:w-28" />;
  }

  const artistName = item.artist?.name
    ? getLocalizedString(item.artist.name, locale) || t('artist_name_fallback')
    : t('artist_name_fallback');
  const groupName = item.artist?.artistGroup?.name
    ? getLocalizedString(item.artist.artistGroup.name, locale)
    : (item.artist?.artist_group?.name
      ? getLocalizedString(item.artist.artist_group.name, locale)
      : '');
  const imageUrl = item.artist?.image ? getCdnImageUrl(item.artist.image) : '/images/default-artist.png';
  const total = item.vote_total ?? 0;
  const formattedTotal = (total || 0).toLocaleString('ko-KR');

  const size = rank === 1 ? 112 : rank === 2 ? 84 : 72;

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      style={{ width: size + 20 }}
    >
      <div
        className={`rounded-full border ${
          highlight ? 'border-yellow-400 shadow-[0_8px_25px_-8px_rgba(250,204,21,0.7)]' : 'border-gray-200 shadow'
        } overflow-hidden`}
        style={{ width: size, height: size }}
      >
        <Image
          src={imageUrl}
          alt={artistName}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="mt-2 max-w-[120px] text-center">
        <div className={`text-[10px] font-bold ${rank === 1 ? 'text-yellow-600' : rank === 2 ? 'text-gray-600' : 'text-amber-600'}`}>#{rank}</div>
        <div className="text-xs font-semibold text-gray-900 truncate">{artistName}</div>
        {groupName && (
          <div className="text-[10px] text-gray-600 truncate">{groupName}</div>
        )}
        <div className="text-[11px] text-blue-600 font-bold">{formattedTotal}</div>
      </div>
    </div>
  );
}

export default VoteList; 