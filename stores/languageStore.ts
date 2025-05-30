import { create } from "zustand";
import { persist } from "zustand/middleware";
import OtaClient from "@crowdin/ota-client";
import { type Language, settings } from "@/config/settings";
import { translationLogger } from "@/utils/translationLogger";

// Crowdin OTA 클라이언트 초기화
const distributionHash = process.env.NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH;
const crowdinOnlyMode = process.env.NEXT_PUBLIC_CROWDIN_ONLY_MODE === "true";
let otaClient: any = null;

if (distributionHash && typeof window !== "undefined") {
  otaClient = new OtaClient(distributionHash);
}

// 진행 중인 번역 로딩 Promise들을 추적하는 맵
const loadingPromises = new Map<Language, Promise<void>>();

// URL에서 현재 언어 가져오기
const getCurrentLanguageFromPath = (): Language => {
  if (typeof window === "undefined") return settings.languages.default;

  const pathSegments = window.location.pathname.split("/");
  const urlLang = pathSegments[1] as Language;

  if (urlLang && settings.languages.supported.includes(urlLang)) {
    return urlLang;
  }

  return settings.languages.default;
};

// 초기 언어 설정은 항상 URL 경로에서 가져옴 (클라이언트에서만)
const initialLanguage: Language = (() => {
  if (typeof window === "undefined") return settings.languages.default;
  return getCurrentLanguageFromPath();
})();

// OTA 클라이언트에 초기 언어 설정 (클라이언트에서만)
if (typeof window !== "undefined" && otaClient) {
  const langMap: Record<Language, string> = {
    ko: "ko",
    en: "en",
    ja: "ja",
    zh: "zh-CN",
    id: "id",
  };
  otaClient.setCurrentLocale(langMap[initialLanguage] || initialLanguage);
}

interface TranslationData {
  identifier: string;
  translation: string;
  source_string: string;
}

interface LanguageState {
  currentLanguage: Language;
  translations: Record<Language, Record<string, string>>;
  isLoading: boolean;
  error: string | null;
  isTranslationLoaded: Record<Language, boolean>;
  isHydrated: boolean;
  t: (key: string, args?: Record<string, string>) => string;
  setLanguage: (lang: Language) => Promise<void>;
  syncLanguageWithPath: () => Promise<void>;
  loadTranslations: (lang: Language) => Promise<void>;
  setCurrentLang: (lang: Language) => void;
  setHydrated: (hydrated: boolean) => void;
}

/**
 * 로컬 번역 파일 로드
 */
async function loadLocalTranslations(
  lang: Language,
): Promise<Record<string, string> | null> {
  if (typeof window === "undefined") return null;
  
  try {
    const url = `/locales/${lang}.json`;
    console.log(`🔄 Loading local translations from: ${url}`);
    
    const response = await fetch(url);
    console.log(`📥 Response status for ${lang}:`, response.status, response.ok);
    
    if (!response.ok) {
      throw new Error(`Failed to load local translations for ${lang}: ${response.status}`);
    }
    
    const translations: Record<string, string> = await response.json();
    console.log(`✅ Loaded ${Object.keys(translations).length} translation keys for ${lang}`);
    console.log(`🔍 Has nav_vote key:`, 'nav_vote' in translations);
    console.log(`🔍 Has text_vote_countdown_end key:`, 'text_vote_countdown_end' in translations);
    console.log(`🔍 Sample translation values:`, {
      nav_vote: translations.nav_vote,
      app_name: translations.app_name,
      button_cancel: translations.button_cancel
    });
    
    return translations;
  } catch (error) {
    console.warn(`❌ Local translations not found for ${lang}:`, error);
    return null;
  }
}

/**
 * Crowdin에서 번역 로드
 */
