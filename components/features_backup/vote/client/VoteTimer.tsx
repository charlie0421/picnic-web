'use client';

import { useState, useEffect } from 'react';
import { getRemainingTime, formatRemainingTime } from '../../../server/utils';

export interface VoteTimerProps {
  endTime: string;
  onExpire?: () => void;
  className?: string;
}

export function VoteTimer({ endTime, onExpire, className }: VoteTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const remaining = getRemainingTime(endTime);
    return formatRemainingTime(remaining);
  });
  
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const end = new Date(endTime);
      
      if (now >= end) {
        setTimeLeft('종료됨');
        onExpire?.();
        return;
      }
      
      const remaining = getRemainingTime(endTime);
      setTimeLeft(formatRemainingTime(remaining));
    };
    
    // 초기 체크
    checkTime();
    
    // 1초마다 업데이트
    const interval = setInterval(checkTime, 1000);
    
    return () => clearInterval(interval);
  }, [endTime, onExpire]);
  
  return (
    <div className={className}>
      <span className="text-sm text-gray-500">남은 시간: </span>
      <span className="font-semibold">{timeLeft}</span>
    </div>
  );
} 