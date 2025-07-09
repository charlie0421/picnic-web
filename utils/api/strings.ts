import {useLanguageStore} from "@/stores/languageStore";

/**
 * 번역 객체에서 유효한 값이 있는지 확인하는 헬퍼 함수
 */
const hasValidTranslation = (value: { [key: string]: string } | string | null | any): boolean => {
  if (!value) return false;
  if (typeof value === "string") return value.trim() !== '';
  if (typeof value === "number") return true;
  
  // 객체인 경우, 모든 값이 빈 문자열인지 확인
  if (typeof value === "object") {
    return Object.values(value).some(v => 
      typeof v === 'string' && v.trim() !== ''
    );
  }
  
  return false;
};

/**
 * 번역 객체가 유효한 번역을 가지고 있는지 확인하는 공개 함수
 */
export const hasValidLocalizedString = (
  value: { [key: string]: string } | string | null | any
): boolean => {
  return hasValidTranslation(value);
};

export const getLocalizedString = (
    value: { [key: string]: string } | string | null | any,
    currentLang?: string,
  ): string => {
    if (!value) return '';
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return value.toString();

    // 먼저 유효한 번역이 있는지 확인
    if (!hasValidTranslation(value)) {
      return '';
    }

    // currentLang이 제공되지 않은 경우에만 store에서 가져옴
    if (!currentLang) {
      try {
        // 서버 사이드에서는 기본값 사용
        if (typeof window === "undefined") {
          currentLang = "en";
        } else {
          const store = useLanguageStore.getState();
          currentLang = store.currentLanguage || "en";
        }
      } catch (error) {
        console.error('Error getting current language:', error);
        currentLang = "en";
      }
    }

    // 현재 언어의 번역이 있고 빈 문자열이 아니면 반환
    if (value[currentLang] && value[currentLang].trim() !== '') {
      return value[currentLang].trim();
    }

    // 현재 언어의 번역이 없거나 빈 문자열이면 영어로 폴백 (빈 문자열이 아닌 경우만)
    if (value["en"] && value["en"].trim() !== '') {
      return value["en"].trim();
    }

    // 영어 번역도 없거나 빈 문자열이면 첫 번째 유효한 번역 찾기
    for (const lang of Object.keys(value)) {
      if (value[lang] && value[lang].trim() !== '') {
        return value[lang].trim();
      }
    }

    return '';
  };

export const getLocalizedJson = (
    value: { [key: string]: any } | null | any,
    currentLang?: string,
  ): any => {
    if (!value) return null;
    if (typeof value === "string") return value.trim() !== '' ? value.trim() : null;
    if (typeof value === "number") return value;

    // 먼저 유효한 번역이 있는지 확인
    if (!hasValidTranslation(value)) {
      return null;
    }

    // currentLang이 제공되지 않은 경우에만 store에서 가져옴
    if (!currentLang) {
      try {
        // 서버 사이드에서는 기본값 사용
        if (typeof window === "undefined") {
          currentLang = "en";
        } else {
          const store = useLanguageStore.getState();
          currentLang = store.currentLanguage || "en";
        }
      } catch (error) {
        console.error('Error getting current language:', error);
        currentLang = "en";
      }
    }

    // 현재 언어의 번역이 있고 빈 문자열이 아니면 반환
    if (value[currentLang] && value[currentLang].trim() !== '') {
      return value[currentLang];
    }

    // 현재 언어의 번역이 없거나 빈 문자열이면 영어로 폴백
    if (value["en"] && value["en"].trim() !== '') {
      return value["en"];
    }

    // 영어 번역도 없거나 빈 문자열이면 첫 번째 유효한 번역 찾기
    for (const lang of Object.keys(value)) {
      if (value[lang] && value[lang].trim() !== '') {
        return value[lang];
      }
    }

    return null;
  };
