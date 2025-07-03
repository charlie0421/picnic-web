'use client';

import { useEffect, useState, memo, useMemo } from 'react';
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
 * 개발용 디버그 정보 컴포넌트
 * hydration mismatch를 방지하기 위해 완전히 준비된 후에만 표시
 */
function DebugInfo({ 
  mounted, 
  isHydrated, 
  isLoading, 
  isTranslationReady, 
  currentLanguage 
}: {
  mounted: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  isTranslationReady: boolean;
  currentLanguage: Language;
}) {
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs z-50">
      <p>Mounted: {mounted ? '✅' : '❌'}</p>
      <p>Hydrated: {isHydrated ? '✅' : '❌'}</p>
      <p>Loading: {isLoading ? '🔄' : '✅'}</p>
      <p>Translation Ready: {isTranslationReady ? '✅' : '❌'}</p>
      {/* hydration 완료 후에만 언어 표시하여 mismatch 방지 */}
      {mounted && isHydrated && (
        <p>Current Lang: {currentLanguage}</p>
      )}
    </div>
  );
}

/**
 * 언어 동기화 Provider - 번역 동기화만 담당
 * 각 페이지의 Suspense fallback이 로딩 UI를 처리하도록 함
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
    loadTranslations,
    isTranslationLoaded,
    translations,
    isLoading,
    setCurrentLang
  } = useLanguageStore();
  
  const [mounted, setMounted] = useState(false);

  // 현재 언어의 번역이 준비되었는지 확인
  const isTranslationReady = useMemo(() => {
    return isTranslationLoaded[currentLanguage] && 
           translations[currentLanguage] && 
           Object.keys(translations[currentLanguage]).length > 0;
  }, [isTranslationLoaded, translations, currentLanguage]);

  // 컴포넌트 마운트 감지
  useEffect(() => {
    setMounted(true);
  }, []);

  // 서버에서 전달된 initialLanguage로 초기화 (hydration mismatch 방지)
  useEffect(() => {
    if (mounted && !isHydrated && initialLanguage && initialLanguage !== currentLanguage) {
      // initialLanguage가 유효한 Language인지 검증
      const validLanguage = settings.languages.supported.includes(initialLanguage as Language) 
        ? initialLanguage as Language 
        : settings.languages.default;
      
      console.log(`🔄 [LanguageSyncProvider] Initializing with server language: ${validLanguage}`);
      setCurrentLang(validLanguage);
    }
  }, [mounted, isHydrated, initialLanguage, currentLanguage, setCurrentLang]);

  // 클라이언트 hydration 처리
  useEffect(() => {
    if (mounted && !isHydrated) {
      setHydrated(true);
    }
  }, [mounted, isHydrated, setHydrated]);

  // 경로 변경 시 언어 동기화 (hydration 후에만)
  useEffect(() => {
    if (mounted && isHydrated) {
      syncLanguageWithPath();
    }
  }, [mounted, isHydrated, pathname, syncLanguageWithPath]);

  // 번역 로딩
  useEffect(() => {
    if (mounted && isHydrated && !isTranslationReady && !isLoading) {
      loadTranslations(currentLanguage);
    }
  }, [mounted, isHydrated, isTranslationReady, isLoading, currentLanguage, loadTranslations]);

  // 준비되지 않은 경우 null 반환 → 각 페이지의 Suspense fallback이 표시됨
  if (!mounted || !isHydrated || isLoading || !isTranslationReady) {
    return (
      <DebugInfo 
        mounted={mounted}
        isHydrated={isHydrated}
        isLoading={isLoading}
        isTranslationReady={isTranslationReady}
        currentLanguage={currentLanguage}
      />
    );
  }

  // 준비 완료 시 children 렌더링
  return (
    <>
      {children}
      <DebugInfo 
        mounted={mounted}
        isHydrated={isHydrated}
        isLoading={isLoading}
        isTranslationReady={isTranslationReady}
        currentLanguage={currentLanguage}
      />
    </>
  );
});

LanguageSyncProviderComponent.displayName = 'LanguageSyncProvider';

export { LanguageSyncProviderComponent as LanguageSyncProvider }; 