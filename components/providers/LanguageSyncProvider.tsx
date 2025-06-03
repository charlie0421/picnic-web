'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { Language, settings } from '@/config/settings';
import { TranslationSuspenseProvider } from './TranslationSuspenseProvider';
import { 
  detectUserLanguage, 
  logLanguageDetection, 
  persistLanguageSelection, 
  isValidLanguage 
} from '@/utils/language-detection';

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
 * 강화된 언어 동기화 Provider
 * - 스마트 언어 감지 (브라우저, localStorage, 쿠키)
 * - URL 경로와 Zustand 스토어 동기화
 * - Hydration 문제 해결
 * - 언어 우선순위 처리
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
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 마지막으로 처리된 경로를 추적하여 중복 처리 방지
  const lastProcessedPath = useRef<string>('');
  const syncInProgress = useRef<boolean>(false);
  const initialDetectionDone = useRef<boolean>(false);

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

  // 초기 언어 감지 및 설정 (한 번만 실행)
  useEffect(() => {
    if (!isClientHydrated || !isHydrated || initialDetectionDone.current) {
      return;
    }

    console.log('🌐 [LanguageSyncProvider] Starting initial language detection');
    
    const pathLanguage = extractLanguageFromPath(pathname);
    const detectionResult = detectUserLanguage(pathLanguage);
    
    logLanguageDetection(detectionResult);

    // 감지된 언어가 현재 언어와 다른 경우 업데이트
    if (detectionResult.detectedLanguage !== currentLanguage) {
      console.log(
        `🌐 [LanguageSyncProvider] Language changed: ${currentLanguage} → ${detectionResult.detectedLanguage} (${detectionResult.mappingSource})`
      );
      setCurrentLang(detectionResult.detectedLanguage);
      setTargetLanguage(detectionResult.detectedLanguage);
    }

    // 초기 언어 설정이 제공된 경우 우선 적용
    if (initialLanguage && isValidLanguage(initialLanguage) && initialLanguage !== currentLanguage) {
      console.log(`🌐 [LanguageSyncProvider] Applying initial language: ${initialLanguage}`);
      setCurrentLang(initialLanguage as Language);
      setTargetLanguage(initialLanguage as Language);
      persistLanguageSelection(initialLanguage as Language);
    }

    initialDetectionDone.current = true;
    setIsInitialized(true);
  }, [isClientHydrated, isHydrated, currentLanguage, setCurrentLang, pathname, initialLanguage]);

  // URL 경로 변경 감지 및 언어 업데이트
  useEffect(() => {
    if (!isClientHydrated || !isHydrated || !isInitialized || syncInProgress.current) {
      return;
    }

    // 이미 처리된 경로인지 확인
    if (lastProcessedPath.current === pathname) {
      console.log(`🔄 [LanguageSyncProvider] Path ${pathname} already processed, skipping`);
      return;
    }

    const langFromPath = extractLanguageFromPath(pathname);
    
    console.log('🔄 [LanguageSyncProvider] Path changed:', {
      pathname,
      langFromPath,
      currentLanguage,
      isHydrated,
      isClientHydrated,
      isInitialized,
      lastProcessed: lastProcessedPath.current
    });

    // URL에서 추출한 언어가 현재 언어와 다른 경우
    if (langFromPath !== currentLanguage) {
      console.log(`🔄 [LanguageSyncProvider] Updating language from ${currentLanguage} to ${langFromPath}`);
      setCurrentLang(langFromPath);
      setTargetLanguage(langFromPath);
      
      // 언어 변경 시 설정 저장
      persistLanguageSelection(langFromPath);
    }

    // 동기화 실행 (한 번만)
    syncInProgress.current = true;
    syncLanguageWithPath().finally(() => {
      syncInProgress.current = false;
      lastProcessedPath.current = pathname;
    });
  }, [pathname, isClientHydrated, isHydrated, isInitialized, currentLanguage, syncLanguageWithPath, setCurrentLang]);

  // 언어 변경 감지 및 지속성 처리
  useEffect(() => {
    if (!isClientHydrated || !currentLanguage) return;

    // 언어가 변경되면 localStorage에 저장
    persistLanguageSelection(currentLanguage);
  }, [currentLanguage, isClientHydrated]);

  // 로딩 상태 계산
  const isLoading = !isClientHydrated || !isHydrated || !isInitialized;

  // 디버깅 정보 출력
  useEffect(() => {
    if (isInitialized) {
      console.log('🌐 [LanguageSyncProvider] State:', {
        isClientHydrated,
        isHydrated,
        isInitialized,
        currentLanguage,
        targetLanguage,
        pathname,
        isLoading
      });
    }
  }, [isClientHydrated, isHydrated, isInitialized, currentLanguage, targetLanguage, pathname, isLoading]);

  return (
    <TranslationSuspenseProvider language={targetLanguage} key={targetLanguage}>
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600 text-sm">언어 설정을 로드하는 중...</p>
            <p className="text-gray-400 text-xs mt-1">
              {!isClientHydrated && 'Hydrating...'}
              {isClientHydrated && !isHydrated && 'Loading store...'}
              {isClientHydrated && isHydrated && !isInitialized && 'Detecting language...'}
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </TranslationSuspenseProvider>
  );
} 