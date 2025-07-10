'use client';

import Link from 'next/link';
import type { MypageHeaderConfig, StatisticCard } from '@/types/mypage-common';

interface MypageHeaderProps {
  config: MypageHeaderConfig;
  statistics: StatisticCard[];
  translations: Record<string, string> | { [key: string]: string };
}

export function MypageHeader({ config, statistics, translations }: MypageHeaderProps) {
  const t = (key: string) => translations[key] || key;

  return (
    <div className="mb-4">
      <div className="relative bg-white/80 backdrop-blur-md rounded-2xl p-4 shadow-lg border border-white/30 overflow-hidden">
        {/* 배경 데코레이션 */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-primary-100 to-point-100 rounded-full blur-2xl opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-gradient-to-tr from-secondary-100 to-sub-100 rounded-full blur-xl opacity-40"></div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-md">
                  <span className="text-white text-sm">{config.icon}</span>
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-sub to-point rounded-full animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary-600 to-point bg-clip-text text-transparent leading-tight">
                  {config.title}
                </h1>
                <div className="h-1 w-16 bg-gradient-to-r from-primary to-point rounded-full mt-1"></div>
              </div>
            </div>
            <Link 
              href={config.backUrl || "/mypage"}
              className="group relative flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-primary to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg"
            >
              <span className="text-xs font-semibold">{config.backLabel || t('label_back_to_mypage')}</span>
              <span className="group-hover:translate-x-1 transition-transform duration-300 text-sm">→</span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </Link>
          </div>
          
          {/* 통계 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {statistics.map((stat) => (
              <div 
                key={stat.id}
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 