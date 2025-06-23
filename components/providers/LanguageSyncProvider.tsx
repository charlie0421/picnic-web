'use client';

import { useEffect, useState, useRef, memo, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { Language, settings } from '@/config/settings';

interface LanguageSyncProviderProps {
  children: React.ReactNode;
  initialLanguage?: string;
}

/**
 * URL 경로에서 언어 코드 추출
 */
function extractLanguageFromPath(pathname: string): Language {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  if (firstSegment && settings.languages.supported.includes(firstSegment as Language)) {
    return firstSegment as Language;
  }
  
  return settings.languages.default;
}

/**
 * 언어 동기화 Provider - Suspense 제거 버전
 */
const LanguageSyncProviderComponent = memo(function LanguageSyncProviderInternal({ 
  children, 
  initialLanguage 
}: LanguageSyncProviderProps) {
  const pathname = usePathname();
  const { 
    isHydrated, 
    currentLanguage, 
    setHydrated, 
    syncLanguageWithPath,
    isTranslationLoaded,
    translations,
    isLoading
  } = useLanguageStore();
  const [mounted, setMounted] = useState(false);
  const syncedRef = useRef(false);

  // 경로에서 언어 추출 - useMemo로 안정화
  const targetLanguage = useMemo(() => {
    return extractLanguageFromPath(pathname);
  }, [pathname]);

  // 현재 언어의 번역이 실제로 로드되었는지 확인
  const isTranslationReady = useMemo(() => {
    return isTranslationLoaded[currentLanguage] && 
           translations[currentLanguage] && 
           Object.keys(translations[currentLanguage]).length > 0;
  }, [isTranslationLoaded, translations, currentLanguage]);

  // 컴포넌트 마운트 감지
  useEffect(() => {
    setMounted(true);
  }, []);

  // 클라이언트 hydration 처리
  useEffect(() => {
    if (mounted) {
      console.log('🔄 [LanguageSyncProvider] Client hydration starting');
      setHydrated(true);
      console.log('🔄 [LanguageSyncProvider] Setting store hydration complete');
    }
  }, [mounted, setHydrated]);

  // 경로 변경 시 언어 동기화
  useEffect(() => {
    if (mounted && isHydrated && !syncedRef.current) {
      console.log('🔄 [LanguageSyncProvider] Path changed:', {
        pathname,
        langFromPath: targetLanguage,
        currentLanguage,
        isHydrated,
        mounted,
        isTranslationReady
      });
      
      syncLanguageWithPath();
      syncedRef.current = true;
    }
  }, [mounted, isHydrated, pathname, targetLanguage, currentLanguage, syncLanguageWithPath, isTranslationReady]);

  // 번역이 로드되지 않았거나 로딩 중이면 로딩 표시
  if (!mounted || !isHydrated || isLoading || !isTranslationReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading translations...</p>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-2 text-xs text-gray-500">
              <p>Mounted: {mounted ? '✅' : '❌'}</p>
              <p>Hydrated: {isHydrated ? '✅' : '❌'}</p>
              <p>Loading: {isLoading ? '🔄' : '✅'}</p>
              <p>Translation Ready: {isTranslationReady ? '✅' : '❌'}</p>
              <p>Current Lang: {currentLanguage}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
});

LanguageSyncProviderComponent.displayName = 'LanguageSyncProvider';

export { LanguageSyncProviderComponent as LanguageSyncProvider }; 