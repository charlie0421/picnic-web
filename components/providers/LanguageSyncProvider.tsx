'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { Language, settings } from '@/config/settings';
import { TranslationSuspenseProvider } from './TranslationSuspenseProvider';

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
 * 언어 동기화 Provider
 * URL 경로와 Zustand 스토어를 동기화하고 hydration 문제를 해결합니다.
 */
export function LanguageSyncProvider({ children, initialLanguage }: LanguageSyncProviderProps) {
  const pathname = usePathname();
  const { 
    currentLanguage, 
    syncLanguageWithPath, 
    setCurrentLang, 
    isHydrated, 
    setHydrated 
  } = useLanguageStore();
  
  const [isClientHydrated, setIsClientHydrated] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<Language>(
    initialLanguage as Language || extractLanguageFromPath(pathname)
  );
  
  // 마지막으로 처리된 경로를 추적하여 중복 처리 방지
  const lastProcessedPath = useRef<string>('');
  const syncInProgress = useRef<boolean>(false);

  // 클라이언트 사이드 hydration 완료 감지
  useEffect(() => {
    console.log('🔄 [LanguageSyncProvider] Client hydration starting');
    setIsClientHydrated(true);
    
    // 스토어의 hydration 상태가 아직 설정되지 않은 경우 설정
    if (!isHydrated) {
      console.log('🔄 [LanguageSyncProvider] Setting store hydration complete');
      setHydrated(true);
    }
  }, [isHydrated, setHydrated]);

  // URL 경로 변경 감지 및 언어 업데이트
  useEffect(() => {
    if (!isClientHydrated || !isHydrated || syncInProgress.current) {
      return;
    }

    // 이미 처리된 경로인지 확인
    if (lastProcessedPath.current === pathname) {
      console.log(`🔄 [LanguageSyncProvider] Path ${pathname} already processed, skipping`);
      return;
    }

    const langFromPath = extractLanguageFromPath(pathname);
    setTargetLanguage(langFromPath);

    console.log('🔄 [LanguageSyncProvider] Path changed:', {
      pathname,
      langFromPath,
      currentLanguage,
      isHydrated,
      isClientHydrated,
      lastProcessed: lastProcessedPath.current
    });

    // 언어가 다른 경우 즉시 업데이트
    if (langFromPath !== currentLanguage) {
      console.log(`🔄 [LanguageSyncProvider] Updating language from ${currentLanguage} to ${langFromPath}`);
      setCurrentLang(langFromPath);
    }

    // 동기화 실행 (한 번만)
    syncInProgress.current = true;
    syncLanguageWithPath().finally(() => {
      syncInProgress.current = false;
      lastProcessedPath.current = pathname;
    });
  }, [pathname, isClientHydrated, isHydrated, currentLanguage, syncLanguageWithPath, setCurrentLang]);

  // 초기 언어 설정 (서버에서 전달받은 언어)
  useEffect(() => {
    if (!isClientHydrated || !isHydrated || !initialLanguage) return;
    
    if (initialLanguage !== currentLanguage) {
      console.log(`🔄 [LanguageSyncProvider] Setting initial language: ${initialLanguage}`);
      setCurrentLang(initialLanguage as Language);
      setTargetLanguage(initialLanguage as Language);
    }
  }, [initialLanguage, currentLanguage, isClientHydrated, isHydrated, setCurrentLang]);

  // hydration이 완료되지 않은 경우 로딩 표시
  if (!isClientHydrated || !isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">언어 설정을 로드하는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <TranslationSuspenseProvider language={targetLanguage} key={targetLanguage}>
      {children}
    </TranslationSuspenseProvider>
  );
} 