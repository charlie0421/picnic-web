'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import Image from 'next/image';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';

// 확장된 VoteItem 타입 정의
interface EnhancedVoteItem extends VoteItem {
  artist?: any;
}

interface CompletedVoteItemsProps {
  vote: Vote & {
    voteItem?: Array<VoteItem & { artist?: any }>;
    voteItems?: Array<VoteItem & { artist?: any }>; // 이전 속성 호환성 유지
  };
  mode?: 'list' | 'detail';
}

export const CompletedVoteItems: React.FC<CompletedVoteItemsProps> = ({ vote, mode = 'detail' }) => {
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

  // 완료 리스트는 실시간/상대시간 배지를 표시하지 않음 (요청사항)

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
        .sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0));

      if (sortedItems.length === 2) {
        return sortedItems; // [1위, 2위]
      }

      return sortedItems.slice(0, 3);

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

  if (mode === 'list') {
    return (
      <div className='w-full'>
        <div className='flex flex-col items-center'>
          {topItems.length === 2 ? (
            <div className='flex justify-center items-end gap-2 sm:gap-3 px-4 sm:px-6 mx-auto opacity-70'>
              {renderPodiumItem(topItems[0], 1, t, true)}
              {renderPodiumItem(topItems[1], 2, t)}
            </div>
          ) : (
            <div className='flex justify-center items-end w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg gap-2 sm:gap-3 px-4 sm:px-6 mx-auto opacity-70'>
              {renderPodiumItem(topItems[1], 2, t)}
              {renderPodiumItem(topItems[0], 1, t, true)}
              {renderPodiumItem(topItems[2], 3, t)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='w-full'>
      <div className='flex flex-col items-center'>
        {topItems.length === 2 ? (
          <div className='flex justify-center items-end gap-2 sm:gap-3 px-4 sm:px-6 mx-auto opacity-70'>
            {renderPodiumItem(topItems[0], 1, t, true)}
            {renderPodiumItem(topItems[1], 2, t)}
          </div>
        ) : (
          <div className='flex justify-center items-end w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg gap-2 sm:gap-3 px-4 sm:px-6 mx-auto opacity-70'>
            {renderPodiumItem(topItems[1], 2, t)}
            {renderPodiumItem(topItems[0], 1, t, true)}
            {renderPodiumItem(topItems[2], 3, t)}
          </div>
        )}
      </div>
    </div>
  );
};

function renderPodiumItem(
  item: EnhancedVoteItem | undefined,
  rank: 1 | 2 | 3,
  t: (key: string, args?: Record<string, string>) => string,
  highlight: boolean = false,
) {
  if (!item) return <div className='w-20 sm:w-24' />;

  const { currentLanguage } = useLanguageStore.getState();
  const artistName = item.artist
    ? getLocalizedString(item.artist.name, currentLanguage) || t('artist_name_fallback')
    : t('artist_name_fallback');
  const groupName = item.artist?.artistGroup?.name
    ? getLocalizedString(item.artist.artistGroup.name, currentLanguage)
    : (item.artist?.artist_group?.name
      ? getLocalizedString(item.artist.artist_group.name, currentLanguage)
      : '');
  const imageUrl = item.artist?.image ? getCdnImageUrl(item.artist.image) : '/images/default-artist.png';
  const total = item.vote_total ?? 0;
  const formattedTotal = (total || 0).toLocaleString('ko-KR');
  const size = rank === 1 ? 112 : rank === 2 ? 84 : 72;

  return (
    <div className='flex flex-col items-center' style={{ width: size + 28 }}>
      <div
        className={`rounded-full border ${highlight ? 'border-yellow-400 shadow-[0_8px_25px_-8px_rgba(250,204,21,0.7)]' : 'border-gray-200 shadow'} overflow-hidden`}
        style={{ width: size, height: size }}
      >
        <Image src={imageUrl} alt={artistName} width={size} height={size} className='w-full h-full object-cover' />
      </div>
      <div className='mt-2 text-center overflow-hidden' style={{ width: size }}>
        <div className={`text-[10px] font-bold ${rank === 1 ? 'text-yellow-600' : rank === 2 ? 'text-gray-600' : 'text-amber-600'}`}>#{rank}</div>
        <div className='text-xs font-semibold text-gray-900 truncate whitespace-nowrap'>{artistName}</div>
        <div style={{ minHeight: 16 }}>
          {groupName ? (
            <div className='text-[10px] text-gray-600 truncate whitespace-nowrap'>{groupName}</div>
          ) : (
            <div className='invisible text-[10px] text-gray-600 truncate whitespace-nowrap'>-</div>
          )}
        </div>
        <div className='text-[11px] text-blue-600 font-bold'>{formattedTotal}</div>
      </div>
    </div>
  );
}

// 완료 리스트는 상대시간/자동갱신 배지를 표시하지 않음
