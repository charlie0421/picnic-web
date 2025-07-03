'use client';

import React, { Suspense, ReactNode, useState, useEffect } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Language } from '@/config/settings';
import { usePathname } from 'next/navigation';
import { StarCandySkeleton } from '@/components/client/star-candy/StarCandySkeleton';

interface TranslationSuspenseProviderProps {
  children: ReactNode;
  language: Language;
  fallback?: ReactNode;
}

/**
 * 기본 번역 로딩 Fallback UI 컴포넌트 - 스켈레톤 방식
 */
function DefaultTranslationLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Skeleton */}
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          {/* Navigation Skeleton */}
          <div className="h-16 bg-gray-200 rounded-lg mb-8"></div>
          
          {/* Title Skeleton */}
          <div className="text-center mb-8">
            <div className="h-8 bg-gray-200 rounded-lg w-64 mx-auto mb-4"></div>
            <div className="h-5 bg-gray-200 rounded-lg w-96 mx-auto"></div>
          </div>
          
          {/* Content Skeleton */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="bg-white rounded-lg p-6 shadow">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 간소화된 번역 Provider - 에러 발생 시 children을 그대로 렌더링
 */
export function TranslationSuspenseProvider({
  children,
  language,
  fallback
}: TranslationSuspenseProviderProps) {
  const { loadTranslations, isTranslationLoaded, translations, isHydrated } = useLanguageStore();
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();

  // star-candy 페이지인지 확인
  const isStarCandyPage = pathname.includes('/star-candy');

  // 번역이 로드되었는지 확인
  const isLoaded = isTranslationLoaded[language] && 
    translations[language] && 
    Object.keys(translations[language]).length > 0;

  // 번역 로딩 처리
  useEffect(() => {
    if (!isHydrated || isLoaded || isLoading) {
      return;
    }

    setIsLoading(true);
    
    loadTranslations(language)
      .then(() => {
        console.log(`✅ [TranslationSuspenseProvider] Successfully loaded ${language}`);
      })
      .catch((err) => {
        console.warn(`⚠️ [TranslationSuspenseProvider] Failed to load ${language}, continuing anyway:`, err);
        // 에러가 발생해도 계속 진행
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [language, isHydrated, isLoaded, loadTranslations, isLoading]);

  // hydration이 완료되지 않았거나 로딩 중인 경우 fallback 표시
  if (!isHydrated || isLoading) {
    // star-candy 페이지에서는 정교한 스켈레톤 사용
    if (isStarCandyPage) {
      return (
        <div className="container mx-auto px-4 py-8">
          <StarCandySkeleton />
        </div>
      );
    }
    
    // 다른 페이지에서는 기본 스켈레톤 또는 커스텀 fallback 사용
    return fallback || <DefaultTranslationLoadingFallback />;
  }

  // 에러가 발생하더라도 children을 렌더링
  return <>{children}</>;
} 