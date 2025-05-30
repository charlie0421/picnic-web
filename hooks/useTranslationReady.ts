import { useLanguageStore } from '@/stores/languageStore';

/**
 * 현재 언어의 번역이 완전히 로드되었는지 확인하는 훅
 * hydration 상태도 함께 확인하여 서버-클라이언트 불일치를 방지합니다.
 * @returns {boolean} 번역이 로드되고 hydration이 완료되었으면 true, 아니면 false
 */
export function useTranslationReady(): boolean {
  const { currentLanguage, translations, isTranslationLoaded, isHydrated } = useLanguageStore();

  return (
    isHydrated && // hydration 완료 확인
    isTranslationLoaded[currentLanguage] && 
    translations[currentLanguage] && 
    Object.keys(translations[currentLanguage]).length > 0
  );
} 