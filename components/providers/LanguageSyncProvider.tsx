'use client';

import { useEffect, useState, memo, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguageStore } from '@/stores/languageStore';
import { Language, settings } from '@/config/settings';
type IdleCallback = () => void;

const runWhenIdle = (callback: IdleCallback) => {
  if (typeof window === 'undefined') {
    setTimeout(callback, 0);
    return;
  }

  const ric = (window as typeof window & { requestIdleCallback?: (cb: IdleCallback) => void })
    .requestIdleCallback;

  if (typeof ric === 'function') {
    ric(callback);
  } else {
    setTimeout(callback, 600);
  }
};

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
const ENABLE_LANGUAGE_DEBUG =
  process.env.NEXT_PUBLIC_ENABLE_LANGUAGE_DEBUG === 'true';

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
  if (!ENABLE_LANGUAGE_DEBUG) return null;

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
  const hasDetectedDeviceLanguage = useRef(false);

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

  // 처음 실행 시 디바이스 언어 감지 및 DB 업데이트
  useEffect(() => {
    if (!mounted || hasDetectedDeviceLanguage.current) return;
    
    const detectAndUpdateDeviceLanguage = async () => {
      try {
        // 쿠키나 로컬 스토리지에 저장된 언어가 있는지 확인
        const cookieMatch = typeof document !== 'undefined' 
          ? document.cookie.match(/(?:^|; )locale=([^;]+)/)
          : null;
        const savedLanguage = cookieMatch ? cookieMatch[1] : null;
        
        // 저장된 언어가 없거나 기본값인 경우에만 디바이스 언어 감지
        if (!savedLanguage || savedLanguage === settings.languages.default) {
          const deviceLanguage = navigator.language || (navigator as any).userLanguage;
          const deviceLangCode = deviceLanguage.split('-')[0].toLowerCase();
          
          // 지원되는 언어인지 확인
          let detectedLanguage: Language | null = null;
          
          if (settings.languages.supported.includes(deviceLangCode as Language)) {
            detectedLanguage = deviceLangCode as Language;
          } else if (deviceLanguage.toLowerCase().startsWith('zh')) {
            // 중국어 처리
            if (deviceLanguage.toLowerCase().includes('tw') || deviceLanguage.toLowerCase().includes('hk')) {
              detectedLanguage = 'zh-tw';
            } else {
              detectedLanguage = 'zh-cn';
            }
          }
          
          if (detectedLanguage && detectedLanguage !== currentLanguage) {
            console.log(`🌐 [LanguageSyncProvider] Detected device language: ${detectedLanguage} (device: ${deviceLanguage})`);
            
            // 언어 스토어 업데이트
            setCurrentLang(detectedLanguage);
            
            // 쿠키에 저장
            if (typeof document !== 'undefined') {
              document.cookie = `locale=${detectedLanguage}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
            }
            
            // user_profiles.language 업데이트 (로그인한 사용자인 경우에만)
            try {
              const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
              const supabase = createBrowserSupabaseClient();
              const { data: { user } } = await supabase.auth.getUser();
              
              if (user) {
                // 언어 코드 정규화 (zh-cn -> zh, zh-tw -> zh-TW 등)
                let normalizedLanguage: string = detectedLanguage;
                if (detectedLanguage === 'zh-cn') {
                  normalizedLanguage = 'zh';
                } else if (detectedLanguage === 'zh-tw') {
                  normalizedLanguage = 'zh-TW';
                }
                
                const { error } = await (supabase as any)
                  .from('user_profiles')
                  .update({ language: normalizedLanguage })
                  .eq('id', user.id);
                
                if (error) {
                  console.warn('Failed to update user_profiles.language (device detection):', error);
                } else {
                  console.log('Updated user_profiles.language to:', normalizedLanguage, '(from device)');
                }
              }
            } catch (error) {
              console.warn('Failed to update user_profiles.language (device detection):', error);
            }
          }
        }
        
        hasDetectedDeviceLanguage.current = true;
      } catch (error) {
        console.warn('Failed to detect device language:', error);
        hasDetectedDeviceLanguage.current = true;
      }
    };
    
    runWhenIdle(detectAndUpdateDeviceLanguage);
  }, [mounted, currentLanguage, setCurrentLang]);

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