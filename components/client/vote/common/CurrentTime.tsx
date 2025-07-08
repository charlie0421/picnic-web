'use client';

import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { useLanguageStore } from '@/stores/languageStore';
import { getCurrentLocale, getTimeZoneCode } from '@/utils/date';
import { useTimeZoneDetection } from '@/hooks/useTimeZoneDetection';

interface CurrentTimeProps {
  initialTime?: string;
  showTimeZone?: boolean;
}

const CurrentTime: React.FC<CurrentTimeProps> = ({
  initialTime = new Date().toISOString(),
  showTimeZone = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const { currentLanguage } = useLanguageStore();
  const { timeZone, changed } = useTimeZoneDetection();
  const prevLanguage = useRef<string>(currentLanguage);
  const prevTimeZone = useRef<string>(timeZone);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    setMounted(true);
  }, []);

  // 언어 변경, 시간대 변경 또는 마운트 시 시간 포맷 업데이트
  useEffect(() => {
    if (!mounted) return;

    const updateTime = () => {
      const now = new Date();
      const locale = getCurrentLocale(currentLanguage);
      let formattedTime = format(now, 'yyyy.MM.dd (EEE) HH:mm:ss', {
        locale,
      });

      // 시간대 코드 추가
      if (showTimeZone) {
        const tzCode = getTimeZoneCode(timeZone, currentLanguage);
        formattedTime += ` ${tzCode}`;
      }

      setCurrentTime(formattedTime);
    };

    // 즉시 한 번 업데이트
    updateTime();

    // 1초마다 업데이트
    const interval = setInterval(updateTime, 1000);

    // 언어 변경 기록
    prevLanguage.current = currentLanguage;
    prevTimeZone.current = timeZone;

    return () => clearInterval(interval);
  }, [mounted, currentLanguage, timeZone, showTimeZone]);

  // 시간대 변경 감지 시 시각적 피드백
  useEffect(() => {
    if (changed) {
      console.log('🌍 시간대 변경됨:', timeZone);
    }
  }, [changed, timeZone]);

  if (!mounted) return null;

  return (
    <div className='flex items-center'>
      <div className='px-3 py-1.5'>
        <span 
          className={`font-mono font-medium text-xs sm:text-sm transition-colors duration-300 ${
            changed ? 'text-blue-600' : 'text-gray-700'
          }`}
        >
          {currentTime}
        </span>
        {changed && (
          <span className="ml-2 text-xs text-blue-500 animate-pulse">
            시간대 변경됨
          </span>
        )}
      </div>
    </div>
  );
};

export default CurrentTime;
