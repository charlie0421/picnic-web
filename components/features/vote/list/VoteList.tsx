'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '@/components/providers/SupabaseProvider';
import { Vote } from '@/types/interfaces';
import {
  useVoteFilterStore,
  VOTE_STATUS,
  VOTE_AREAS,
  VoteStatus,
  VoteArea,
} from '@/stores/voteFilterStore';
import VoteFilterSectionWrapper from './VoteFilterSectionWrapper';
import VoteListSection from './VoteListSection';
import VotePagination from './VotePagination';

interface VoteListProps {
  status?: string;
  initialVotes?: Vote[];
}

const VoteList: React.FC<VoteListProps> = ({ status, initialVotes = [] }) => {
  const { supabase } = useSupabase();
  const { currentLanguage } = useLanguageStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const { selectedStatus, selectedArea } = useVoteFilterStore();
  const [votes, setVotes] = useState<Vote[]>(initialVotes);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const initialDataLoaded = useRef(initialVotes.length > 0);
  // 이전 필터 값 저장용 ref - 타입 에러 방지를 위해 타입 캐스팅 사용
  const prevStatusRef = useRef(selectedStatus as unknown as string);
  const prevAreaRef = useRef(selectedArea as unknown as string);

  // status prop이 제공되면 그 값을 사용하고, 없으면 store의 값을 사용
  const effectiveStatus = status || selectedStatus;

  // 클라이언트 마운트 상태 추적
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchVotes = useCallback(
    async (isRefresh = false) => {
      if (isTransitioning && !isRefresh) return;

      console.log('[VoteList] fetchVotes 시작:', { 
        effectiveStatus, 
        selectedArea, 
        isRefresh,
        isTransitioning 
      });

      try {
        setIsLoading(true);

        const now = new Date().toISOString();
        let query = supabase
          .from('vote')
          .select(
            `
          *,
          vote_item!vote_id (
            id,
            vote_id,
            artist_id,
            group_id,
            vote_total,
            created_at,
            updated_at,
            deleted_at,
            artist (
              id,
              name,
              image,
              artist_group (
                id,
                name
              )
            )
          ),
          vote_reward (
            reward_id,
            reward:reward_id (*)
          )
        `,
          )
          .is('deleted_at', null);

        // 상태별 필터링
        switch (effectiveStatus) {
          case VOTE_STATUS.UPCOMING:
            query = query.gt('start_at', now);
            break;
          case VOTE_STATUS.ONGOING:
            query = query.lte('start_at', now).gte('stop_at', now);
            break;
          case VOTE_STATUS.COMPLETED:
            query = query.lt('stop_at', now);
            break;
        }

        // 영역별 필터링
        query = query.eq('area', selectedArea);

        // 정렬
        query = query.order('start_at', { ascending: false });

        const { data: voteData, error: voteError } = await query;

        console.log('[VoteList] 쿼리 결과:', { 
          dataLength: voteData?.length, 
          error: voteError 
        });

        if (voteError) {
          console.error('Vote fetch error:', voteError);
          throw voteError;
        }

        if (!voteData || voteData.length === 0) {
          console.log('[VoteList] 데이터 없음');
          setVotes([]);
          setHasMore(false);
          return;
        }

        const formattedVotes = voteData.map((vote: any) => ({
          ...vote,
          deletedAt: vote.deleted_at,
          startAt: vote.start_at,
          stopAt: vote.stop_at,
          createdAt: vote.created_at,
          updatedAt: vote.updated_at,
          mainImage: vote.main_image,
          resultImage: vote.result_image,
          waitImage: vote.wait_image,
          voteCategory: vote.vote_category,
          voteContent: vote.vote_content,
          voteSubCategory: vote.vote_sub_category,
          visibleAt: vote.visible_at,
          area: vote.area,
          voteItems: vote.vote_item
            ? vote.vote_item.map((item: any) => ({
                ...item,
                deletedAt: item.deleted_at,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                voteId: item.vote_id,
                artistId: item.artist_id,
                groupId: item.group_id,
                voteTotal: item.vote_total || 0,
                artist: item.artist
                  ? {
                      ...item.artist,
                      image: item.artist.image,
                    }
                  : null,
              }))
            : [],
          reward: vote.vote_reward
            ? vote.vote_reward.map((vr: any) => vr.reward).filter(Boolean)
            : [],
          title: vote.title || '제목 없음',
        }));

        console.log('[VoteList] 데이터 설정 완료:', formattedVotes.length);
        setVotes(formattedVotes);
        setHasMore(formattedVotes.length >= PAGE_SIZE);
        setError(null);
      } catch (err) {
        console.error('투표 데이터 로드 오류:', err);
        setError(err as Error);
        setVotes([]);
        setHasMore(false);
      } finally {
        setIsLoading(false);
        setIsTransitioning(false);
        console.log('[VoteList] fetchVotes 완료');
      }
    },
    [supabase, effectiveStatus, selectedArea, PAGE_SIZE, isTransitioning],
  );

  // 초기 로드
  useEffect(() => {
    console.log('[VoteList] 초기 로드 useEffect:', { 
      initialVotesLength: initialVotes.length,
      initialDataLoaded: initialDataLoaded.current,
      isLoading,
      isMounted
    });
    
    if (initialVotes.length > 0) {
      // 초기 데이터가 있는 경우 - 서버에서 제공된 데이터 사용
      console.log('[VoteList] 초기 데이터 설정');
      setVotes(initialVotes);
      initialDataLoaded.current = true;
    } else if (isMounted && !initialDataLoaded.current) {
      // 클라이언트가 마운트되고, 초기 데이터가 없는 경우에만 데이터 패칭
      console.log('[VoteList] 클라이언트에서 데이터 패칭 시작');
      setIsLoading(true);
      fetchVotes(true);
      initialDataLoaded.current = true;
    }
  }, [initialVotes, isMounted]);

  // URL 파라미터와 필터 상태 변경 감지
  useEffect(() => {
    const urlStatus =
      (searchParams.get('status') as typeof selectedStatus) ||
      VOTE_STATUS.ONGOING;
    const area =
      (searchParams.get('area') as typeof selectedArea) || VOTE_AREAS.KPOP;

    // 실제로 필터 값이 변경되었는지 확인
    const isFilterChanged =
      effectiveStatus !== prevStatusRef.current ||
      selectedArea !== prevAreaRef.current;

    // 필터가 실제로 변경되었고, 초기 데이터가 처리된 후, 로딩 중이 아닐 때만 실행
    if (
      isFilterChanged &&
      initialDataLoaded.current &&
      !isLoading &&
      !isTransitioning
    ) {
      // 현재 필터 값 저장
      prevStatusRef.current = effectiveStatus;
      prevAreaRef.current = selectedArea;

      // 데이터 업데이트
      const updateData = async () => {
        try {
          setIsTransitioning(true);
          setPage(1);
          await fetchVotes(true);
        } catch (error) {
          console.error('데이터 업데이트 중 오류 발생:', error);
        } finally {
          setIsTransitioning(false);
        }
      };

      updateData();
    }
  }, [
    searchParams,
    effectiveStatus,
    selectedArea,
    isLoading,
    isTransitioning,
  ]);

  // 표시할 투표 목록 계산
  const paginatedVotes = useMemo(() => {
    if (!votes) return [];

    const start = 0;
    const end = page * PAGE_SIZE;
    const paginatedData = votes.slice(start, end);
    setHasMore(end < votes.length);

    return paginatedData;
  }, [votes, page, PAGE_SIZE]);

  const handleVoteClick = useCallback(
    (voteId: string) => {
      router.push(`/vote/${voteId}`);
    },
    [router],
  );

  const handleLoadMore = useCallback(() => {
    setPage((prev) => prev + 1);
  }, []);

  return (
    <section className='w-full'>
      {/* 기존 리스트 UI */}
      <VoteFilterSectionWrapper />
      <VoteListSection
        votes={paginatedVotes}
        isLoading={isLoading}
        isTransitioning={isTransitioning}
        onVoteClick={handleVoteClick}
      />
      <VotePagination
        hasMore={hasMore}
        isLoading={isLoading}
        isTransitioning={isTransitioning}
        onLoadMore={handleLoadMore}
      />
    </section>
  );
};

export default React.memo(VoteList);
