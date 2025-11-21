'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import NavigationLink from '@/components/client/NavigationLink';
import { Vote } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { formatVotePeriodWithTimeZone, formatRelativeTime } from '@/utils/date';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

const VOTE_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
} as const;

type VoteStatus = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];

const STATUS_TAG_COLORS: Record<VoteStatus, string> = {
  // 예정: secondary 토큰
  [VOTE_STATUS.UPCOMING]: 'bg-secondary-100 text-secondary-700 border border-secondary-200',
  // 진행중: primary 토큰
  [VOTE_STATUS.ONGOING]: 'bg-primary-100 text-primary-700 border border-primary-200',
  // 종료: sub 토큰
  [VOTE_STATUS.COMPLETED]: 'bg-sub-100 text-sub-700 border border-sub-200',
};

// 카테고리별 색상
const CATEGORY_COLORS = {
  birthday: 'bg-pink-100 text-pink-800 border border-pink-200',
  debut: 'bg-blue-100 text-blue-800 border border-blue-200',
  accumulated: 'bg-purple-100 text-purple-800 border border-purple-200',
  special: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  event: 'bg-orange-100 text-orange-800 border border-orange-200',
} as const;

// 서브카테고리별 색상
const SUB_CATEGORY_COLORS = {
  male: 'bg-blue-50 text-blue-600 border border-blue-100',
  female: 'bg-pink-50 text-pink-600 border border-pink-100',
  group: 'bg-green-50 text-green-600 border border-green-100',
  all: 'bg-gray-50 text-gray-600 border border-gray-100',
} as const;

const STATUS_LABEL_FALLBACK: Record<VoteStatus, string> = {
  [VOTE_STATUS.UPCOMING]: 'Upcoming',
  [VOTE_STATUS.ONGOING]: 'In Progress',
  [VOTE_STATUS.COMPLETED]: 'Completed',
};

const VoteItemsSkeleton = () => (
  <div className='mt-6 grid grid-cols-3 gap-4 min-h-[96px]' aria-hidden='true'>
    {Array.from({ length: 3 }).map((_, index) => (
      <div
        key={`vote-item-skeleton-${index}`}
        className='flex w-full flex-col items-center rounded-xl bg-gray-100/70 px-3 py-4'
      >
        <div className='h-12 w-12 rounded-full bg-gray-200 animate-pulse' />
        <div className='mt-3 h-3 w-16 rounded-full bg-gray-200 animate-pulse' />
        <div className='mt-1 h-3 w-10 rounded-full bg-gray-200 animate-pulse' />
      </div>
    ))}
  </div>
);

const VoteItems = dynamic(
  () => import('./VoteItems').then((mod) => mod.VoteItems),
  {
    ssr: false,
    loading: () => <VoteItemsSkeleton />,
  },
);

const RewardItemSkeleton = () => (
  <div className='flex items-center gap-3 rounded-xl px-3 py-2 w-full min-h-[56px] border border-gray-100 bg-gray-50/80'>
    <div className='w-12 h-12 rounded-lg bg-gray-200 animate-pulse' />
    <div className='flex-1 space-y-2'>
      <div className='h-3 w-24 rounded-full bg-gray-200 animate-pulse' />
      <div className='h-3 w-16 rounded-full bg-gray-100 animate-pulse' />
    </div>
  </div>
);

const RewardItem = dynamic(
  () => import('@/components/common/RewardItem').then((mod) => mod.default),
  {
    ssr: false,
    loading: () => <RewardItemSkeleton />,
  },
);

const CountdownTimerSkeleton = () => (
  <div className='flex items-center gap-1 justify-center min-h-[32px] text-xs text-gray-400'>
    {Array.from({ length: 4 }).map((_, idx) => (
      <span
        key={`countdown-skeleton-${idx}`}
        className='px-1.5 py-0.5 rounded bg-gray-100 animate-pulse w-8 text-center'
      >
        --
      </span>
    ))}
  </div>
);

const CountdownTimer = dynamic(
  () =>
    import('../common/CountdownTimer').then((mod) => ({
      default: mod.CountdownTimer,
    })),
  {
    ssr: false,
    loading: () => <CountdownTimerSkeleton />,
  },
);

const computeVoteStatus = (
  startAt: string | null | undefined,
  stopAt: string | null | undefined,
  referenceTime: Date,
): VoteStatus => {
  if (!startAt || !stopAt) return VOTE_STATUS.UPCOMING;
  const start = new Date(startAt);
  const end = new Date(stopAt);
  if (referenceTime < start) return VOTE_STATUS.UPCOMING;
  if (referenceTime > end) return VOTE_STATUS.COMPLETED;
  return VOTE_STATUS.ONGOING;
};

