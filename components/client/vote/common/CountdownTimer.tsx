'use client';

import { useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from '@/hooks/useTranslationReady';

interface CountdownTimerProps {
  startTime: string | null;
  endTime: string | null;
  status: 'scheduled' | 'in_progress' | 'ended';
}

export function CountdownTimer({ startTime, endTime, status }: CountdownTimerProps) {
  const { t } = useLanguageStore();
  const isTranslationReady = useTranslationReady();
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (status === 'ended') return;

    const targetTime = status === 'scheduled' ? startTime : endTime;
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

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer(); // 즉시 실행
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime, status]);

  const formatTime = (time: number) => time.toString().padStart(2, '0');

  const getEndedText = () => {
    if (!isTranslationReady) {
      return '투표 종료';
    }
    return t('text_vote_ended') || '투표 종료';
  };

  const getCountdownText = () => {
    if (!isTranslationReady) {
      return status === 'scheduled' ? '시작까지' : '종료까지';
    }
    return status === 'scheduled' 
      ? (t('text_vote_countdown_start') || '시작까지')
      : (t('text_vote_countdown_end') || '종료까지');
  };

  if (status === 'ended') {
    return (
      <div className="text-center py-2">
        <span className="text-sm font-medium text-gray-500">
          {getEndedText()}
        </span>
      </div>
    );
  }

  const { days, hours, minutes, seconds } = timeLeft;

  return (
    <div className="text-center py-2">
      <div className="text-xs text-gray-600 mb-1">
        {getCountdownText()}
      </div>
      <div className="flex justify-center items-center space-x-1 text-sm font-bold">
        {days > 0 && (
          <>
            <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
              {days}일
            </span>
            <span className="text-gray-400">:</span>
          </>
        )}
        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
          {formatTime(hours)}시
        </span>
        <span className="text-gray-400">:</span>
        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
          {formatTime(minutes)}분
        </span>
        <span className="text-gray-400">:</span>
        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs">
          {formatTime(seconds)}초
        </span>
      </div>
    </div>
  );
} 