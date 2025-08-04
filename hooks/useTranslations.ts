'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { SupportedLanguage } from '@/types/mypage-common';

// 번역 캐시
const translationCache = new Map<string, Record<string, any>>();
const loadingPromises = new Map<string, Promise<Record<string, any>>>();

// 타입 안전한 번역 키 정의
export type TranslationKey = 
  // ... (기존 키 생략)
  | 'login_terms_notice_html'
  // ... (기존 키 생략)
  ;

// 기본 번역문 (폴백용)
const DEFAULT_TRANSLATIONS: Record<string, string> = {
  // ... (기존 번역 생략)
  login_terms_notice_html:
    'By signing up, you agree to our <a href="/{termsUrl}" class="font-semibold text-blue-600 hover:underline">Terms of Service</a> and <a href="/{privacyUrl}" class="font-semibold text-blue-600 hover:underline">Privacy Policy</a>.',
  // ... (기존 번역 생략)
};

export function useTranslations() {
  const pathname = usePathname();
  const [translations, setTranslations] = useState<Record<string, any>>(DEFAULT_TRANSLATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentLangRef = useRef<SupportedLanguage>('en');

  // 현재 언어 추출
  const getCurrentLanguage = useCallback((): SupportedLanguage => {
    const lang = pathname.split('/')[1];
    switch (lang) {
      case 'ko':
        return 'ko';
      case 'ja':
        return 'ja';
      case 'zh':
        return 'zh';
      case 'id':
        return 'id';
      default:
        return 'en';
    }
  }, [pathname]);

  // 번역 파일 로드 함수
  const loadTranslations = useCallback(async (language: SupportedLanguage) => {
    const cacheKey = language;
    
    // 캐시에서 확인
    const cached = translationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 이미 로딩 중인지 확인
    const existingPromise = loadingPromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    // 새로운 로딩 프로미스 생성
    const loadingPromise = (async () => {
      try {
        const i18nModule = await import(`../public/locales/${language}.json`);
        const translations = i18nModule.default;
        
        // 캐시에 저장
        translationCache.set(cacheKey, translations);
        loadingPromises.delete(cacheKey);
        
        return translations;
      } catch (error) {
        console.warn(`번역 파일 로드 실패 (${language}):`, error);
        loadingPromises.delete(cacheKey);
        
        // 영어 폴백 시도
        if (language !== 'en') {
          try {
            const fallbackModule = await import('../public/locales/en.json');
            const fallbackTranslations = fallbackModule.default;
            translationCache.set('en', fallbackTranslations);
            return fallbackTranslations;
          } catch (fallbackError) {
            console.error('영어 폴백도 실패:', fallbackError);
            return DEFAULT_TRANSLATIONS;
          }
        }
        
        return DEFAULT_TRANSLATIONS;
      }
    })();

    loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }, []);

  // 언어 변경 감지 및 번역 로드
  useEffect(() => {
    const currentLang = getCurrentLanguage();
    
    // 언어가 변경되지 않았으면 스킵
    if (currentLang === currentLangRef.current && !isLoading) {
      return;
    }

    currentLangRef.current = currentLang;
    setIsLoading(true);
    setError(null);

    loadTranslations(currentLang)
      .then((loadedTranslations) => {
        setTranslations(loadedTranslations);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('번역 로드 실패:', error);
        setError(error instanceof Error ? error.message : 'Translation load failed');
        setTranslations(DEFAULT_TRANSLATIONS);
        setIsLoading(false);
      });
  }, [getCurrentLanguage, loadTranslations, isLoading]);

  // 타입 안전한 번역 함수
  const t = useCallback((key: TranslationKey, fallback?: string): string => {
    return translations[key] || fallback || DEFAULT_TRANSLATIONS[key] || key;
  }, [translations]);
  
  const tHtml = useCallback((key: TranslationKey, replacements: Record<string, string>): string => {
    let rawText = translations[key] || DEFAULT_TRANSLATIONS[key] || key;
    for (const [placeholder, value] of Object.entries(replacements)) {
      rawText = rawText.replace(new RegExp(`{${placeholder}}`, 'g'), value);
    }
    return rawText;
  }, [translations]);

  // 동적 키 지원 (기존 호환성)
  const tDynamic = useCallback((key: string, fallback?: string): string => {
    return translations[key] || fallback || key;
  }, [translations]);

  return {
    t,                      // 타입 안전한 번역 함수
    tHtml,                  // HTML 번역 지원 함수
    tDynamic,              // 동적 키 지원 번역 함수 (기존 호환성)
    translations,          // 전체 번역 객체 (기존 호환성)
    currentLanguage: getCurrentLanguage(),
    isLoading,
    error,
    reload: () => loadTranslations(getCurrentLanguage())
  };
}
// For simplicity, I'm keeping the rest of the file as is, but in a real scenario you'd want to add the new key to the TranslationKey type and DEFAULT_TRANSLATIONS object.
// To avoid making this a huge response, I will just show the changes needed.
// Assume the rest of the file is the same as before.

// In TranslationKey type:
// ... (other keys)
// | 'login_terms_notice_html'

// In DEFAULT_TRANSLATIONS:
// ... (other translations)
// login_terms_notice_html: 'By signing up, you agree to our <a href="/{termsUrl}" class="font-semibold text-blue-600 hover:underline">Terms of Service</a> and <a href="/{privacyUrl}" class="font-semibold text-blue-600 hover:underline">Privacy Policy</a>.',
