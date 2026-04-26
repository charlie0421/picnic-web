'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { CalendarCheck } from 'lucide-react';

interface Props {
  purchaseContent: ReactNode;
}

type Tab = 'free' | 'purchase';

export default function StarCandyPageTabs({ purchaseContent }: Props) {
  const { t } = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('free');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'free', label: t('label_tab_free_charge_station') || '무료충전소' },
    { key: 'purchase', label: t('label_tab_buy_star_candy') || '별사탕 구매' },
  ];

  return (
    <div>
      {/* Tab Header */}
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-purple-500 text-purple-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'free' ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-gray-500">
          <CalendarCheck className="w-12 h-12 text-purple-300" />
          <p className="text-sm text-center">
            {t('label_attendance_moved_to_header') || '출석체크가 상단 헤더로 이동했습니다.'}
          </p>
          <p className="text-xs text-gray-400 text-center">
            {t('label_attendance_moved_to_header_desc') || '헤더의 캘린더 아이콘을 눌러 출석체크하세요.'}
          </p>
        </div>
      ) : (
        purchaseContent
      )}
    </div>
  );
}
