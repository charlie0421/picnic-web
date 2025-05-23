'use client';

import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { useLanguageStore } from '@/stores/languageStore';
import { getCurrentLocale } from '@/utils/date';

interface CurrentTimeProps {
  initialTime?: string;
}

const CurrentTime: React.FC<CurrentTimeProps> = ({
  initialTime = new Date().toISOString(),
}) => {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const { currentLanguage } = useLanguageStore();
  const prevLanguage = useRef<string>(currentLanguage);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    setMounted(true);
  }, []);

  // 언어 변경 또는 마운트 시 시간 포맷 업데이트
  useEffect(() => {
    if (!mounted) return;

    const updateTime = () => {
      const now = new Date();
      const locale = getCurrentLocale(currentLanguage);
      const formattedTime = format(now, 'yyyy.MM.dd (EEE) HH:mm:ss', {
        locale,
      });
      setCurrentTime(formattedTime);
    };

    // 즉시 한 번 업데이트
    updateTime();

    // 언어 변경 기록
    prevLanguage.current = currentLanguage;
  }, [mounted, currentLanguage]);

  if (!mounted) return null;

  return (
    <div className='flex items-center'>
      <div className='px-3 py-1.5'>
        <span className='font-mono text-gray-700 font-medium text-xs sm:text-sm'>
          {currentTime}
        </span>
      </div>
    </div>
  );
};

export default CurrentTime;
