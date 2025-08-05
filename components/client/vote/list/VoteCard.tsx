'use client';

import React, { useMemo, useState, useEffect } from 'react';
import NavigationLink from '@/components/client/NavigationLink';
import { Vote } from '@/types/interfaces';
import { useLanguageStore } from '@/stores/languageStore';
import { CountdownTimer } from '../common/CountdownTimer';
import { getLocalizedString } from '@/utils/api/strings';
import { formatVotePeriodWithTimeZone } from '@/utils/date';
import RewardItem from '@/components/common/RewardItem';
import { VoteItems } from './VoteItems';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

const VOTE_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
} as const;

type VoteStatus = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];

const STATUS_TAG_COLORS: Record<VoteStatus, string> = {
  [VOTE_STATUS.UPCOMING]: 'bg-blue-500 text-white border border-blue-600',
  [VOTE_STATUS.ONGOING]: 'bg-green-500 text-white border border-green-600',
  [VOTE_STATUS.COMPLETED]: 'bg-gray-500 text-white border border-gray-600',
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

const getStatusText = (
  status: VoteStatus,
  t: (key: string) => string,
): string => {
  switch (status) {
    case VOTE_STATUS.UPCOMING:
      return t('label_tabbar_vote_upcoming');
    case VOTE_STATUS.ONGOING:
      return t('label_tabbar_vote_active');
    case VOTE_STATUS.COMPLETED:
      return t('label_tabbar_vote_end');
    default:
      return '';
  }
};

export const VoteCard = React.memo(
  ({ vote, onClick }: { vote: Vote; onClick?: () => void }) => {
    const { t, currentLanguage } = useLanguageStore();
    const [currentTime, setCurrentTime] = useState(new Date());
    
    // 실시간 시간 업데이트 (1초마다 업데이트)
    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000); // 1초마다 업데이트

      return () => clearInterval(timer);
    }, []);
    
    // 투표 상태 계산 (서버/클라이언트 일관성 보장)
    const status = useMemo(() => {
      if (!vote.start_at || !vote.stop_at) return VOTE_STATUS.UPCOMING;
      
      const start = new Date(vote.start_at);
      const end = new Date(vote.stop_at);
      
      if (currentTime < start) return VOTE_STATUS.UPCOMING;
      if (currentTime > end) return VOTE_STATUS.COMPLETED;
      return VOTE_STATUS.ONGOING;
    }, [vote.start_at, vote.stop_at, currentTime]);

    // 남은 시간 계산
    const timeLeft = useMemo(() => {
      if (status !== VOTE_STATUS.ONGOING || !vote.stop_at) return null;
      
      const now = currentTime.getTime();
      const endTime = new Date(vote.stop_at).getTime();
      const difference = endTime - now;

      if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds };
    }, [status, vote.stop_at, currentTime]);

    return (
      <NavigationLink href={`/vote/${vote.id}`}>
        <div className='bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100 h-full flex flex-col'>
          <div className='relative'>
            {vote.main_image && (
              <div className='bg-gray-200 relative overflow-hidden aspect-[4/3]'>
                <OptimizedImage
                  src={vote.main_image}
                  alt={getLocalizedString(vote.title, currentLanguage)}
                  fill
                  sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                  className='object-cover'
                  priority={false}
                  placeholder='skeleton'
                  quality={85}
                  intersectionThreshold={0.2}
                />
                <div className='absolute inset-0 bg-gradient-to-t from-black/30 to-transparent' />
              </div>
            )}
          </div>

          <div className='p-1 sm:p-2 flex-1 flex flex-col'>
            <div className='flex flex-wrap gap-0.5 mb-1'>
              {vote.vote_category && (
                <span
                  className={`flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm whitespace-nowrap ${
                    CATEGORY_COLORS[
                      vote.vote_category as keyof typeof CATEGORY_COLORS
                    ] || 'bg-gray-100 text-gray-800 border border-gray-200'
                  }`}
                >
                  {t(`label_vote_${vote.vote_category}`)}
                </span>
              )}
              {vote.vote_sub_category && (
                <span
                  className={`flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm whitespace-nowrap ${
                    SUB_CATEGORY_COLORS[
                      vote.vote_sub_category as keyof typeof SUB_CATEGORY_COLORS
                    ] || 'bg-gray-50 text-gray-600 border border-gray-100'
                  }`}
                >
                  {t(`compatibility_gender_${vote.vote_sub_category}`)}
                </span>
              )}
              <span
                className={`flex items-center px-2 py-0.5 rounded-full text-xs font-medium shadow-sm whitespace-nowrap ml-auto ${STATUS_TAG_COLORS[status]}`}
              >
                {getStatusText(status, t)}
              </span>
            </div>

            <h3 className='font-extrabold text-base sm:text-lg mb-4 text-gray-900 truncate p-2 relative group'>
              {getLocalizedString(vote.title, currentLanguage)}
              <span className='absolute bottom-0 left-2 right-2 h-[2px] bg-primary/30 group-hover:bg-primary/50 transition-colors duration-300'></span>
            </h3>

            <div className='flex justify-center mb-4'>
              <CountdownTimer
                timeLeft={timeLeft}
                voteStatus={status as 'upcoming' | 'ongoing' | 'completed'}
                variant="decorated"
                compact={true}
              />
            </div>

            <div className='flex-1'>
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

            {vote.voteReward && vote.voteReward.length > 0 && (
              <div className='mt-2 space-y-2'>
                {vote.voteReward.map((reward) => (
                  <NavigationLink
                    key={reward.reward?.id}
                    href={`/rewards/${reward.reward?.id}`}
                    className='block hover:bg-gray-50 rounded-lg transition-colors'
                  >
                    <RewardItem reward={reward.reward!} />
                  </NavigationLink>
                ))}
              </div>
            )}

            <div className='mt-1 pt-2 border-t border-gray-100'>
              {vote.start_at && vote.stop_at && (
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-1 sm:gap-0'>
                  <div className='flex items-center space-x-2 bg-primary/5 rounded-lg px-3 py-2'>
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      className='h-4 w-4 text-primary'
                      viewBox='0 0 20 20'
                      fill='currentColor'
                    >
                      <path
                        fillRule='evenodd'
                        d='M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z'
                        clipRule='evenodd'
                      />
                    </svg>
                    <span className='text-primary font-medium'>
                      {formatVotePeriodWithTimeZone(vote.start_at, vote.stop_at, currentLanguage)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </NavigationLink>
    );
  },
);

VoteCard.displayName = 'VoteCard';

export default VoteCard;