const computeTimeLeft = (
  status: VoteStatus,
  stopAt: string | null | undefined,
  referenceTime: Date,
): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null => {
  if (status !== VOTE_STATUS.ONGOING || !stopAt) return null;

  const now = referenceTime.getTime();
  const endTime = new Date(stopAt).getTime();
  const difference = endTime - now;

  if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
};

interface VoteTimeInfo {
  status: VoteStatus;
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  relativeSinceQuery: string | null;
}

const CATEGORY_LABEL_FALLBACK: Record<string, string> = {
  birthday: 'Birthday',
  debut: 'Debut',
  accumulated: 'Accumulated',
  special: 'Special',
  event: 'Event',
  weekly: 'Weekly',
};

const SUBCATEGORY_LABEL_FALLBACK: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  group: 'Group',
  all: 'All',
};

const getStatusText = (status: VoteStatus, t: (key: string) => string): string => {
  const text = (() => {
    switch (status) {
      case VOTE_STATUS.UPCOMING:
        return t('label_tabbar_vote_upcoming') || STATUS_LABEL_FALLBACK[status];
      case VOTE_STATUS.ONGOING:
        return t('label_tabbar_vote_active') || STATUS_LABEL_FALLBACK[status];
      case VOTE_STATUS.COMPLETED:
        return t('label_tabbar_vote_end') || STATUS_LABEL_FALLBACK[status];
      default:
        return STATUS_LABEL_FALLBACK[VOTE_STATUS.ONGOING];
    }
  })();

  return text?.trim() ?? '';
};

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());

const getCategoryLabel = (
  category: string | undefined | null,
  t: (key: string) => string,
): string | null => {
  if (!category) return null;
  return (
    t(`label_vote_${category}`) ||
    CATEGORY_LABEL_FALLBACK[category] ||
    toTitleCase(category)
  );
};

const getSubCategoryLabel = (
  subCategory: string | undefined | null,
  t: (key: string) => string,
): string | null => {
  if (!subCategory) return null;
  return (
    t(`compatibility_gender_${subCategory}`) ||
    SUBCATEGORY_LABEL_FALLBACK[subCategory] ||
    toTitleCase(subCategory)
  );
};

interface VoteCardProps {
  vote: Vote;
  onClick?: () => void;
  isHero?: boolean;
}

