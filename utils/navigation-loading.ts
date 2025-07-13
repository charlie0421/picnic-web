import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from '@/config/settings';

/**
 * 경로에서 언어 코드를 추출하는 함수
 */
export function extractLocaleFromPath(path: string): { locale: Language; path: string } {
  const segments = path.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  if (firstSegment && SUPPORTED_LANGUAGES.includes(firstSegment as Language)) {
    return {
      locale: firstSegment as Language,
      path: '/' + segments.slice(1).join('/')
    };
  }
  
  return {
    locale: DEFAULT_LANGUAGE,
    path: path
  };
}

/**
 * 경로에서 언어 코드를 제거하는 함수
 */
export function removeLocaleFromPath(path: string): string {
  const { path: cleanPath } = extractLocaleFromPath(path);
  return cleanPath || '/';
}

/**
 * 현재 경로와 타겟 경로가 같은지 확인하는 함수 (기존 함수 - 하위 호환성 유지)
 */
export function isSamePage(currentPath: string, targetPath: string): boolean {
  return currentPath === targetPath;
}

/**
 * 언어 경로를 고려하여 현재 경로와 타겟 경로가 같은지 확인하는 함수
 */
export function isSamePageWithLocale(currentPath: string, targetPath: string): boolean {
  const currentCleanPath = removeLocaleFromPath(currentPath);
  const targetCleanPath = removeLocaleFromPath(targetPath);
  
  return currentCleanPath === targetCleanPath;
}

/**
 * 경로를 현재 언어로 정규화하는 함수
 */
export function normalizePathWithLocale(path: string, currentLocale: Language): string {
  const cleanPath = removeLocaleFromPath(path);
  return `/${currentLocale}${cleanPath === '/' ? '' : cleanPath}`;
}

/**
 * 두 경로가 동일한 언어를 사용하는지 확인하는 함수
 */
export function hasSameLocale(path1: string, path2: string): boolean {
  const { locale: locale1 } = extractLocaleFromPath(path1);
  const { locale: locale2 } = extractLocaleFromPath(path2);
  
  return locale1 === locale2;
} 