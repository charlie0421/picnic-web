'use client';

import React, {useEffect, useState} from 'react';
import {useLanguageStore} from '@/stores/languageStore';

interface ExclusiveOpenBadgeProps {
  className?: string;
}

const ExclusiveOpenBadge: React.FC<ExclusiveOpenBadgeProps> = ({ className = '' }) => {
  const { currentLanguage } = useLanguageStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const getExclusiveOpenText = () => {
    if (!mounted) return 'Currently in exclusive open beta. Official service coming soon.';

    switch (currentLanguage) {
      case 'ko':
        return '현재는 베타 오픈 기간입니다. 곧 정식 서비스를 제공할 예정입니다.';
      case 'en':
        return 'Currently in exclusive open beta. Official service coming soon.';
      case 'ja':
        return '現在は限定オープンベータ期間です。まもなく正式サービスを開始します。';
      case 'zh-cn':
        return '目前处于独家公测阶段。即将推出正式服务。';
      case 'zh-tw':
        return '目前處於獨家公測階段。正式服務即將推出。';
      case 'id':
        return 'Saat ini dalam periode beta terbuka eksklusif. Layanan resmi akan segera hadir.';
      default:
        return 'Currently in exclusive open beta. Official service coming soon.';
    }
  };

  // 주황 배경은 콘텐츠(둥근 배너)에만 한정. 바깥 행은 흰색 → AdSense Auto Ads 가
  // 이 근처에 광고를 주입해도 주황 배경이 광고 영역으로 번지지 않음(구조적 보장).
  return (
    <div className={`w-full bg-white border-b border-gray-200 ${className}`}>
      <div className="container mx-auto px-3 py-2">
        <div
          role="status"
          className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-white shadow-sm"
        >
          <span className="shrink-0 inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-orange-700 sm:text-xs">
            Beta
          </span>
          <span className="text-xs font-semibold leading-snug sm:text-sm text-center">
            {getExclusiveOpenText()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExclusiveOpenBadge;
