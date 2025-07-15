'use client';

import React, { memo } from 'react';
import type { StatisticCard, MypageHeaderConfig } from '@/types/mypage-common';

interface MypageHeaderProps {
  config: MypageHeaderConfig;
  statistics: StatisticCard[];
  translations: Record<string, string> | { [key: string]: string };
}

// 통계 카드 컴포넌트 분리 및 메모화
const StatisticsCard = memo(({ stat }: { stat: StatisticCard }) => (
  <div 
    className={`bg-gradient-to-br ${stat.bgColor} rounded-xl p-3 border ${stat.borderColor}`}
  >
    <div className="flex items-center space-x-2 mb-1">
      <div className={`w-6 h-6 bg-gradient-to-r from-primary to-secondary rounded-lg flex items-center justify-center shadow-sm`}>
        <span className="text-white text-xs">{stat.icon}</span>
      </div>
      <div className="flex-1">
        <h3 className={`font-bold ${stat.textColor} text-sm`}>{stat.title}</h3>
      </div>
    </div>
    {stat.isLoading ? (
      <div className="space-y-1">
        <div className="h-6 bg-gray-200 rounded w-16 animate-pulse"></div>
        <div className="h-3 bg-gray-200 rounded w-20 animate-pulse"></div>
      </div>
    ) : (
      <>
        <p className={`${stat.textColor} font-bold text-lg mb-1`}>
          {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
        </p>
        <p className={`${stat.textColor} text-xs opacity-75`}>
          {stat.description}
        </p>
      </>
    )}
  </div>
));

StatisticsCard.displayName = 'StatisticsCard';

// 메인 헤더 컴포넌트 메모화
export const MypageHeader = memo<MypageHeaderProps>(({ config, statistics, translations }) => {
  return (
    <div className="mb-6">
      <div className="relative bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/30 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
        
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white text-lg">{config.icon}</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{config.title}</h1>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {statistics.map((stat) => (
              <StatisticsCard key={stat.id} stat={stat} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

MypageHeader.displayName = 'MypageHeader'; 