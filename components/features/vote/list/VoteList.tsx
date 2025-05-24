'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Vote } from '@/types/interfaces';
import {
  useVoteFilterStore,
  VoteStatus,
  VoteArea,
} from '@/stores/voteFilterStore';
import { useVoteList } from '@/hooks/useVoteList';
import VoteFilterSectionWrapper from './VoteFilterSectionWrapper';
import VoteListSection from './VoteListSection';
import VotePagination from './VotePagination';

interface VoteListProps {
  status?: string;
  initialVotes?: Vote[];
}

const VoteList: React.FC<VoteListProps> = ({ status, initialVotes = [] }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);
  
  const { selectedStatus, selectedArea, setSelectedStatus, setSelectedArea } = useVoteFilterStore();

  // status prop이 제공되면 그 값을 사용하고, 없으면 store의 값을 사용
  const effectiveStatus = status || selectedStatus;

  // 단순화된 훅 사용
  const { votes, isLoading, error, refetch } = useVoteList({
    status: effectiveStatus as VoteStatus,
    area: selectedArea,
    initialVotes,
  });

  // URL 파라미터 변경 감지 및 스토어 상태 동기화
  useEffect(() => {
    const urlStatus = searchParams.get('status') as VoteStatus;
    const urlArea = searchParams.get('area') as VoteArea;
    
    if (urlStatus && urlStatus !== selectedStatus) {
      setSelectedStatus(urlStatus);
    }
    
    if (urlArea && urlArea !== selectedArea) {
      setSelectedArea(urlArea);
    }
  }, [searchParams, selectedStatus, selectedArea, setSelectedStatus, setSelectedArea]);

  // 필터 변경 시 페이지 리셋 및 데이터 새로고침
  useEffect(() => {
    setPage(1);
    if (initialVotes.length === 0) {
      refetch();
    }
  }, [effectiveStatus, selectedArea, refetch, initialVotes.length]);

  // 페이지네이션된 투표 목록
  const paginatedVotes = useMemo(() => {
    const end = page * PAGE_SIZE;
    return votes.slice(0, end);
  }, [votes, page, PAGE_SIZE]);

  // 더 보기 가능 여부
  const hasMore = useMemo(() => {
    return paginatedVotes.length < votes.length;
  }, [paginatedVotes.length, votes.length]);

  const handleVoteClick = useCallback(
    (voteId: string) => {
      router.push(`/vote/${voteId}`);
    },
    [router],
  );

  const handleLoadMore = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  // 에러 처리
  if (error) {
    console.error('투표 리스트 로드 오류:', error);
  }

  return (
    <section className='w-full'>
      <VoteFilterSectionWrapper />
      <VoteListSection
        votes={paginatedVotes}
        isLoading={isLoading}
        isTransitioning={false}
        onVoteClick={handleVoteClick}
      />
      <VotePagination
        hasMore={hasMore}
        isLoading={isLoading}
        isTransitioning={false}
        onLoadMore={handleLoadMore}
      />
    </section>
  );
};

export default React.memo(VoteList);
