import { create } from "zustand";
import { persist } from "zustand/middleware";
import OtaClient from "@crowdin/ota-client";
import { type Language, settings } from "@/config/settings";

// Crowdin OTA 클라이언트 초기화
const distributionHash = process.env.NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH;
const crowdinOnlyMode = process.env.NEXT_PUBLIC_CROWDIN_ONLY_MODE === "true";
let otaClient: any = null;

if (distributionHash) {
  otaClient = new OtaClient(distributionHash);
}

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

// 초기 언어 설정은 항상 URL 경로에서 가져옴
const initialLanguage: Language = (() => {
  if (typeof window === "undefined") return settings.languages.default;
  return getCurrentLanguageFromPath();
})();

// OTA 클라이언트에 초기 언어 설정
if (typeof window !== "undefined") {
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
  loadTranslations: (lang: Language) => Promise<void>;
  setCurrentLang: (lang: Language) => void;
  syncLanguageWithPath: () => void;
}

/**
 * 로컬 번역 파일 로드
 */
async function loadLocalTranslations(
  lang: Language,
): Promise<Record<string, any> | null> {
  try {
    const response = await fetch(`/locales/${lang}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load local translations for ${lang}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`Local translations not found for ${lang}:`, error);
    return null;
  }
}

/**
 * Crowdin에서 번역 로드
 */
async function loadCrowdinTranslations(
  lang: Language,
): Promise<Record<string, any> | null> {
  if (!otaClient) {
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
      }, {} as Record<Language, Record<string, TranslationData>>),
      isLoading: false,
      error: null,
      isTranslationLoaded: settings.languages.supported.reduce((acc, lang) => {
        acc[lang] = false;
        return acc;
      }, {} as Record<Language, boolean>),
      setLanguage: async (lang: Language) => {
        if (!settings.languages.supported.includes(lang)) {
          console.warn(`Unsupported language: ${lang}`);
          return;
        }

        set({ currentLanguage: lang });

        // 번역이 로드되지 않은 경우 로드
        const { isTranslationLoaded } = get();
        if (!isTranslationLoaded[lang]) {
          await get().loadTranslations(lang);
        }
      },
      syncLanguageWithPath: () => {
        if (typeof window === "undefined") return;
        const langFromPath = getCurrentLanguageFromPath();
        set({ currentLanguage: langFromPath });
      },
      t: (key: string, args?: Record<string, string>) => {
        const { translations, currentLanguage } = get();

        // 현재 언어의 번역 찾기
        const currentTranslations = translations[currentLanguage] || {};
        let translationData = currentTranslations[key];

        // 번역이 없는 경우 기본 언어에서 찾기
        if (
          !translationData && currentLanguage !== settings.languages.default
        ) {
          const defaultTranslations =
            translations[settings.languages.default] || {};
          translationData = defaultTranslations[key];
        }

        // 여전히 번역이 없는 경우 키 자체 반환
        if (!translationData) {
          console.warn(`Translation not found for key: ${key}`);
          return key;
        }

        // TranslationData에서 문자열 추출
        let translation: string;
        if (typeof translationData === "string") {
          translation = translationData;
        } else {
          translation = translationData.translation ||
            translationData.source_string || "";
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
        const { isTranslationLoaded } = get();

        // 이미 로드된 경우 스킵
        if (isTranslationLoaded[lang]) {
          return;
        }

        set({ isLoading: true, error: null });

        try {
          let translations: Record<string, any> = {};

          // Crowdin 우선 모드가 아닌 경우에만 로컬 파일 로드
          if (!crowdinOnlyMode) {
            // 1. 로컬 번역 파일 로드 시도
            const localTranslations = await loadLocalTranslations(lang);
            if (localTranslations) {
              translations = { ...translations, ...localTranslations };
            }
          }

          // 2. Crowdin 번역 로드 시도 (우선순위)
          const crowdinTranslations = await loadCrowdinTranslations(lang);
          if (crowdinTranslations) {
            translations = { ...translations, ...crowdinTranslations };
          }

          // 3. 번역이 없는 경우 처리
          if (Object.keys(translations).length === 0) {
            if (crowdinOnlyMode) {
              console.warn(`No Crowdin translations found for ${lang}`);
              // Crowdin 전용 모드에서는 키 자체를 반환하도록 fallback
              translations = {};
            } else if (lang !== settings.languages.default) {
              console.warn(
                `No translations found for ${lang}, falling back to ${settings.languages.default}`,
              );
              const defaultTranslations = await loadLocalTranslations(
                settings.languages.default,
              );
              if (defaultTranslations) {
                translations = defaultTranslations;
              }
            }
          }

          set((state) => ({
            translations: {
              ...state.translations,
              [lang]: translations,
            },
            isLoading: false,
            isTranslationLoaded: {
              ...state.isTranslationLoaded,
              [lang]: true,
            },
          }));
        } catch (error) {
          console.error(`Failed to load translations for ${lang}:`, error);
          set({
            error: error instanceof Error
              ? error.message
              : "Failed to load translations",
            isLoading: false,
          });
        }
      },
      setCurrentLang: (lang) => set({ currentLanguage: lang }),
    }),
    {
      name: "language-storage",
      partialize: (state) => ({
        currentLanguage: state.currentLanguage,
        isTranslationLoaded: state.isTranslationLoaded,
      }),
    },
  ),
);
