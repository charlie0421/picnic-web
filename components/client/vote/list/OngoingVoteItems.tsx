'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import Image from 'next/image';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { formatRelativeTime } from '@/utils/date';

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
  const { t, currentLanguage } = useLanguageStore();
  const [voteItems, setVoteItems] = useState<EnhancedVoteItem[]>([]);
  const [tick, setTick] = useState(0); // 상대 시간 갱신용 타이머

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

  // 1분 간격으로 상대 시간 갱신
  useEffect(() => {
    const interval = setInterval(() => setTick((prev) => prev + 1), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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

      // 2명만 있는 경우: 항상 1위, 2위 순으로 가운데 정렬되도록 반환
      if (sortedItems.length === 2) {
        return sortedItems; // 이미 내림차순 정렬됨 → [1위, 2위]
      }

      return sortedItems.slice(0, 3);

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

  // 리스트 모드에서는 인라인 포디움 UI 렌더링 (RankingView 제거)
  if (mode === 'list') {
    const lastUpdatedIso = computeLastUpdatedIso(voteItems, vote.updated_at);
    const relativeUpdated = lastUpdatedIso
      ? formatRelativeTime(lastUpdatedIso, currentLanguage as any, { useAbsolute: true, absoluteThreshold: 3, showTime: true })
      : null;
    return (
      <div className='w-full'>
        <div className='flex flex-col items-center'>
          <div className='w-full rounded-3xl ring-1 ring-primary-300 bg-gradient-to-b from-primary-50 to-primary-100/60 shadow-lg p-2 sm:p-3 md:p-4 overflow-hidden'>
            {topItems.length === 2 ? (
              <div
                className='flex justify-center items-end gap-1 sm:gap-2'
                onClick={() => onNavigateToDetail?.(vote.id)}
              >
                {renderPodiumItem(topItems[0], 1, t, true)}
                {renderPodiumItem(topItems[1], 2, t)}
              </div>
            ) : (
              <div
                className='flex justify-center items-end gap-1 sm:gap-2'
                onClick={() => onNavigateToDetail?.(vote.id)}
              >
                {renderPodiumItem(topItems[1], 2, t)}
                {renderPodiumItem(topItems[0], 1, t, true)}
                {renderPodiumItem(topItems[2], 3, t)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 상세 모드에서는 기존 인터랙션 유지가 필요하다면 RankingView로 유지 가능 (필요 시 추후 개선)
  return (
    <div className='w-full'>
      <div className='flex flex-col items-center'>
        <div className='w-full px-2 sm:px-3'>
          <div className='w-full rounded-3xl ring-1 ring-secondary-300 bg-gradient-to-b from-secondary-50 to-secondary-100/60 shadow-lg p-3 sm:p-4 md:p-5 overflow-hidden'>
            {topItems.length === 2 ? (
              <div className='flex justify-center items-end gap-2 sm:gap-3'>
                {renderPodiumItem(topItems[0], 1, t, true)}
                {renderPodiumItem(topItems[1], 2, t)}
              </div>
            ) : (
              <div className='flex justify-center items-end gap-2 sm:gap-3'>
                {renderPodiumItem(topItems[1], 2, t)}
                {renderPodiumItem(topItems[0], 1, t, true)}
                {renderPodiumItem(topItems[2], 3, t)}
              </div>
            )}
          </div>
        </div>
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
        className={`rounded-full border ${highlight ? 'border-yellow-400 shadow-[0_8px_25px_-8px_rgba(250,204,21,0.7)]' : 'border-white shadow'} overflow-hidden`}
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

// 리스트용 업데이트 시각 계산기: 항목들의 updated_at과 상위 vote.updated_at 중 가장 최근 값을 반환
function computeLastUpdatedIso(
  items: EnhancedVoteItem[],
  voteUpdatedAt?: string | null,
): string | null {
  const times: number[] = [];

  if (voteUpdatedAt) {
    const t = Date.parse(voteUpdatedAt);
    if (!Number.isNaN(t)) times.push(t);
  }

  for (const it of items) {
    const ts = it?.updated_at ? Date.parse(it.updated_at as string) : NaN;
    if (!Number.isNaN(ts)) times.push(ts);
  }

  if (times.length === 0) return null;
  const max = Math.max(...times);
  return new Date(max).toISOString();
}
