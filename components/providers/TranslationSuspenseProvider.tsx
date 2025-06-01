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
 * 번역 데이터 로딩을 위한 Promise 래퍼
 * React Suspense가 인식할 수 있는 형태로 번역 로딩을 처리합니다.
 */
class TranslationPromise {
  private promise: Promise<void> | null = null;
  private status: 'pending' | 'fulfilled' | 'rejected' = 'pending';
  private error: Error | null = null;

  constructor(
    private loadTranslations: (lang: Language) => Promise<void>,
    private language: Language,
    private isLoaded: boolean
  ) {
    if (this.isLoaded) {
      this.status = 'fulfilled';
      console.log(`✅ [TranslationPromise] ${this.language} already loaded, skipping`);
    } else {
      console.log(`🔄 [TranslationPromise] Starting to load ${this.language}`);
      this.promise = this.load();
    }
  }

  private async load(): Promise<void> {
    try {
      console.log(`🔄 [TranslationPromise] Calling loadTranslations for ${this.language}`);
      await this.loadTranslations(this.language);
      this.status = 'fulfilled';
      console.log(`✅ [TranslationPromise] Successfully loaded ${this.language}`);
    } catch (error) {
      console.error(`❌ [TranslationPromise] Failed to load ${this.language}:`, error);
      this.status = 'rejected';
      this.error = error instanceof Error ? error : new Error('Translation loading failed');
      throw this.error;
    }
  }

  public read(): void {
    if (this.status === 'pending' && this.promise) {
      console.log(`⏳ [TranslationPromise] Throwing promise for ${this.language} (Suspense will catch this)`);
      throw this.promise;
    }
    if (this.status === 'rejected') {
      console.error(`❌ [TranslationPromise] Throwing error for ${this.language}`);
      throw this.error;
    }
    if (this.status === 'fulfilled') {
      console.log(`✅ [TranslationPromise] ${this.language} ready to render`);
    }
  }
}

// 이미 체크된 언어들을 추적하여 중복 체크 방지
const checkedLanguages = new Set<Language>();

/**
 * 번역 로딩 상태를 확인하는 컴포넌트
 */
function TranslationChecker({ language }: { language: Language }) {
  const { loadTranslations, isTranslationLoaded, translations, isHydrated } = useLanguageStore();
  
  // 모든 훅을 먼저 호출한 후 조건부 로직 처리
  const isLoaded = isTranslationLoaded[language] && 
    translations[language] && 
    Object.keys(translations[language]).length > 0;

  // 디버깅 로그
  if (!checkedLanguages.has(language)) {
    console.log(`🔍 [TranslationChecker] Checking ${language}:`, {
      isTranslationLoaded: isTranslationLoaded[language],
      hasTranslations: !!translations[language],
      translationCount: Object.keys(translations[language] || {}).length,
      isLoaded,
      isHydrated
    });
    checkedLanguages.add(language);
  }

  // hydration이 완료되지 않은 경우 로딩으로 간주
  if (!isHydrated) {
    console.log(`⏳ [TranslationChecker] Waiting for hydration for ${language}`);
    const promise = new Promise<void>((resolve) => {
      // hydration 완료를 기다리는 Promise
      const checkHydration = () => {
        if (useLanguageStore.getState().isHydrated) {
          resolve();
        } else {
          setTimeout(checkHydration, 10);
        }
      };
      checkHydration();
    });
    throw promise;
  }

  const translationPromise = new TranslationPromise(
    loadTranslations,
    language,
    isLoaded
  );

  translationPromise.read();

  return null;
}

/**
 * 번역 로딩 Fallback UI 컴포넌트
 */
function TranslationLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-blue-100 rounded-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">번역 데이터 로딩 중</h2>
        <p className="text-sm text-gray-600">잠시만 기다려주세요...</p>
      </div>
    </div>
  );
}

/**
 * 번역 에러 Fallback UI 컴포넌트
 */
function TranslationErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-red-100 rounded-full">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">번역 로딩 실패</h2>
        <p className="text-sm text-gray-600 mb-4">{error.message}</p>
        <button
          onClick={retry}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

/**
 * 에러 바운더리 컴포넌트
 */
class TranslationErrorBoundary extends React.Component<
  { children: ReactNode; fallback: (error: Error, retry: () => void) => ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Translation loading error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error, () => {
        this.setState({ hasError: false, error: null });
        // 체크된 언어 캐시 초기화
        checkedLanguages.clear();
      });
    }

    return this.props.children;
  }
}

/**
 * React Suspense를 활용한 번역 데이터 로딩 최적화 Provider
 */
export function TranslationSuspenseProvider({
  children,
  language,
  fallback
}: TranslationSuspenseProviderProps) {
  const [key, setKey] = useState(0);

  // 언어 변경 시 Suspense를 리셋하기 위한 키
  useEffect(() => {
    console.log(`🔄 [TranslationSuspenseProvider] Language changed to: ${language}`);
    setKey(prev => prev + 1);
    // 체크된 언어 캐시 초기화
    checkedLanguages.clear();
  }, [language]);

  const defaultFallback = fallback || <TranslationLoadingFallback />;

  return (
    <TranslationErrorBoundary
      fallback={(error, retry) => (
        <TranslationErrorFallback
          error={error}
          retry={() => {
            retry();
            setKey(prev => prev + 1);
          }}
        />
      )}
    >
      <Suspense key={`translation-${language}-${key}`} fallback={defaultFallback}>
        <TranslationChecker language={language} />
        {children}
      </Suspense>
    </TranslationErrorBoundary>
  );
} 