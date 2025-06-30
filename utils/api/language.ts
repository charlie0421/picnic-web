import { Language, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@/config/settings';

export function getLanguageFromParams(params: { lang: string }): Language {
  const lang = params.lang as Language;
  
  if (SUPPORTED_LANGUAGES.includes(lang)) {
    return lang;
  }
  
  return DEFAULT_LANGUAGE;
}