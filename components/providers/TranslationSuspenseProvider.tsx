'use client';

import React, { Suspense, ReactNode, useState, useEffect } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Language } from '@/config/settings';

interface TranslationSuspenseProviderProps {
  children: ReactNode;
  language: Language;
  fallback?: ReactNode;
}

/**
 * 번역 로딩 Fallback UI 컴포넌트
 */
function TranslationLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
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
    return fallback || <TranslationLoadingFallback />;
  }

  // 에러가 발생하더라도 children을 렌더링
  return <>{children}</>;
} 