'use client';

import React, { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Vote } from '@/types/interfaces';
import { VoteListPresenter } from './VoteListPresenter';
import { VOTE_AREAS, VOTE_STATUS, VoteArea, VoteStatus } from '@/stores/voteFilterStore';
import { useSearchParams } from 'next/navigation';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface VoteListCSRProps {
  initialVotes: Vote[];
}

export function VoteListCSR({ initialVotes }: VoteListCSRProps) {
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get('status') as VoteStatus) || VOTE_STATUS.ONGOING;
  const areaParam = (searchParams.get('area') as VoteArea) || VOTE_AREAS.ALL;

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Vote[]>(initialVotes || []);

  const limit = 12;
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('status', statusParam);
    params.set('area', areaParam);
    params.set('page', String(page));
    params.set('limit', String(limit));
    return `/api/votes?${params.toString()}`;
  }, [statusParam, areaParam, page]);

  const { data, isLoading, mutate } = useSWR(query, fetcher, {
    fallbackData: page === 1 ? { data: initialVotes, count: initialVotes.length, totalPages: 1, hasMore: initialVotes.length >= limit } : undefined,
    revalidateOnFocus: false,
  });

  const hasMore = Boolean(data?.hasMore);

  const onLoadMore = useCallback(async () => {
    const nextPage = page + 1;
    const params = new URLSearchParams();
    params.set('status', statusParam);
    params.set('area', areaParam);
    params.set('page', String(nextPage));
    params.set('limit', String(limit));
    const url = `/api/votes?${params.toString()}`;
    const res = await fetch(url);
    const json = await res.json();
    if (Array.isArray(json?.data)) {
      setItems(prev => [...prev, ...json.data]);
      setPage(nextPage);
    }
  }, [page, statusParam, areaParam]);

  // 필터(status/area)가 바뀌면 첫 페이지부터 다시 시작해야 함 (SWR key가 바뀌므로 items를 초기화)
  React.useEffect(() => {
    setPage(1);
    setItems(initialVotes || []);
    mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusParam, areaParam]);

  return (
    <VoteListPresenter 
      votes={items}
      hasMore={hasMore}
      isLoading={isLoading}
      onLoadMore={onLoadMore}
    />
  );
}


