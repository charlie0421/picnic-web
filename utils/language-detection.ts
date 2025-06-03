import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from '@/config/settings';

/**
 * 브라우저 언어 감지 및 매핑 유틸리티
 */

interface LanguageDetectionResult {
  detectedLanguage: Language;
  mappingSource: 'exact' | 'partial' | 'fallback';
  browserLanguage?: string;
}

/**
 * 브라우저의 Accept-Language 헤더나 navigator.language에서 언어 감지
 */
export function detectBrowserLanguage(): string | null {
  if (typeof window === 'undefined') {
    return null; // 서버 사이드에서는 감지 불가
  }

  // navigator.language 우선 사용
  if (navigator.language) {
    return navigator.language;
  }

  // navigator.languages 배열에서 첫 번째 언어 사용
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages[0];
  }

  return null;
}

/**
 * 쿠키에서 언어 설정 읽기
 */
export function getLanguageFromCookie(): Language | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'locale' || name === 'language') {
      const decodedValue = decodeURIComponent(value);
      if (SUPPORTED_LANGUAGES.includes(decodedValue as Language)) {
        return decodedValue as Language;
      }
    }
  }

  return null;
}

/**
 * localStorage에서 언어 설정 읽기
 */
export function getLanguageFromLocalStorage(): Language | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 다양한 키에서 언어 설정 확인
    const possibleKeys = ['language', 'locale', 'picnic-language', 'language-preference'];
    
    for (const key of possibleKeys) {
      const stored = localStorage.getItem(key);
      if (stored && SUPPORTED_LANGUAGES.includes(stored as Language)) {
        return stored as Language;
      }
    }

    // Zustand persist store에서 확인
    const zustandStore = localStorage.getItem('language-store');
    if (zustandStore) {
      try {
        const parsed = JSON.parse(zustandStore);
        const currentLanguage = parsed.state?.currentLanguage;
        if (currentLanguage && SUPPORTED_LANGUAGES.includes(currentLanguage)) {
          return currentLanguage as Language;
        }
      } catch (e) {
        console.warn('Failed to parse Zustand language store:', e);
      }
    }
  } catch (error) {
    console.warn('Failed to read from localStorage:', error);
  }

  return null;
}

/**
 * 언어 설정을 localStorage에 저장
 */
export function saveLanguageToLocalStorage(language: Language): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem('language', language);
    localStorage.setItem('locale', language);
    localStorage.setItem('picnic-language', language);
    
    // 쿠키에도 저장 (서버 사이드에서 읽을 수 있도록)
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1); // 1년간 유지
    document.cookie = `locale=${language}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
  } catch (error) {
    console.warn('Failed to save language to localStorage:', error);
  }
}

/**
 * 감지된 언어를 지원되는 언어로 매핑
 */
export function mapLanguageToSupported(detectedLanguage: string): LanguageDetectionResult {
  if (!detectedLanguage) {
    return {
      detectedLanguage: DEFAULT_LANGUAGE,
      mappingSource: 'fallback'
    };
  }

  const normalizedLanguage = detectedLanguage.toLowerCase();

  // 정확한 매치 확인 (예: 'ko', 'en')
  if (SUPPORTED_LANGUAGES.includes(normalizedLanguage as Language)) {
    return {
      detectedLanguage: normalizedLanguage as Language,
      mappingSource: 'exact',
      browserLanguage: detectedLanguage
    };
  }

  // 부분 매치 확인 (예: 'ko-KR' -> 'ko', 'en-US' -> 'en')
  const languageCode = normalizedLanguage.split('-')[0];
  if (SUPPORTED_LANGUAGES.includes(languageCode as Language)) {
    return {
      detectedLanguage: languageCode as Language,
      mappingSource: 'partial',
      browserLanguage: detectedLanguage
    };
  }

  // 지역별 매핑
  const regionMappings: Record<string, Language> = {
    // 중국어 변형들
    'zh-cn': 'zh',
    'zh-tw': 'zh',
    'zh-hk': 'zh',
    'zh-sg': 'zh',
    // 일본어
    'ja-jp': 'ja',
    // 인도네시아어
    'id-id': 'id',
    'ms-my': 'id', // 말레이시아어 -> 인도네시아어로 매핑
    // 영어 변형들
    'en-us': 'en',
    'en-gb': 'en',
    'en-au': 'en',
    'en-ca': 'en',
    // 한국어
    'ko-kr': 'ko',
  };

  const mappedLanguage = regionMappings[normalizedLanguage];
  if (mappedLanguage) {
    return {
      detectedLanguage: mappedLanguage,
      mappingSource: 'partial',
      browserLanguage: detectedLanguage
    };
  }

  // 매핑되지 않는 경우 기본 언어 반환
  return {
    detectedLanguage: DEFAULT_LANGUAGE,
    mappingSource: 'fallback',
    browserLanguage: detectedLanguage
  };
}

/**
 * 우선순위에 따른 언어 감지
 * 1. URL 파라미터 (현재 경로)
 * 2. localStorage
 * 3. 쿠키
 * 4. 브라우저 설정
 * 5. 기본 언어
 */
export function detectUserLanguage(currentPathLanguage?: Language): LanguageDetectionResult {
  // 1. URL 경로에서 언어가 명시적으로 지정된 경우 우선
  if (currentPathLanguage && SUPPORTED_LANGUAGES.includes(currentPathLanguage)) {
    return {
      detectedLanguage: currentPathLanguage,
      mappingSource: 'exact'
    };
  }

  // 2. localStorage 확인
  const storedLanguage = getLanguageFromLocalStorage();
  if (storedLanguage) {
    return {
      detectedLanguage: storedLanguage,
      mappingSource: 'exact'
    };
  }

  // 3. 쿠키 확인
  const cookieLanguage = getLanguageFromCookie();
  if (cookieLanguage) {
    return {
      detectedLanguage: cookieLanguage,
      mappingSource: 'exact'
    };
  }

  // 4. 브라우저 언어 감지 및 매핑
  const browserLanguage = detectBrowserLanguage();
  if (browserLanguage) {
    return mapLanguageToSupported(browserLanguage);
  }

  // 5. 기본 언어로 폴백
  return {
    detectedLanguage: DEFAULT_LANGUAGE,
    mappingSource: 'fallback'
  };
}

/**
 * 언어 감지 결과를 로깅하는 헬퍼 함수
 */
export function logLanguageDetection(result: LanguageDetectionResult): void {
  console.log('🌐 [Language Detection]', {
    detected: result.detectedLanguage,
    source: result.mappingSource,
    browser: result.browserLanguage,
    supported: SUPPORTED_LANGUAGES,
    default: DEFAULT_LANGUAGE
  });
}

/**
 * 언어 설정이 유효한지 검증
 */
export function isValidLanguage(language: any): language is Language {
  return typeof language === 'string' && SUPPORTED_LANGUAGES.includes(language as Language);
}

/**
 * 언어 변경 시 필요한 모든 저장소에 저장
 */
export function persistLanguageSelection(language: Language): void {
  if (!isValidLanguage(language)) {
    console.warn('Invalid language provided:', language);
    return;
  }

  saveLanguageToLocalStorage(language);
  logLanguageDetection({
    detectedLanguage: language,
    mappingSource: 'exact'
  });
}