'use client';

import React from 'react';
import { useLanguageStore } from '@/stores/languageStore';

interface VoteCountdownTimerProps {
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  voteStatus: 'upcoming' | 'ongoing' | 'completed';
  className?: string;
  compact?: boolean; // 컴팩트 모드 (작은 화면용)
}

export function VoteCountdownTimer({ 
  timeLeft, 
  voteStatus, 
  className = '',
  compact = false 
}: VoteCountdownTimerProps) {
  const { t } = useLanguageStore();

  if (voteStatus !== 'ongoing' || !timeLeft) return null;

  const { days, hours, minutes, seconds } = timeLeft;
  const isExpired = days === 0 && hours === 0 && minutes === 0 && seconds === 0;

  if (isExpired) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className='text-xl'>🚫</span>
        <span className={`font-bold text-red-600 ${compact ? 'text-sm' : 'text-sm md:text-base'}`}>
          {t('vote_status_closed')}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className='text-xl'>⏱️</span>
      <div className={`flex items-center gap-1 font-mono font-bold ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {days > 0 && (
          <>
            <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-xs'}`}>
              {t('time_unit_day')}
            </span>
            <span className={`bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
              {String(days).padStart(2, '0')}
            </span>
          </>
        )}
        <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-xs'}`}>
          {t('time_unit_hour')}
        </span>
        <span className={`bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(hours).padStart(2, '0')}
        </span>
        <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-xs'}`}>
          {t('time_unit_minute')}
        </span>
        <span className={`bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(minutes).padStart(2, '0')}
        </span>
        <span className={`text-red-600 ${compact ? 'text-xs' : 'text-xs'}`}>
          {t('time_unit_second')}
        </span>
        <span className={`bg-red-100 text-red-800 px-1.5 py-0.5 rounded animate-pulse min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(seconds).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
} 