export const VoteCard = React.memo(
  ({ vote, onClick, isHero = false }: VoteCardProps) => {
    const { t, currentLanguage } = useLanguageStore();
    const queryTimeRef = useRef<Date>(new Date()); // 카드 조회 시각
    const [timeInfo, setTimeInfo] = useState<VoteTimeInfo>(() => {
      const initialStatus = computeVoteStatus(vote.start_at, vote.stop_at, new Date());
      return {
        status: initialStatus,
        timeLeft: computeTimeLeft(initialStatus, vote.stop_at, new Date()),
        relativeSinceQuery: formatRelativeTime(queryTimeRef.current, currentLanguage as any, {
          useAbsolute: false,
          showTime: false,
        }),
      };
    });

    useEffect(() => {
      let timeoutId: number | undefined;

      const scheduleNextUpdate = (
        status: VoteStatus,
        stopAt: string | null | undefined,
        referenceTime: Date,
      ) => {
        if (!stopAt || status !== VOTE_STATUS.ONGOING) {
          return 60_000;
        }

        const endTime = new Date(stopAt).getTime();
        const remaining = endTime - referenceTime.getTime();

        if (remaining <= 60_000) {
          return 1_000;
        }

        if (remaining <= 10 * 60_000) {
          return 10_000;
        }

        return 60_000;
      };

      const updateTime = () => {
        const now = new Date();
        const status = computeVoteStatus(vote.start_at, vote.stop_at, now);
        const timeLeft = computeTimeLeft(status, vote.stop_at, now);

        setTimeInfo({
          status,
          timeLeft,
          relativeSinceQuery: formatRelativeTime(queryTimeRef.current, currentLanguage as any, {
            useAbsolute: false,
            showTime: false,
          }),
        });

        const nextDelay = scheduleNextUpdate(status, vote.stop_at, now);
        timeoutId = window.setTimeout(updateTime, nextDelay);
      };

      updateTime();

      return () => {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      };
    }, [vote.start_at, vote.stop_at, currentLanguage]);

    const { status, timeLeft, relativeSinceQuery } = timeInfo;

    const containerClass = useMemo(() => {
      const baseClass =
        'bg-gradient-to-br rounded-xl shadow-lg overflow-hidden transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl border h-full flex flex-col';

      const statusTone: Record<VoteStatus, string> = {
        [VOTE_STATUS.UPCOMING]: 'from-secondary-50 via-white to-white border-secondary-100/70',
        [VOTE_STATUS.ONGOING]: 'from-primary-50 via-white to-white border-primary-100/70',
        [VOTE_STATUS.COMPLETED]: 'from-gray-100 via-gray-50 to-gray-200 border-gray-200',
      };

      return `${baseClass} ${statusTone[status]}`;
    }, [status]);

    const rewards = ((vote as any)?.voteReward?.length || 0) > 0 ? (vote as any).voteReward : [];

    return (
      <div className={containerClass}>
        <NavigationLink
          href={`/vote/${vote.id}`}
          className='!block w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 rounded-xl'
        >
          <div className='flex flex-col h-full'>
            <div className='relative'>
              {vote.main_image && (
                <div className='bg-gray-200 relative overflow-hidden aspect-[4/3]'>
                  <OptimizedImage
                    src={vote.main_image}
                    alt={getLocalizedString(vote.title, currentLanguage)}
                    fill
                    sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                    className='object-cover'
                    priority={isHero}
                    fetchPriority={isHero ? 'high' : 'low'}
                  placeholder='shimmer'
                    quality={85}
                    intersectionThreshold={0.2}
                  />
                  <div className='absolute inset-0 bg-gradient-to-t from-black/30 to-transparent' />
                </div>
              )}
            </div>

            <div className='p-1 sm:p-2 flex-1 flex flex-col'>
              <div className='flex flex-wrap gap-0.5 mb-1 min-h-[32px] items-center'>
                {getCategoryLabel(vote.vote_category, t) && (
                  <span
                    suppressHydrationWarning
                    className={`flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm whitespace-nowrap ${
                      CATEGORY_COLORS[
                        vote.vote_category as keyof typeof CATEGORY_COLORS
                      ] || 'bg-gray-100 text-gray-800 border border-gray-200'
                    }`}
                  >
                    {getCategoryLabel(vote.vote_category, t)}
                  </span>
                )}
                {getSubCategoryLabel(vote.vote_sub_category, t) && !vote.is_partnership && (
                  <span
                    suppressHydrationWarning
                    className={`flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm whitespace-nowrap ${
                      SUB_CATEGORY_COLORS[
                        vote.vote_sub_category as keyof typeof SUB_CATEGORY_COLORS
                      ] || 'bg-gray-50 text-gray-600 border border-gray-100'
                    }`}
                  >
                    {getSubCategoryLabel(vote.vote_sub_category, t)}
                  </span>
                )}
                <span
                  suppressHydrationWarning
                  className={`flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm whitespace-nowrap ml-auto ${STATUS_TAG_COLORS[status]}`}
                >
                  {getStatusText(status, t)}
                </span>
              </div>

              <h3 className='font-extrabold text-base sm:text-lg mb-4 text-gray-900 p-2 relative group line-clamp-2 leading-tight min-h-[3.5rem]'>
                {getLocalizedString(vote.title, currentLanguage)}
                <span className='absolute bottom-0 left-2 right-2 h-[2px] bg-primary/30 group-hover:bg-primary/50 transition-colors duration-300'></span>
              </h3>

              <div className='flex items-center justify-center gap-2 mb-4 min-h-[32px]'>
                <CountdownTimer
                  timeLeft={timeLeft}
                  voteStatus={status as 'upcoming' | 'ongoing' | 'completed'}
                  variant="decorated"
                  compact={true}
                  showLabel={false}
                  showUnits={false}
                />
                <span
                  className='text-sub-600 text-xs min-w-[60px] text-center'
                  suppressHydrationWarning
                >
                  {status === VOTE_STATUS.ONGOING ? relativeSinceQuery : '\u00A0'}
                  </span>
              </div>

              <div className='flex-1 min-h-[9.5rem]'>
                  <VoteItems 
                    vote={vote} 
                    mode="list" 
                    onNavigateToDetail={() => {
                      // VoteRankCard 클릭 시 투표 상세로 이동
                      // NavigationLink의 href와 같은 경로로 프로그래매틱 네비게이션
                      window.location.href = `/vote/${vote.id}`;
                    }} 
                  />
              </div>
            </div>
          </div>
        </NavigationLink>

        {rewards.length > 0 && (
          <div className='px-1 sm:px-2 pb-2 pt-1 space-y-2'>
            {rewards.map((reward: any) => (
              <NavigationLink
                key={reward.reward?.id}
                href={`/rewards/${reward.reward?.id}`}
                className='block w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sub-200 transition-transform duration-200 hover:scale-[1.01]'
              >
                <RewardItem
                  reward={reward.reward!}
                  className='bg-sub-50 border-sub-200 text-gray-900 hover:border-sub-300 focus-within:border-sub-300 shadow-none'
                />
              </NavigationLink>
            ))}
          </div>
        )}
      </div>
    );
  },
);

VoteCard.displayName = 'VoteCard';

export default VoteCard;
