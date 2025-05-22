/**
 * next-intl 모듈 모킹
 * 
 * next-intl 다국어 지원 라이브러리에 대한 모의 구현을 제공합니다.
 */

// 현재 로케일 기본값
let currentLocale = 'ko';

// 번역 키-값 저장소
const translations = new Map();

// 기본 번역 함수
const defaultTranslate = (key) => key;

// useTranslations 훅
export const useTranslations = jest.fn((namespace) => {
  return (key, params = {}) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    
    if (translations.has(fullKey)) {
      let translation = translations.get(fullKey);
      
      // 매개변수 치환
      if (params && typeof translation === 'string') {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
          translation = translation.replace(`{${paramKey}}`, paramValue);
        });
      }
      
      return translation;
    }
    
    return fullKey;
  };
});

// useLocale 훅
export const useLocale = jest.fn(() => currentLocale);

// useTimeZone 훅
export const useTimeZone = jest.fn(() => 'Asia/Seoul');

// useNow 훅
export const useNow = jest.fn(() => new Date());

// useFormatter 훅
export const useFormatter = jest.fn(() => ({
  dateTime: jest.fn((date) => date instanceof Date ? date.toLocaleString(currentLocale) : date),
  number: jest.fn((num) => num.toLocaleString(currentLocale)),
  relativeTime: jest.fn((value, unit) => `${value} ${unit} ago`),
}));

// getTranslations 함수
export const getTranslations = jest.fn((namespace) => {
  return {
    t: (key, params = {}) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      
      if (translations.has(fullKey)) {
        let translation = translations.get(fullKey);
        
        // 매개변수 치환
        if (params && typeof translation === 'string') {
          Object.entries(params).forEach(([paramKey, paramValue]) => {
            translation = translation.replace(`{${paramKey}}`, paramValue);
          });
        }
        
        return translation;
      }
      
      return fullKey;
    }
  };
});

// NextIntlClientProvider 컴포넌트
export const NextIntlClientProvider = jest.fn(({ children }) => children);

// createSharedPathnamesNavigation 함수
export const createSharedPathnamesNavigation = jest.fn((config) => {
  return {
    Link: ({ href, children, ...rest }) => {
      return { href, children, ...rest };
    },
    redirect: jest.fn((pathname) => {
      throw new Error(`Redirected to ${pathname}`);
    }),
    usePathname: jest.fn(() => '/'),
    useRouter: jest.fn(() => ({
      push: jest.fn(),
      replace: jest.fn(),
    })),
  };
});

// createLocalizedPathnamesNavigation 함수
export const createLocalizedPathnamesNavigation = jest.fn((config) => {
  return createSharedPathnamesNavigation(config);
});

// 테스트에서 사용할 수 있는 유틸리티 함수들
export const __testUtils = {
  setLocale: (locale) => {
    currentLocale = locale;
  },
  setTranslation: (key, value) => {
    translations.set(key, value);
  },
  clearTranslations: () => {
    translations.clear();
  },
}; 