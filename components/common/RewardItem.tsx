import React from 'react';
import { Reward } from '@/types/interfaces';
import { getLocalizedString } from '@/utils/api/strings';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { cn } from '@/lib/utils';

interface RewardItemProps {
  reward: Reward;
  className?: string;
}

const RewardItem = React.memo(({ reward, className }: RewardItemProps) => (
  <div
    className={cn(
      'flex items-center gap-3 rounded-xl px-3 py-2 w-full min-h-[56px] border transition-colors duration-200',
      'bg-white/95 border-point-200/60 shadow-sm hover:border-point-300 focus-within:border-point-300',
      className,
    )}
  >
    {reward.thumbnail && (
      <div className='w-12 h-12 rounded-lg overflow-hidden ring-1 ring-point-200/40 flex-shrink-0'>
        <OptimizedImage
          src={reward.thumbnail}
          alt={getLocalizedString(reward.title)}
          width={48}
          height={48}
          className='w-full h-full object-cover'
        />
      </div>
    )}
    <div className='flex-1 min-w-0'>
      <p className='text-sm font-semibold text-gray-900 truncate'>
        {getLocalizedString(reward.title) || '리워드 정보'}
      </p>
    </div>
  </div>
));

RewardItem.displayName = 'RewardItem';

export default RewardItem;
