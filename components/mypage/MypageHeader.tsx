'use client';

import React, { memo } from 'react';
import Link from 'next/link';
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
      <div className={`w-6 h-6 bg-${stat.id} rounded-lg flex items-center justify-center`}>
        <span className="text-white text-xs">{stat.icon}</span>
      </div>
      <div className="flex-1">
        <h3 className={`font-bold ${stat.textColor} text-sm`}>{stat.title}</h3>
        {stat.description && (
          <p className={`${stat.textColor.replace('800', '600')} text-xs`}>{stat.description}</p>
        )}
      </div>
    </div>
    {stat.isLoading ? (
      <div className="flex items-center space-x-1">
        <div className={`w-16 h-6 bg-${stat.id}-200 rounded animate-pulse`}></div>
        <div className="flex space-x-0.5">
          <div className={`w-1.5 h-1.5 bg-${stat.id}-400 rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
          <div className={`w-1.5 h-1.5 bg-${stat.id}-400 rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
          <div className={`w-1.5 h-1.5 bg-${stat.id}-400 rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    ) : (
      <p className={`${stat.textColor} font-bold text-lg`}>
        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
      </p>
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
            <Link 
              href={config.backUrl || "/mypage"}
              className="text-sm text-primary-600 hover:text-primary-800 font-semibold px-3 py-1 rounded-lg hover:bg-primary-50 transition-colors duration-200"
            >
              ← {config.backLabel}
            </Link>
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