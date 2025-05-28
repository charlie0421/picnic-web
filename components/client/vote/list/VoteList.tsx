'use client';

import React, { useState, useEffect } from 'react';
import { Vote } from '@/types/interfaces';
import { VoteCard } from './VoteCard';
import VoteLoadingSkeleton from './VoteLoadingSkeleton';
import { useVoteStore } from '@/stores/voteStore';

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
  emptyMessage = '표시할 투표가 없습니다.',
  useStore = false
}: VoteListProps) {
  // Zustand 스토어 상태
  const { currentVote } = useVoteStore();

  // 스토어 사용 여부에 따라 상태 결정
  const votes = useStore && currentVote.vote ? [currentVote.vote] : propVotes;
  const isLoading = useStore ? currentVote.isLoading : propIsLoading;
  const error = useStore ? currentVote.error : propError;

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
          <p className="text-gray-500 text-lg">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 투표 목록 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {votes.map((vote) => (
          <VoteCard
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
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>로딩 중...</span>
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

export default VoteList; 