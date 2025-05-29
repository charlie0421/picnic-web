'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Language, SUPPORTED_LANGUAGES } from '@/config/settings';

/**
 * 언어 인식 라우터 훅
 * 
 * 현재 언어 컨텍스트를 유지하면서 네비게이션을 제공합니다.
 * 
 * 주요 기능:
 * - 언어 프리픽스 자동 추가
 * - 현재 언어 감지
 * - 언어별 경로 생성
 * - 언어 변경 시 경로 유지
 */
export function useLocaleRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale() as Language;

  /**
   * 언어 프리픽스를 포함한 경로로 이동
   */
  const push = (href: string) => {
    const finalPath = href.startsWith('/') ? `/${currentLocale}${href}` : href;
    router.push(finalPath);
  };

  /**
   * 언어 프리픽스를 포함한 경로로 교체
   */
  const replace = (href: string) => {
    const finalPath = href.startsWith('/') ? `/${currentLocale}${href}` : href;
    router.replace(finalPath);
  };

  /**
   * 특정 언어로 경로 이동
   */
  const pushWithLanguage = (href: string, locale: Language = currentLocale) => {
    // href가 이미 언어 프리픽스를 포함하고 있는지 확인
    const pathSegments = href.split('/');
    const hasLocalePrefix = pathSegments.length > 1 && 
                           SUPPORTED_LANGUAGES.includes(pathSegments[1] as Language);
    
    let finalPath: string;
    
    if (hasLocalePrefix) {
      // 이미 언어 프리픽스가 있으면 교체
      pathSegments[1] = locale;
      finalPath = pathSegments.join('/');
    } else {
      // 언어 프리픽스가 없으면 추가
      finalPath = href.startsWith('/') ? `/${locale}${href}` : `/${locale}/${href}`;
    }
    
    router.push(finalPath);
  };

  /**
   * 특정 언어로 경로 교체
   */
  const replaceWithLanguage = (href: string, locale: Language = currentLocale) => {
    const pathSegments = href.split('/');
    const hasLocalePrefix = pathSegments.length > 1 && 
                           SUPPORTED_LANGUAGES.includes(pathSegments[1] as Language);
    
    let finalPath: string;
    
    if (hasLocalePrefix) {
      pathSegments[1] = locale;
      finalPath = pathSegments.join('/');
    } else {
      finalPath = href.startsWith('/') ? `/${locale}${href}` : `/${locale}/${href}`;
    }
    
    router.replace(finalPath);
  };

  /**
   * 현재 경로에서 언어 프리픽스를 제거한 경로 반환
   */
  const getPathnameWithoutLocale = (): string => {
    const pathSegments = pathname.split('/');
    
    // 첫 번째 세그먼트가 언어 코드인지 확인
    if (pathSegments.length > 1 && SUPPORTED_LANGUAGES.includes(pathSegments[1] as Language)) {
      // 언어 코드 제거
      return '/' + pathSegments.slice(2).join('/');
    }
    
    return pathname;
  };

  /**
   * 특정 언어로 현재 경로 생성
   */
  const getPathnameWithLocale = (locale: Language): string => {
    const pathnameWithoutLocale = getPathnameWithoutLocale();
    return `/${locale}${pathnameWithoutLocale === '/' ? '' : pathnameWithoutLocale}`;
  };

  /**
   * 언어 변경 (경로 유지)
   */
  const changeLanguage = (newLocale: Language) => {
    const currentPathWithoutLocale = getPathnameWithoutLocale();
    pushWithLanguage(currentPathWithoutLocale, newLocale);
  };

  /**
   * 언어가 포함된 절대 URL 생성
   */
  const createLocalizedUrl = (href: string, locale: Language = currentLocale): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const localizedPath = href.startsWith('/') ? `/${locale}${href}` : `/${locale}/${href}`;
    return `${baseUrl}${localizedPath}`;
  };

  /**
   * 현재 경로가 특정 경로와 일치하는지 확인 (언어 프리픽스 무시)
   */
  const isCurrentPath = (href: string): boolean => {
    const normalizedHref = href.startsWith('/') ? href : `/${href}`;
    const currentPathWithoutLocale = getPathnameWithoutLocale();
    return currentPathWithoutLocale === normalizedHref;
  };

  return {
    // 기본 네비게이션
    push,
    replace,
    
    // 언어 인식 네비게이션
    pushWithLanguage,
    replaceWithLanguage,
    changeLanguage,
    
    // 유틸리티
    getPathnameWithoutLocale,
    getPathnameWithLocale,
    createLocalizedUrl,
    isCurrentPath,
    
    // 현재 상태
    currentLocale,
    pathname,
  };
} 