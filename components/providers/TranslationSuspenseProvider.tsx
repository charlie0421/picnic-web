'use client';

import React, { Suspense, ReactNode, useState, useEffect } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { Language } from '@/config/settings';

interface TranslationSuspenseProviderProps {
  children: ReactNode;
  language: Language;
  fallback?: ReactNode;
}

// 이미 체크된 언어들을 추적하여 중복 체크 방지
const checkedLanguages = new Set<Language>();

/**
 * 번역 로딩 상태를 확인하는 컴포넌트
 */
function TranslationChecker({ language }: { language: Language }) {
  const { loadTranslations, isTranslationLoaded, translations, isHydrated } = useLanguageStore();
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [error, setError] = useState<Error | null>(null);
  
  // 번역이 로드되었는지 확인
  const isLoaded = isTranslationLoaded[language] && 
    translations[language] && 
    Object.keys(translations[language]).length > 0;

  // 디버깅 로그
  useEffect(() => {
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
  }, [language, isTranslationLoaded, translations, isLoaded, isHydrated]);

  // 번역 로딩 처리
  useEffect(() => {
    // hydration이 완료되지 않은 경우
    if (!isHydrated) {
      console.log(`⏳ [TranslationChecker] Waiting for hydration for ${language}`);
      setLoadingState('loading');
      return;
    }

    // 이미 로드된 경우
    if (isLoaded) {
      console.log(`✅ [TranslationChecker] ${language} already loaded`);
      setLoadingState('loaded');
      return;
    }

    // 로딩이 필요한 경우
    if (loadingState === 'idle') {
      console.log(`🔄 [TranslationChecker] Starting to load ${language}`);
      setLoadingState('loading');
      
      loadTranslations(language)
        .then(() => {
          console.log(`✅ [TranslationChecker] Successfully loaded ${language}`);
          setLoadingState('loaded');
        })
        .catch((err) => {
          console.error(`❌ [TranslationChecker] Failed to load ${language}:`, err);
          setError(err instanceof Error ? err : new Error('Translation loading failed'));
          setLoadingState('error');
        });
    }
  }, [language, isHydrated, isLoaded, loadTranslations, loadingState]);

  // 에러가 발생한 경우 throw
  if (loadingState === 'error' && error) {
    throw error;
  }

  // 로딩 중인 경우 Promise throw (Suspense가 캐치)
  if (loadingState === 'loading') {
    console.log(`⏳ [TranslationChecker] Suspending for ${language}`);
    throw new Promise<void>((resolve) => {
      // 상태가 변경될 때까지 대기
      const checkLoaded = () => {
        const currentState = useLanguageStore.getState();
        const currentIsLoaded = currentState.isTranslationLoaded[language] && 
          currentState.translations[language] && 
          Object.keys(currentState.translations[language]).length > 0;
        
        if (currentState.isHydrated && currentIsLoaded) {
          resolve();
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
    });
  }

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