import OtaClient from '@crowdin/ota-client';
import { Language } from '@/config/settings';

// Crowdin OTA 클라이언트 초기화
const distributionHash = process.env.NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH;

let otaClient: any = null;

if (distributionHash) {
  otaClient = new OtaClient(distributionHash);
} else {
  console.warn('NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH is not set. Crowdin translations will not be available.');
}

export interface TranslationData {
  identifier: string;
  source_string: string;
  translation: string;
  context?: string;
}

/**
 * Crowdin 언어 코드를 내부 언어 코드로 변환
 */
export function mapToCrowdinLocale(locale: Language): string {
  const mapping: Record<Language, string> = {
    ko: 'ko',
    en: 'en',
    ja: 'ja',
    zh: 'zh-CN',
    id: 'id',
  };
  
  return mapping[locale] || locale;
}

/**
 * Crowdin에서 번역 데이터를 가져옵니다
 */
export async function fetchTranslationsFromCrowdin(
  locale: Language
): Promise<Record<string, TranslationData> | null> {
  if (!otaClient) {
    console.warn('Crowdin OTA client is not initialized');
    return null;
  }

  try {
    const crowdinLocale = mapToCrowdinLocale(locale);
    otaClient.setCurrentLocale(crowdinLocale);
    
    const translations = await otaClient.getStringsByLocale(crowdinLocale);
    
    if (!translations || Object.keys(translations).length === 0) {
      console.warn(`No translations found for locale: ${locale} (${crowdinLocale})`);
      return null;
    }

    return translations;
  } catch (error) {
    console.error(`Failed to fetch translations for ${locale}:`, error);
    return null;
  }
}

/**
 * 번역 키에서 번역된 텍스트를 가져옵니다
 */
export function getTranslation(
  translations: Record<string, TranslationData>,
  key: string,
  args?: Record<string, string>
): string {
  const translationData = Object.values(translations).find(
    (item) => item.identifier === key
  );

  if (!translationData) {
    return '';
  }

  let translation = translationData.translation || translationData.source_string || '';
  
  if (args) {
    Object.entries(args).forEach(([argKey, value]) => {
      translation = translation.replace(`{${argKey}}`, value);
    });
  }
  
  return translation;
}

/**
 * Crowdin 클라이언트가 사용 가능한지 확인
 */
export function isCrowdinAvailable(): boolean {
  return otaClient !== null && !!distributionHash;
}

/**
 * 현재 설정된 Crowdin distribution hash를 반환
 */
export function getCrowdinDistributionHash(): string | undefined {
  return distributionHash;
} 