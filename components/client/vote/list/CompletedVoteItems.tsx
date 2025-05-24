'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { RankingView } from '../common/RankingView';

// 확장된 VoteItem 타입 정의
interface EnhancedVoteItem extends VoteItem {
  artist?: any;
}

interface CompletedVoteItemsProps {
  vote: Vote & {
    voteItem?: Array<VoteItem & { artist?: any }>;
    voteItems?: Array<VoteItem & { artist?: any }>; // 이전 속성 호환성 유지
  };
}

export const CompletedVoteItems: React.FC<CompletedVoteItemsProps> = ({ vote }) => {
  const { t } = useLanguageStore();
  const [voteItems, setVoteItems] = useState<EnhancedVoteItem[]>([]);

  // vote 객체가 변경될 때마다 voteItems 상태 업데이트
  useEffect(() => {
    // voteItem 또는 voteItems 중 사용 가능한 데이터 선택 (voteItem 우선)
    const effectiveItems = vote.voteItem || vote.voteItems || [];

    if (effectiveItems.length > 0) {
      // 투표 항목 데이터를 EnhancedVoteItem 형태로 변환
      const enhancedItems: EnhancedVoteItem[] = effectiveItems.map((item) => ({
        ...item,
        vote_total: item.vote_total || 0,
        artist: item.artist || null,
      }));

      setVoteItems(enhancedItems);
    } else {
      setVoteItems([]);
    }
  }, [vote.id, vote.voteItem, vote.voteItems]);

  // 표시할 상위 항목
  const topItems = useMemo(() => {
    // 항목이 없는 경우 빈 배열 반환
    if (voteItems.length === 0) {
      return [];
    }

    // 정렬을 위해 깊은 복사 후 voteTotal이 null/undefined인 경우 0으로 처리
    try {
      const sortedItems = [...voteItems]
        .map((item) => {
          // artist 객체가 있는 경우 artist_group과 artistGroup 모두 처리
          const artist = item.artist
            ? {
              ...item.artist,
              // 둘 중 하나만 있는 경우 다른 하나로 복사
              artist_group:
                item.artist.artist_group || item.artist.artistGroup,
              artistGroup:
                item.artist.artistGroup || item.artist.artist_group,
            }
            : null;

          return {
            ...item,
            vote_total: item.vote_total ?? 0,
            artist,
          };
        })
        .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0))
        .slice(0, 3);

      return sortedItems;
    } catch (error) {
      console.error('[CompletedVoteItems] 항목 정렬 중 오류:', error);
      return [];
    }
  }, [voteItems]);

  // 표시할 투표 항목이 없는 경우 메시지 표시
  if (voteItems.length === 0) {
    return (
      <div className='w-full'>
        <div className='py-6 bg-gray-50 rounded text-center opacity-60'>
          <p className='text-gray-500'>
            {t('text_vote_no_items') || '투표 항목이 없습니다'}
          </p>
        </div>
      </div>
    );
  }

  // 표시할 상위 항목 계산(topItems)이 비어있는 경우 메시지 표시
  if (topItems.length === 0) {
    return (
      <div className='w-full'>
        <div className='py-6 bg-gray-50 rounded text-center opacity-60'>
          <p className='text-gray-500'>
            {t('text_vote_processing') || '투표 집계 중입니다'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='w-full'>
      <div className='flex flex-col items-center'>
        <RankingView
          items={topItems}
          disabled={true}
          showVoteChange={false}
          keyPrefix="completed"
        />
      </div>
    </div>
  );
};
