'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { RankingView } from '../common/RankingView';

// 확장된 VoteItem 타입 정의
interface EnhancedVoteItem extends VoteItem {
  artist?: any;
  isAnimating?: boolean;
  voteChange?: number;
}

interface OngoingVoteItemsProps {
  vote: Vote & { voteItem?: EnhancedVoteItem[] };
  onVoteChange?: (
    voteId: string | number,
    itemId: string | number,
    newTotal: number,
  ) => void;
  mode?: 'list' | 'detail'; // 투표 리스트 vs 투표 상세 모드
  onNavigateToDetail?: (voteId?: string | number) => void; // 투표 상세로 이동
}

export const OngoingVoteItems: React.FC<OngoingVoteItemsProps> = ({
  vote,
  onVoteChange,
  mode = 'detail', // 기본값은 detail (기존 동작 유지)
  onNavigateToDetail,
}) => {
  const { t } = useLanguageStore();
  const [voteItems, setVoteItems] = useState<EnhancedVoteItem[]>([]);

  // vote 객체가 변경될 때마다 voteItems 상태 업데이트
  useEffect(() => {
    if (vote.voteItem && vote.voteItem.length > 0) {
      // 투표 항목 데이터를 EnhancedVoteItem 형태로 변환
      const enhancedItems: EnhancedVoteItem[] = vote.voteItem.map((item) => ({
        ...item,
        vote_total: item.vote_total || 0,
        artist: item.artist || null,
      }));

      setVoteItems(enhancedItems);
    } else {
      setVoteItems([]);
    }
  }, [vote.id, vote.voteItem]); // voteItem도 명시적으로 의존성 배열에 추가

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
      console.error('[OngoingVoteItems] 항목 정렬 중 오류:', error);
      return [];
    }
  }, [voteItems]);

  // 투표 변경 핸들러
  const handleVoteChange = useCallback(
    (itemId: string | number, newTotal: number) => {
      // onVoteChange가 없으면 아무것도 하지 않음
      if (!onVoteChange) return;

      // 문자열과 숫자 ID 모두 호환되도록 처리
      const itemIdStr = String(itemId);

      setVoteItems((prevItems) => {
        return prevItems.map((item) => {
          const currentId = String(item.id);
          if (currentId === itemIdStr) {
            // 변경된 항목만 업데이트
            const voteChange = newTotal - (item.vote_total || 0);
            return {
              ...item,
              vote_total: newTotal,
              voteChange: voteChange,
              isAnimating: voteChange !== 0,
            };
          }
          return item;
        });
      });

      // 상위 컴포넌트 콜백 호출
      const numericId = Number(vote.id);
      if (!isNaN(numericId)) {
        onVoteChange(numericId, itemId, newTotal);
      }
    },
    [vote.id, onVoteChange],
  );

  // 표시할 투표 항목이 없는 경우 메시지 표시
  if (voteItems.length === 0) {
    return (
      <div className='w-full'>
        <div className='py-6 bg-gray-50 rounded text-center'>
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
        <div className='py-6 bg-gray-50 rounded text-center'>
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
          showVoteChange={true}
          onVoteChange={onVoteChange ? handleVoteChange : undefined}
          keyPrefix='ongoing'
          mode={mode}
          onNavigateToDetail={onNavigateToDetail ? () => onNavigateToDetail(vote.id) : undefined}
        />
      </div>
    </div>
  );
};
