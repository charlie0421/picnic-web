import { useLanguageStore } from '@/stores/languageStore';
import { useTranslationReady } from './useTranslationReady';

interface SafeTranslationOptions {
  fallback?: string;
  showPlaceholder?: boolean;
}

/**
 * 번역이 준비되지 않았을 때도 안전하게 사용할 수 있는 번역 훅
 * 
 * @param options 옵션 객체
 * @param options.fallback 번역이 준비되지 않았을 때 반환할 기본값
 * @param options.showPlaceholder 번역 로딩 중일 때 플레이스홀더 표시 여부
 * @returns 안전한 번역 함수와 준비 상태
 */
export function useSafeTranslation(options: SafeTranslationOptions = {}) {
  const { t: originalT } = useLanguageStore();
  const isReady = useTranslationReady();
  const { fallback = '', showPlaceholder = false } = options;

  /**
   * 안전한 번역 함수
   * 번역이 준비되지 않았을 때는 fallback이나 빈 문자열을 반환
   */
  const t = (key: string, args?: Record<string, string>): string => {
    // 번역이 준비되지 않은 경우
    if (!isReady) {
      if (showPlaceholder) {
        return '...'; // 로딩 플레이스홀더
      }
      return fallback;
    }

    // 번역이 준비된 경우 원래 함수 사용
    return originalT(key, args);
  };

  /**
   * 조건부 번역 함수 - 번역이 준비된 경우에만 렌더링
   * 번역이 준비되지 않은 경우 null 반환하여 렌더링 자체를 방지
   */
  const tConditional = (key: string, args?: Record<string, string>): string | null => {
    if (!isReady) {
      return null;
    }
    return originalT(key, args);
  };

  /**
   * 번역이 준비되지 않은 경우 키를 대괄호로 감싸서 반환 (개발용)
   */
  const tDebug = (key: string, args?: Record<string, string>): string => {
    if (!isReady) {
      if (process.env.NODE_ENV === 'development') {
        return `[${key}]`;
      }
      return fallback;
    }
    return originalT(key, args);
  };

  return {
    t,
    tConditional,
    tDebug,
    isReady,
    isLoading: !isReady
  };
} 