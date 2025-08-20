'use client';

import { useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from '@/hooks/useTranslationReady';

interface CountdownTimerProps {
  // 방법 1: 계산된 시간을 받는 방식 (기존 VoteCountdownTimer 방식)
  timeLeft?: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  
  // 방법 2: 시간을 직접 받아서 계산하는 방식 (기존 CountdownTimer 방식)
  startTime?: string | null;
  endTime?: string | null;
  
  // 상태 관리
  status?: 'scheduled' | 'in_progress' | 'ended' | 'ongoing' | 'upcoming' | 'completed';
  voteStatus?: 'upcoming' | 'ongoing' | 'completed'; // 호환성 유지
  
  // UI 옵션
  variant?: 'simple' | 'decorated'; // 기본 스타일 vs 화려한 스타일
  compact?: boolean;
  className?: string;
  showEmoji?: boolean;
  showLabel?: boolean;    // 상단/부가 라벨("시작까지/종료까지") 표시 여부
  showUnits?: boolean;    // 일/시/분/초 텍스트 단위 표시 여부
}

export function CountdownTimer({ 
  timeLeft: propTimeLeft,
  startTime,
  endTime,
  status,
  voteStatus,
  variant = 'simple',
  compact = false,
  className = '',
  showEmoji = true,
  showLabel = true,
  showUnits = true
}: CountdownTimerProps) {
  const { t } = useLanguageStore();
  const isTranslationReady = useTranslationReady();
  
  const [calculatedTimeLeft, setCalculatedTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // 상태 정규화 (voteStatus와 status 호환성 처리)
  const normalizedStatus = (() => {
    if (voteStatus) {
      switch (voteStatus) {
        case 'upcoming': return 'scheduled';
        case 'ongoing': return 'in_progress';
        case 'completed': return 'ended';
        default: return voteStatus;
      }
    }
    return status || 'ended';
  })();

  // 시간 계산 로직 (startTime/endTime이 제공된 경우)
  useEffect(() => {
    if (propTimeLeft !== undefined) return; // prop으로 시간이 제공되면 계산하지 않음
    if (normalizedStatus === 'ended') return;

    const targetTime = normalizedStatus === 'scheduled' ? startTime : endTime;
    if (!targetTime) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const target = new Date(targetTime).getTime();
      const difference = target - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setCalculatedTimeLeft({ days, hours, minutes, seconds });
      } else {
        setCalculatedTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime, endTime, normalizedStatus, propTimeLeft]);

  // 최종 사용할 시간 결정
  const timeLeft = propTimeLeft || calculatedTimeLeft;

  // 진행 중이 아니거나 시간이 없으면 숨김 (VoteCountdownTimer 호환성)
  if (voteStatus && voteStatus !== 'ongoing') return null;
  if (normalizedStatus === 'ended' && !propTimeLeft) {
    return (
      <div className={`text-center py-2 ${className}`}>
        <span className="text-sm font-medium text-gray-500">
          {isTranslationReady ? (t('text_vote_ended') || '투표 종료') : '투표 종료'}
        </span>
      </div>
    );
  }

  if (!timeLeft) return null;

  const { days, hours, minutes, seconds } = timeLeft;
  const isExpired = days === 0 && hours === 0 && minutes === 0 && seconds === 0;

  if (isExpired) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showEmoji && <span className='text-xl'>🚫</span>}
        <span className={`font-bold text-red-600 ${compact ? 'text-sm' : 'text-sm md:text-base'}`}>
          {t('vote_status_closed')}
        </span>
      </div>
    );
  }

  const formatTime = (time: number) => time.toString().padStart(2, '0');

  const getCountdownText = () => {
    if (!isTranslationReady) {
      return normalizedStatus === 'scheduled' ? '시작까지' : '종료까지';
    }
    return normalizedStatus === 'scheduled' 
      ? (t('text_vote_countdown_start') || '시작까지')
      : (t('text_vote_countdown_end') || '종료까지');
  };

  // Simple variant (기존 CountdownTimer 스타일)
  if (variant === 'simple') {
    return (
      <div className={`text-center py-2 ${className}`}>
        {showLabel && (
          <div className="text-xs text-gray-600 mb-1">
            {getCountdownText()}
          </div>
        )}
        <div className="flex justify-center items-center space-x-1 text-sm font-bold">
          <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
            {days} {t('time_unit_day')}
          </span>
          <span className="text-gray-400">:</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
            {formatTime(hours)} {t('time_unit_hour')}
          </span>
          <span className="text-gray-400">:</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
            {formatTime(minutes)} {t('time_unit_minute')}
          </span>
          <span className="text-gray-400">:</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
            {formatTime(seconds)} {t('time_unit_second')}
          </span>
        </div>
      </div>
    );
  }

  // Decorated variant (기존 VoteCountdownTimer 스타일)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showEmoji && <span className='text-xl'>⏱️</span>}
      <div className={`flex items-center gap-1 font-mono font-bold ${compact ? 'gap-0.5' : 'gap-1'}`}>
        <span className={`bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(days).padStart(2, '0')}
        </span>
        {showUnits && (
          <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-xs'}`}>
            {t('time_unit_day')}
          </span>
        )}
        <span className={`bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(hours).padStart(2, '0')}
        </span>
        {showUnits && (
          <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-xs'}`}>
            {t('time_unit_hour')}
          </span>
        )}
        <span className={`bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(minutes).padStart(2, '0')}
        </span>
        {showUnits && (
          <span className={`text-blue-600 ${compact ? 'text-xs' : 'text-xs'}`}>
            {t('time_unit_minute')}
          </span>
        )}
        <span className={`bg-red-100 text-red-800 px-1.5 py-0.5 rounded animate-pulse min-w-[20px] text-center ${compact ? 'text-xs px-1 py-0.5' : 'text-xs'}`}>
          {String(seconds).padStart(2, '0')}
        </span>
        {showUnits && (
          <span className={`text-red-600 ${compact ? 'text-xs' : 'text-xs'}`}>
            {t('time_unit_second')}
          </span>
        )}
      </div>
    </div>
  );
} 