'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Vote } from '@/types/interfaces';
import { VoteListPresenter } from './VoteListPresenter';
import { VOTE_AREAS, VOTE_STATUS, VoteArea, VoteStatus } from '@/stores/voteFilterStore';
import { useSearchParams } from 'next/navigation';

interface VoteListCSRProps {
  initialVotes: Vote[];
}

const PAGE_SIZE = 12;

export function VoteListCSR({ initialVotes }: VoteListCSRProps) {
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get('status') as VoteStatus) || VOTE_STATUS.ONGOING;
  const areaParam = (searchParams.get('area') as VoteArea) || VOTE_AREAS.ALL;

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Vote[]>(initialVotes || []);
  const [hasMore, setHasMore] = useState(() => (initialVotes?.length ?? 0) >= PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const firstRenderRef = useRef(true);
  const latestKeyRef = useRef(`${statusParam}__${areaParam}`);

  const fetchVotes = useCallback(
    async (targetPage: number) => {
      const params = new URLSearchParams();
      params.set('status', statusParam);
      params.set('area', areaParam);
      params.set('page', String(targetPage));
      params.set('limit', String(PAGE_SIZE));
      const url = `/api/votes?${params.toString()}`;

      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch votes: ${response.status}`);
      }
      const json = await response.json();
      const data: Vote[] = Array.isArray(json?.data) ? json.data : [];
      const nextHasMore =
        typeof json?.hasMore === 'boolean' ? json.hasMore : data.length >= PAGE_SIZE;

      return { data, hasMore: nextHasMore };
    },
    [areaParam, statusParam],
  );

  useEffect(() => {
    const key = `${statusParam}__${areaParam}`;
    latestKeyRef.current = key;

    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    setIsHydrating(true);
  }, [statusParam, areaParam]);

  useEffect(() => {
    setItems(initialVotes || []);
    setPage(1);
    setHasMore((initialVotes?.length ?? 0) >= PAGE_SIZE);
    setIsHydrating(false);
  }, [initialVotes]);

  const onLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    const currentKey = latestKeyRef.current;
    const nextPage = page + 1;

    try {
      setIsLoadingMore(true);
      const { data: nextItems, hasMore: nextHasMore } = await fetchVotes(nextPage);
      if (latestKeyRef.current !== currentKey) {
        return;
      }
      setItems((prev) => [...prev, ...nextItems]);
      setPage(nextPage);
      setHasMore(nextHasMore);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(error);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchVotes, hasMore, isLoadingMore, page]);

  const handleLoadMore = useCallback(() => {
    void onLoadMore();
  }, [onLoadMore]);

  return (
    <VoteListPresenter
      votes={items}
      hasMore={hasMore}
      isLoading={isLoadingMore}
      isInitialLoading={isHydrating}
      onLoadMore={handleLoadMore}
    />
  );
}


