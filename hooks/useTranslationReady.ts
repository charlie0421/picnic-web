import { useLanguageStore } from '@/stores/languageStore';

/**
 * 현재 언어의 번역이 완전히 로드되었는지 확인하는 훅
 * hydration 상태, 로딩 상태, 번역 데이터 존재 여부를 모두 확인하여 
 * 서버-클라이언트 불일치와 국제화 키 노출을 방지합니다.
 * @returns {boolean} 번역이 완전히 준비되었으면 true, 아니면 false
 */
export function useTranslationReady(): boolean {
  const { 
    currentLanguage, 
    translations, 
    isTranslationLoaded, 
    isHydrated, 
    isLoading 
  } = useLanguageStore();

  return (
    isHydrated && // hydration 완료 확인
    !isLoading && // 로딩 중이 아님을 확인
    isTranslationLoaded[currentLanguage] && // 번역 로드 완료 표시
    translations[currentLanguage] && // 번역 객체 존재 확인
    Object.keys(translations[currentLanguage]).length > 0 // 실제 번역 데이터 존재 확인
  );
} 