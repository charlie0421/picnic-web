'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLanguageStore } from '../stores/languageStore';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from '../config/settings';

interface LocaleRouterReturn {
  currentLocale: Language;
  supportedLocales: readonly Language[];
  defaultLocale: Language;
  push: (href: string, locale?: Language) => void;
  replace: (href: string, locale?: Language) => void;
  refresh: () => void;
  changeLocale: (locale: Language, preservePath?: boolean) => void;
  getLocalizedPath: (path: string, locale?: Language) => string;
  isValidLocale: (locale: string) => locale is Language;
  removeLocaleFromPath: (path: string) => string;
  extractLocaleFromPath: (path: string) => { locale: Language; path: string };
  loadTranslations: (locale: Language) => Promise<boolean>;
  t: (key: string, args?: Record<string, string>) => string;
}

/**
 * Hook for locale-based routing with local translations
 * 로케일 기반 라우팅과 로컬 번역 시스템을 위한 Hook
 */
export function useLocaleRouter(): LocaleRouterReturn {
  const router = useRouter();
  const pathname = usePathname();
  const { currentLanguage, setLanguage, translations, loadTranslations: storeLoadTranslations, t: storeT } = useLanguageStore();

  // 로케일 유효성 검사
  const isValidLocale = (locale: string): locale is Language => {
    return SUPPORTED_LANGUAGES.includes(locale as Language);
  };

  // 현재 경로에서 로케일 추출
  const extractLocaleFromPath = (path: string): { locale: Language; path: string } => {
    const segments = path.split('/').filter(Boolean);
    const firstSegment = segments[0];
    
    if (firstSegment && isValidLocale(firstSegment)) {
      return {
        locale: firstSegment as Language,
        path: '/' + segments.slice(1).join('/')
      };
    }
    
    return {
      locale: DEFAULT_LANGUAGE,
      path: path
    };
  };

  // 현재 로케일 감지
  const { locale: currentLocale } = extractLocaleFromPath(pathname);

  // 경로에서 로케일 제거
  const removeLocaleFromPath = (path: string): string => {
    const { path: cleanPath } = extractLocaleFromPath(path);
    return cleanPath || '/';
  };

  // 로케일화된 경로 생성
  const getLocalizedPath = (path: string, locale?: Language): string => {
    const targetLocale = locale || currentLocale;
    const cleanPath = removeLocaleFromPath(path);
    
    // 🔧 모든 언어에 대해 일관된 prefix 적용 (영어 포함)
    // DEFAULT_LANGUAGE 특별 처리 제거: app/[lang] 구조에서는 모든 언어가 prefix 필요
    return `/${targetLocale}${cleanPath === '/' ? '' : cleanPath}`;
  };

  // 네비게이션 함수들
  const push = (href: string, locale?: Language) => {
    const localizedHref = getLocalizedPath(href, locale);
    router.push(localizedHref);
  };

  const replace = (href: string, locale?: Language) => {
    const localizedHref = getLocalizedPath(href, locale);
    router.replace(localizedHref);
  };

  const refresh = () => {
    router.refresh();
  };

  // 로케일 변경
  const changeLocale = async (locale: Language, preservePath = true) => {
    if (!isValidLocale(locale) || locale === currentLocale) {
      return;
    }

    // 언어 스토어 업데이트
    setLanguage(locale);

    // 쿠키에 언어 설정 저장
    if (typeof document !== 'undefined') {
      document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }

    // 로컬 번역 로드
    await loadTranslations(locale);

    // 경로 변경
    if (preservePath) {
      const currentPath = removeLocaleFromPath(pathname);
      const newPath = getLocalizedPath(currentPath, locale);
      router.push(newPath);
    } else {
      const newPath = getLocalizedPath('/', locale);
      router.push(newPath);
    }
  };

  // 로컬 번역 로드
  const loadTranslations = async (locale: Language): Promise<boolean> => {
    try {
      // 기존 스토어의 loadTranslations 함수 사용 (로컬 JSON에서 로드)
      await storeLoadTranslations(locale);
      return true;
    } catch (error) {
      console.error(`Failed to load translations for ${locale}:`, error);
      return false;
    }
  };

  // 번역 함수 (스토어의 t 함수 사용)
  const t = (key: string, args?: Record<string, string>): string => {
    return storeT(key, args);
  };

  return {
    currentLocale,
    supportedLocales: SUPPORTED_LANGUAGES,
    defaultLocale: DEFAULT_LANGUAGE,
    push,
    replace,
    refresh,
    changeLocale,
    getLocalizedPath,
    isValidLocale,
    removeLocaleFromPath,
    extractLocaleFromPath,
    loadTranslations,
    t,
  };
} 