async function loadCrowdinTranslations(
  lang: Language,
): Promise<Record<string, string> | null> {
  if (!otaClient || typeof window === "undefined") {
    return null;
  }

  try {
    // Crowdin 언어 코드 매핑
    const crowdinLangMap: Record<Language, string> = {
      ko: "ko",
      en: "en",
      ja: "ja",
      zh: "zh-CN",
      id: "id",
    };

    const crowdinLang = crowdinLangMap[lang] || lang;
    otaClient.setCurrentLocale(crowdinLang);

    const crowdinData = await otaClient.getStringsByLocale(crowdinLang);

    if (!crowdinData || Object.keys(crowdinData).length === 0) {
      return null;
    }

    // Crowdin 데이터를 일반 key-value 형태로 변환
    const translations: Record<string, string> = {};
    Object.values(crowdinData).forEach((item: any) => {
      if (item.identifier && (item.translation || item.source_string)) {
        translations[item.identifier] = item.translation || item.source_string;
      }
    });

    console.log(`✅ Crowdin translations converted:`, Object.keys(translations).length, 'keys');
    return translations;
  } catch (error) {
    console.warn(`Failed to load Crowdin translations for ${lang}:`, error);
    return null;
  }
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      currentLanguage: initialLanguage,
      translations: settings.languages.supported.reduce((acc, lang) => {
        acc[lang] = {};
        return acc;
      }, {} as Record<Language, Record<string, string>>),
      isLoading: false,
      error: null,
      isHydrated: false,
      isTranslationLoaded: settings.languages.supported.reduce((acc, lang) => {
        acc[lang] = false;
        return acc;
      }, {} as Record<Language, boolean>),
      setLanguage: async (lang: Language) => {
        if (!settings.languages.supported.includes(lang)) {
          console.warn(`Unsupported language: ${lang}`);
          return;
        }

        const { currentLanguage } = get();
        console.log(`🔄 setLanguage called: ${lang}`);
        translationLogger.logLanguageSync(currentLanguage, lang, 'setLanguage');
        
        set({ currentLanguage: lang });

        // 번역이 로드되지 않은 경우 로드
        const { isTranslationLoaded } = get();
        if (!isTranslationLoaded[lang]) {
          await get().loadTranslations(lang);
        }
      },
      syncLanguageWithPath: async () => {
        if (typeof window === "undefined") return;
        
        const { isHydrated } = get();
        
        // hydration이 완료되지 않은 경우 대기
        if (!isHydrated) {
          console.log('🔄 [syncLanguageWithPath] Waiting for hydration to complete...');
          return;
        }
        
        const langFromPath = getCurrentLanguageFromPath();
        const { currentLanguage, isTranslationLoaded } = get();
        
        console.log(`🔄 [syncLanguageWithPath] Current: ${currentLanguage}, Path: ${langFromPath}`);
        
        if (langFromPath !== currentLanguage) {
          console.log(`🔄 [syncLanguageWithPath] Language mismatch detected, updating store from ${currentLanguage} to ${langFromPath}`);
          translationLogger.logLanguageSync(currentLanguage, langFromPath, 'syncLanguageWithPath');
          
          // 언어 상태 즉시 업데이트
          set({ currentLanguage: langFromPath });
          
          // 번역이 로드되지 않은 경우에만 로드
          if (!isTranslationLoaded[langFromPath]) {
            console.log(`🔄 [syncLanguageWithPath] Loading translations for ${langFromPath}`);
            await get().loadTranslations(langFromPath);
          } else {
            console.log(`✅ [syncLanguageWithPath] Translations for ${langFromPath} already loaded`);
          }
        } else {
          console.log(`✅ [syncLanguageWithPath] Language already synchronized: ${currentLanguage}`);
          
          // 언어는 맞지만 번역이 로드되지 않은 경우
          if (!isTranslationLoaded[currentLanguage]) {
            console.log(`🔄 [syncLanguageWithPath] Loading missing translations for ${currentLanguage}`);
            await get().loadTranslations(currentLanguage);
          }
        }
      },
      setHydrated: (hydrated: boolean) => {
        console.log(`🔄 Setting hydration status: ${hydrated}`);
        set({ isHydrated: hydrated });
      },
      t: (key: string, args?: Record<string, string>) => {
        const { translations, currentLanguage } = get();

        // 현재 언어의 번역 찾기
        const currentTranslations = translations[currentLanguage] || {};
        let translation = currentTranslations[key];

        // 번역이 없는 경우 기본 언어에서 찾기
        if (!translation && currentLanguage !== settings.languages.default) {
          const defaultTranslations = translations[settings.languages.default] || {};
          translation = defaultTranslations[key];
          
          if (translation) {
            // 기본 언어에서 찾은 경우 로깅
            translationLogger.logMissingTranslation(
              key, 
              currentLanguage, 
              'fallback_to_default', 
              translation
            );
          }
        }

        // 여전히 번역이 없는 경우 키 자체 반환 및 로깅
        if (!translation) {
          translationLogger.logMissingTranslation(key, currentLanguage, 'no_translation_found');
          return key;
        }

        // 변수 치환
        if (args && typeof translation === "string") {
          Object.entries(args).forEach(([argKey, value]) => {
            translation = translation.replace(`{${argKey}}`, value);
          });
        }

        return translation;
      },
      loadTranslations: async (lang: Language) => {
        // 서버 사이드에서는 로딩하지 않음
        if (typeof window === "undefined") {
          return;
        }

        const { isTranslationLoaded, translations } = get();

        // 이미 진행 중인 로딩이 있는지 확인
        if (loadingPromises.has(lang)) {
          console.log(`🔄 Translation loading already in progress for ${lang}, waiting...`);
          return loadingPromises.get(lang);
        }

        // 강제로 다시 로드하거나 이미 로드된 경우 체크
        const hasTranslations = translations[lang] && Object.keys(translations[lang]).length > 0;
        const isMarkedAsLoaded = isTranslationLoaded[lang];
        
        if (isMarkedAsLoaded && hasTranslations) {
          console.log(`✅ Translations for ${lang} already loaded with ${Object.keys(translations[lang]).length} keys, skipping`);
          return;
        }
        
        if (isMarkedAsLoaded && !hasTranslations) {
          console.log(`⚠️ ${lang} marked as loaded but has no translations, force reloading...`);
        }

        console.log(`🔄 Starting to load translations for ${lang}`);
        
        // Promise 생성 및 캐싱
        const loadingPromise = (async () => {
          try {
            set({ isLoading: true, error: null });

            let translationsData: Record<string, string> = {};

            // Crowdin 우선 모드가 아닌 경우에만 로컬 파일 로드
            if (!crowdinOnlyMode) {
              // 1. 로컬 번역 파일 로드 시도
              try {
                const localTranslations = await loadLocalTranslations(lang);
                if (localTranslations) {
                  translationsData = { ...translationsData, ...localTranslations };
                  console.log(`✅ Local translations loaded for ${lang}:`, Object.keys(localTranslations).length, 'keys');
                  translationLogger.logTranslationSuccess(lang, Object.keys(localTranslations).length, 'local');
                }
              } catch (error) {
                translationLogger.logLoadingError(lang, error as Error, 'local');
              }
            }

            // 2. Crowdin 번역 로드 시도 (우선순위)
            try {
              const crowdinTranslations = await loadCrowdinTranslations(lang);
              if (crowdinTranslations) {
                translationsData = { ...translationsData, ...crowdinTranslations };
                console.log(`✅ Crowdin translations loaded for ${lang}:`, Object.keys(crowdinTranslations).length, 'keys');
                translationLogger.logTranslationSuccess(lang, Object.keys(crowdinTranslations).length, 'crowdin');
              }
            } catch (error) {
              translationLogger.logLoadingError(lang, error as Error, 'crowdin');
            }

            // 3. 번역이 없는 경우 처리
            if (Object.keys(translationsData).length === 0) {
              if (crowdinOnlyMode) {
                console.warn(`No Crowdin translations found for ${lang}`);
                translationLogger.logLoadingError(lang, new Error('No Crowdin translations found'), 'crowdin');
                // Crowdin 전용 모드에서는 키 자체를 반환하도록 fallback
                translationsData = {};
              } else if (lang !== settings.languages.default) {
                console.warn(
                  `No translations found for ${lang}, falling back to ${settings.languages.default}`,
                );
                try {
                  const defaultTranslations = await loadLocalTranslations(settings.languages.default);
                  if (defaultTranslations) {
                    translationsData = defaultTranslations;
                    translationLogger.logTranslationSuccess(lang, Object.keys(defaultTranslations).length, 'local');
                  }
                } catch (error) {
                  translationLogger.logLoadingError(settings.languages.default, error as Error, 'local');
                }
              }
            }

            console.log(`🎉 Final translations for ${lang}:`, Object.keys(translationsData).length, 'keys');
            console.log(`🔍 Sample keys:`, Object.keys(translationsData).slice(0, 5));

            set((state) => ({
              translations: {
                ...state.translations,
                [lang]: translationsData,
              },
              isLoading: false,
              isTranslationLoaded: {
                ...state.isTranslationLoaded,
                [lang]: true,
              },
            }));

            console.log(`✅ Translation loading completed for ${lang}`);
          } catch (error) {
            console.error(`Failed to load translations for ${lang}:`, error);
            translationLogger.logLoadingError(lang, error as Error, 'local');
            
            set({
              error: error instanceof Error
                ? error.message
                : "Failed to load translations",
              isLoading: false,
            });
          } finally {
            // Promise 캐시에서 제거
            loadingPromises.delete(lang);
          }
        })();

        // Promise 캐싱
        loadingPromises.set(lang, loadingPromise);
        
        return loadingPromise;
      },
      setCurrentLang: (lang) => set({ currentLanguage: lang }),
    }),
    {
      name: "language-storage",
      partialize: (state) => ({
        currentLanguage: state.currentLanguage,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof window !== "undefined") {
          console.log('🔄 Rehydrating language store:', state.currentLanguage);
          
          // hydration 완료 표시
          state.setHydrated(true);
          
          // 리하이드레이션 후 현재 언어의 번역이 로드되지 않았다면 로드
          if (!state.isTranslationLoaded[state.currentLanguage]) {
            console.log('🔄 Loading translations after rehydration');
            state.loadTranslations(state.currentLanguage);
          }
        }
      },
    },
  ),
);
