'use client';

import Link from 'next/link';
import type { EmptyStateConfig } from '@/types/mypage-common';

interface StateComponentProps {
  translations: Record<string, string> | { [key: string]: string };
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

// 에러 상태 컴포넌트
export function ErrorState({ error, onRetry, translations }: ErrorStateProps) {
  const t = (key: string) => translations[key] || key;

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl p-6 text-center border border-red-200 shadow-lg">
      <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
        <span className="text-white text-lg">❌</span>
      </div>
      <h3 className="text-lg font-bold text-red-800 mb-2">{t('label_error_occurred')}</h3>
      <p className="text-red-600 mb-4 text-sm">{error}</p>
      <p className="text-gray-600 mb-4 text-sm">{t('label_please_try_again')}</p>
      <button
        onClick={onRetry}
        className="group relative inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg"
      >
        <span className="text-sm font-semibold">{t('label_retry')}</span>
        <span className="group-hover:rotate-180 transition-transform duration-300">🔄</span>
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      </button>
    </div>
  );
}

// 초기 로딩 상태 컴포넌트
export function InitialLoadingState({ translations }: StateComponentProps) {
  const t = (key: string) => translations[key] || key;

  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, index) => (
        <div key={index} className="bg-white/90 backdrop-blur-md rounded-2xl p-4 border border-gray-200 shadow-lg">
          <div className="animate-pulse">
            <div className="flex items-center space-x-4 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full w-3/4 mb-2"></div>
                <div className="h-3 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full w-1/2"></div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg"></div>
              <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg"></div>
            </div>
          </div>
        </div>
      ))}
      
      <div className="text-center py-6">
        <div className="inline-flex items-center space-x-3 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-primary font-semibold text-sm">{t('label_loading')}</span>
        </div>
      </div>
    </div>
  );
}

// 빈 상태 컴포넌트
export function EmptyState({ config, translations }: EmptyStateProps) {
  const t = (key: string) => translations[key] || key;

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl p-8 text-center border border-gray-200 shadow-lg">
      <div className="w-16 h-16 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
        <span className="text-white text-2xl">{config.icon}</span>
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">{config.title}</h3>
      <p className="text-gray-600 mb-6 text-sm leading-relaxed">{config.description}</p>
      
      {config.actionUrl && config.actionLabel && (
        <Link
          href={config.actionUrl}
          className="group relative inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-lg"
        >
          <span className="text-sm font-semibold">{config.actionLabel}</span>
          <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </Link>
      )}
    </div>
  );
}

// 무한 스크롤 트리거 컴포넌트
export function InfiniteScrollTrigger({ hasMore, isLoadingMore, isLastPage, translations }: InfiniteScrollTriggerProps) {
  const t = (key: string) => translations[key] || key;

  if (isLastPage) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center space-x-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200">
          <span className="text-gray-600 text-sm">🎉</span>
          <span className="text-gray-600 font-medium text-sm">{t('label_all_data_loaded')}</span>
        </div>
      </div>
    );
  }

  if (isLoadingMore) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center space-x-3 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-primary font-semibold text-sm">{t('label_load_more')}</span>
        </div>
      </div>
    );
  }

  if (hasMore) {
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center space-x-2 px-4 py-2 bg-white/90 backdrop-blur-md rounded-full shadow-lg border border-gray-200">
          <span className="text-gray-600 text-sm">📱</span>
          <span className="text-gray-600 font-medium text-sm">{t('label_scroll_for_more')}</span>
        </div>
      </div>
    );
  }

  return null;
} 