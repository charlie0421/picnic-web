'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import type { EmptyStateConfig } from '@/types/mypage-common';

// 상태 컴포넌트에 공통으로 전달되는 props 타입
interface StateComponentProps {
  translations: Record<string, string>;
}

interface ErrorStateProps extends StateComponentProps {
  error: string;
  onRetry: () => void;
}

interface EmptyStateProps extends StateComponentProps {
  config: EmptyStateConfig;
}

interface InfiniteScrollTriggerProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  isLastPage: boolean;
  translations: Record<string, string> | { [key: string]: string };
}

// 로딩 상태 컴포넌트 메모화
export const InitialLoadingState = memo<StateComponentProps>(({ translations }) => {
  const t = (key: string) => translations[key] || key;
  
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      {/* 로고 아이콘 with 펄스 애니메이션 */}
      <div className="relative">
        <Image
          src="/images/logo.png"
          alt="Picnic Loading"
          width={64}
          height={64}
          priority
          className="w-16 h-16 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
        />
      </div>
      <div className="text-center">
        <p className="text-gray-600 font-medium animate-pulse">{t('label_loading')}</p>
      </div>
    </div>
  );
});

InitialLoadingState.displayName = 'InitialLoadingState';

// 에러 상태 컴포넌트 메모화
export const ErrorState = memo<ErrorStateProps>(({ error, onRetry, translations }) => {
  const t = (key: string) => translations[key] || key;
  
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
          <span className="text-red-500 text-2xl">⚠️</span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('label_error_occurred')}</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-200 font-medium"
        >
          {t('label_retry')}
        </button>
      </div>
    </div>
  );
});

ErrorState.displayName = 'ErrorState';

// 빈 상태 컴포넌트 메모화
export const EmptyState = memo<EmptyStateProps>(({ config, translations }) => {
  const t = (key: string) => translations[key] || key;
  
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6 mx-auto">
          <span className="text-gray-400 text-3xl">{config.icon}</span>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">{config.title}</h3>
        <p className="text-gray-600 mb-6 max-w-sm">{config.description}</p>
        {config.actionLabel && config.actionUrl && (
          <a
            href={config.actionUrl}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:from-primary-600 hover:to-secondary-600 transition-all duration-300 transform hover:scale-105 font-medium shadow-md hover:shadow-lg"
          >
            {config.actionLabel}
            <span className="ml-2">→</span>
          </a>
        )}
      </div>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

// 무한 스크롤 트리거 컴포넌트 메모화
export const InfiniteScrollTrigger = memo<InfiniteScrollTriggerProps>(({ 
  hasMore, 
  isLoadingMore, 
  isLastPage, 
  translations 
}) => {
  const t = (key: string) => translations[key] || key;
  
  if (isLastPage) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-lg">
          <span className="text-gray-500 text-sm">✓</span>
          <span className="text-gray-600 text-sm font-medium">{t('label_all_data_loaded')}</span>
        </div>
      </div>
    );
  }

  if (isLoadingMore) {
    return (
      <div className="flex justify-center py-8">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <span className="text-gray-600 text-sm">{t('label_load_more')}</span>
        </div>
      </div>
    );
  }

  if (!hasMore) {
    return null;
  }

  return (
    <div className="text-center py-4">
      <div className="w-8 h-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent mx-auto"></div>
    </div>
  );
});

InfiniteScrollTrigger.displayName = 'InfiniteScrollTrigger'; 