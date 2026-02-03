'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import AttendanceCheck from '@/components/client/attendance/AttendanceCheck';

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
        <AttendanceCheck />
      ) : (
        purchaseContent
      )}
    </div>
  );
}
