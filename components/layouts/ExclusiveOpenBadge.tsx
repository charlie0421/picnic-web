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

  return (
    <div
      role="status"
      className={`w-full bg-orange-500 text-white border-b-2 border-orange-700 shadow-sm ${className}`}
    >
      <div className="container mx-auto flex items-center justify-center gap-2 px-3 py-1.5 text-center sm:py-2">
        <span className="shrink-0 inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-orange-700 sm:text-xs">
          Beta
        </span>
        <span className="text-xs font-semibold leading-snug sm:text-sm">
          {getExclusiveOpenText()}
        </span>
      </div>
    </div>
  );
};

export default ExclusiveOpenBadge;
