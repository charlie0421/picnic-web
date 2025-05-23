'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import VoteRankCard from './VoteRankCard';

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
}

const OngoingVoteItems: React.FC<OngoingVoteItemsProps> = ({
  vote,
  onVoteChange,
}) => {
  const { t } = useLanguageStore();
  const [voteItems, setVoteItems] = useState<EnhancedVoteItem[]>([]);

  // vote 객체가 변경될 때마다 voteItems 상태 업데이트
  useEffect(() => {
    // 디버깅용 데이터 로그
    console.log('[OngoingVoteItems] vote 데이터 처리:', {
      id: vote.id,
      title:
        typeof vote.title === 'object'
          ? JSON.stringify(vote.title)
          : vote.title,
      hasVoteItem: !!vote.voteItem && vote.voteItem.length > 0,
      voteItemCount: vote.voteItem?.length || 0,
    });

    // vote.voteItem 구조 확인을 위한 심층 로깅
    if (vote.voteItem && vote.voteItem.length > 0) {
      const firstItem = vote.voteItem[0];
      console.log('[OngoingVoteItems] 첫번째 항목 상세 정보:', {
        id: firstItem.id,
        voteTotal: firstItem.voteTotal,
        hasArtist: !!firstItem.artist,
        artistStructure: firstItem.artist
          ? {
              id: firstItem.artist.id,
              hasName: !!firstItem.artist.name,
              hasImage: !!firstItem.artist.image,
              hasArtistGroup: !!firstItem.artist.artistGroup,
              hasArtist_Group: !!firstItem.artist.artist_group,
            }
          : null,
      });
    }

    // vote.voteItem 처리 - 깊은 복사로 참조 문제 해결
    if (vote.voteItem && vote.voteItem.length > 0) {
      // 참조 문제 방지를 위해 완전한 깊은 복사 수행
      const deepCopiedItems = vote.voteItem.map((item) => {
        // artist 객체가 있는 경우 속성 보정 및 깊은 복사
        const artist = item.artist
          ? {
              ...JSON.parse(JSON.stringify(item.artist)), // 완전한 깊은 복사
              // 표준화: 속성 이름 일관성 보장
              artist_group:
                (item.artist as any).artist_group || item.artist.artistGroup,
              artistGroup:
                item.artist.artistGroup || (item.artist as any).artist_group,
            }
          : null;

        // 항목 자체도 깊은 복사
        return {
          ...JSON.parse(JSON.stringify(item)), // 완전한 깊은 복사
          voteTotal: item.voteTotal ?? 0,
          artist, // 표준화된 artist 객체 사용
        };
      });

      console.log(
        '[OngoingVoteItems] 투표 항목 깊은 복사 완료:',
        deepCopiedItems.length,
        '개',
      );

      // 불필요한 상태 업데이트 방지 및 로깅
      if (JSON.stringify(deepCopiedItems) !== JSON.stringify(voteItems)) {
        console.log('[OngoingVoteItems] 투표 항목 상태 업데이트 필요');
        setVoteItems(deepCopiedItems);
      } else {
        console.log('[OngoingVoteItems] 투표 항목 변경 없음, 상태 유지');
      }
    } else {
      console.warn(
        '[OngoingVoteItems] 투표 항목 없음, 빈 배열로 초기화, ID: ',
        vote.id,
      );
      setVoteItems([]);
    }
  }, [vote, vote.voteItem]); // voteItem도 명시적으로 의존성 배열에 추가

  // 표시할 상위 항목
  const topItems = useMemo(() => {
    // 항목이 없는 경우 빈 배열 반환
    if (voteItems.length === 0) {
      console.warn('[OngoingVoteItems] 정렬할 항목이 없음');
      return [];
    }

    console.log('[OngoingVoteItems] 정렬 전 항목 수:', voteItems.length);

    // 첫 번째 항목의 artist 구조 로깅
    if (voteItems[0]?.artist) {
      console.log('[OngoingVoteItems] 첫 번째 항목 artist 구조:', {
        hasArtist: !!voteItems[0].artist,
        hasArtistGroup: !!voteItems[0].artist.artistGroup,
        hasArtist_Group: !!voteItems[0].artist.artist_group,
        name: voteItems[0].artist.name?.ko || 'unknown',
      });
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
            voteTotal: item.voteTotal ?? 0,
            artist,
          };
        })
        .sort((a, b) => (b.voteTotal || 0) - (a.voteTotal || 0))
        .slice(0, 3);

      console.log(
        '[OngoingVoteItems] 정렬 후 상위 항목 수:',
        sortedItems.length,
        '상위 항목 정보:',
        sortedItems.map((item) => ({
          id: item.id,
          artistName: item.artist?.name?.ko || 'unknown',
          voteTotal: item.voteTotal,
          hasArtistGroup:
            !!item.artist?.artist_group || !!item.artist?.artistGroup,
        })),
      );

      return sortedItems;
    } catch (error) {
      console.error('[OngoingVoteItems] 항목 정렬 중 오류:', error);
      return [];
    }
  }, [voteItems]);

  // 투표 변경 핸들러
  const handleVoteChange = useCallback(
    (itemId: string | number, newTotal: number) => {
      // 문자열과 숫자 ID 모두 호환되도록 처리
      const itemIdStr = String(itemId);

      setVoteItems((prevItems) => {
        return prevItems.map((item) => {
          const currentId = String(item.id);
          if (currentId === itemIdStr) {
            // 변경된 항목만 업데이트
            const voteChange = newTotal - (item.voteTotal || 0);
            return {
              ...item,
              voteTotal: newTotal,
              voteChange: voteChange,
              isAnimating: voteChange !== 0,
            };
          }
          return item;
        });
      });

      // 상위 컴포넌트 콜백 호출 (있는 경우)
      if (onVoteChange) {
        const numericId = Number(vote.id);
        if (!isNaN(numericId)) {
          onVoteChange(numericId, itemId, newTotal);
        }
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
          {process.env.NODE_ENV === 'development' && (
            <p className='text-xs text-gray-400 mt-1'>
              (개발자 정보: 투표 ID {vote.id}, 항목 수: {voteItems.length})
            </p>
          )}
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
          {process.env.NODE_ENV === 'development' && (
            <p className='text-xs text-gray-400 mt-1'>
              (개발자 정보: 항목은 있으나 정렬 실패, 항목 수: {voteItems.length}
              )
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='w-full'>
      <div className='flex flex-col items-center'>
        {/* 디버그 정보 */}
        {process.env.NODE_ENV === 'development' && (
          <div className='text-xs text-gray-500 mb-1 bg-gray-100 p-1 rounded w-full'>
            <p>
              ID: {vote.id}, Top1: {topItems[0]?.artist?.name?.ko || 'unknown'},
              투표수: {topItems[0]?.voteTotal || 0}
            </p>
          </div>
        )}

        {/* 투표 순위 카드 */}
        <div className='flex justify-center items-end space-x-4 w-full'>
          {topItems.map((item, index) => (
            <VoteRankCard
              key={`vote-rank-${item.id}-${index}`}
              item={item}
              rank={index + 1}
              showVoteChange={true}
              isAnimating={item.isAnimating}
              voteChange={item.voteChange}
              voteTotal={item.voteTotal ?? 0}
              onVoteChange={(newTotal) => handleVoteChange(item.id, newTotal)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default OngoingVoteItems;
