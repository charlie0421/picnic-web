import {create} from "zustand";
import {persist} from "zustand/middleware";
import OtaClient from '@crowdin/ota-client';
import {type Language, settings} from '@/config/settings';

// Crowdin OTA 클라이언트 초기화
const distributionHash = process.env.NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH;

const otaClient = new OtaClient(distributionHash || '');

// URL에서 현재 언어 가져오기
const getCurrentLanguageFromPath = (): Language => {
  if (typeof window === 'undefined') return settings.languages.default;

  const pathSegments = window.location.pathname.split('/');
  const urlLang = pathSegments[1] as Language;

  if (urlLang && settings.languages.supported.includes(urlLang)) {
    return urlLang;
  }

  return settings.languages.default;
};

// 사용자 선호 언어 가져오기 (localStorage에서)
const getUserPreferredLanguage = (): Language | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const preferred = localStorage.getItem('preferredLanguage') as Language;
    if (preferred && settings.languages.supported.includes(preferred)) {
      return preferred;
    }
  } catch (error) {
    // localStorage 접근 실패 시 무시
  }
  
  return null;
};

// 브라우저 언어 감지
const getBrowserLanguage = (): Language => {
  if (typeof window === 'undefined') return settings.languages.default;
  
  const browserLang = navigator.language || navigator.languages?.[0];
  if (!browserLang) return settings.languages.default;
  
  // 언어 코드만 추출 (예: 'ko-KR' -> 'ko')
  const langCode = browserLang.split('-')[0] as Language;
  
  if (settings.languages.supported.includes(langCode)) {
    return langCode;
  }
  
  return settings.languages.default;
};

// 초기 언어 설정 우선순위:
// 1. URL 경로의 언어 (가장 높은 우선순위)
// 2. 사용자 선호 언어 (localStorage)
// 3. 브라우저 언어
// 4. 기본 언어
const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return settings.languages.default;
  
  // 1. URL 경로에서 언어 확인
  const pathLang = getCurrentLanguageFromPath();
  if (pathLang !== settings.languages.default) {
    return pathLang;
  }
  
  // 2. 사용자 선호 언어 확인
  const preferredLang = getUserPreferredLanguage();
  if (preferredLang) {
    return preferredLang;
  }
  
  // 3. 브라우저 언어 확인
  const browserLang = getBrowserLanguage();
  return browserLang;
};

const initialLanguage: Language = getInitialLanguage();

// OTA 클라이언트에 초기 언어 설정
if (typeof window !== 'undefined') {
  otaClient.setCurrentLocale(initialLanguage);
}

interface TranslationData {
  identifier: string;
  translation: string;
  source_string: string;
}

interface LanguageState {
  currentLanguage: Language;
  translations: Record<Language, Record<string, TranslationData>>;
  isLoading: boolean;
  error: string | null;
  isTranslationLoaded: Record<Language, boolean>;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, args?: Record<string, string>) => string;
  loadTranslations: (lang: string) => Promise<void>;
  setCurrentLang: (lang: Language) => void;
  syncLanguageWithPath: () => void;
  initializeLanguage: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      currentLanguage: initialLanguage,
      translations: settings.languages.supported.reduce((acc, lang) => {
        acc[lang] = {};
        return acc;
      }, {} as Record<Language, Record<string, TranslationData>>),
      isLoading: false,
      error: null,
      isTranslationLoaded: settings.languages.supported.reduce((acc, lang) => {
        acc[lang] = false;
        return acc;
      }, {} as Record<Language, boolean>),
      
      setLanguage: async (lang: Language) => {
        if (settings.languages.supported.includes(lang)) {
          set({ currentLanguage: lang });
          
          // 번역 데이터 미리 로드
          const { loadTranslations } = get();
          await loadTranslations(lang);
          
          // localStorage에 사용자 선호도 저장
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('preferredLanguage', lang);
            } catch (error) {
              console.warn('Failed to save language preference:', error);
            }
          }
        }
      },
      
      syncLanguageWithPath: () => {
        if (typeof window === 'undefined') return;
        const langFromPath = getCurrentLanguageFromPath();
        const { currentLanguage } = get();
        
        // URL의 언어와 현재 언어가 다르면 업데이트
        if (langFromPath !== currentLanguage) {
          set({ currentLanguage: langFromPath });
        }
      },
      
      initializeLanguage: async () => {
        const { currentLanguage, loadTranslations } = get();
        
        // 현재 언어의 번역 데이터를 로드
        await loadTranslations(currentLanguage);
        
        // 자주 사용되는 다른 언어들도 백그라운드에서 미리 로드
        const commonLanguages = ['ko', 'en'];
        for (const lang of commonLanguages) {
          if (lang !== currentLanguage) {
            // 백그라운드에서 로드 (에러 무시)
            loadTranslations(lang).catch(() => {
              // 백그라운드 로드 실패는 무시
            });
          }
        }
      },
      
      t: (key: string, args?: Record<string, string>) => {
        const { currentLanguage, translations, isTranslationLoaded } = get();

        // 번역이 아직 로드되지 않았으면 빈 문자열 반환 (경고 없이)
        if (!isTranslationLoaded[currentLanguage]) {
          return '';
        }

        const langTranslations = translations[currentLanguage];

        if (!langTranslations) {
          return '';
        }

        // 배열 형태의 번역 데이터에서 identifier가 일치하는 항목 찾기
        const translationData = Object.values(langTranslations).find(
          (item) => item.identifier === key
        );

        if (!translationData) {
          // 경고 메시지 제거
          return '';
        }

        let translation = translationData.translation || translationData.source_string || '';
        if (args) {
          Object.entries(args).forEach(([key, value]) => {
            translation = translation.replace(`{${key}}`, value);
          });
        }
        return translation;
      },
      
      loadTranslations: async (lang: string) => {
        if (typeof window === 'undefined') return;

        const { isTranslationLoaded } = get();
        
        // 이미 로드된 언어는 스킵
        if (isTranslationLoaded[lang as Language]) {
          return;
        }

        try {
          set({ isLoading: true, error: null });

          // Crowdin OTA 클라이언트에 현재 언어 설정
          // 중국어의 경우 'zh' 대신 'zh-CN'을 사용
          const crowdinLang = lang === 'zh' ? 'zh-CN' : lang;
          otaClient.setCurrentLocale(crowdinLang);

          // 번역 데이터 로드
          const translations = await otaClient.getStringsByLocale(crowdinLang);

          if (!translations || Object.keys(translations).length === 0) {
            // 기본 번역 데이터를 사용하도록 설정
            set((state) => ({
              translations: {
                ...state.translations,
                [lang]: {},
              },
              isLoading: false,
              isTranslationLoaded: {
                ...state.isTranslationLoaded,
                [lang]: true
              }
            }));
            return;
          }

          set((state) => ({
            translations: {
              ...state.translations,
              [lang]: translations,
            },
            isLoading: false,
            isTranslationLoaded: {
              ...state.isTranslationLoaded,
              [lang]: true
            }
          }));
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load translations',
            isLoading: false,
          });
        }
      },
      
      setCurrentLang: (lang) => set({ currentLanguage: lang }),
    }),
    {
      name: 'language-storage',
      partialize: (state) => ({
        currentLanguage: state.currentLanguage,
        isTranslationLoaded: state.isTranslationLoaded,
      }),
    }
  )
);
