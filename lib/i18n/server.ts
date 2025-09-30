import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import { cache } from 'react';
import { type Language } from '@/config/settings';

const loadTranslations = cache(async (lang: Language) => {
  try {
    const filePath = path.join(process.cwd(), `public/locales/${lang}.json`);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Could not load translations for ${lang}`, error);
    // 기본 언어(영어)로 대체 시도
    if (lang !== 'en') {
      return loadTranslations('en');
    }
    return {};
  }
});

export const getTranslations = async (lang: Language) => {
  const translations = await loadTranslations(lang);
  const koTranslations = lang === 'ko' ? translations : await loadTranslations('ko');
  const enTranslations = lang === 'en' ? translations : await loadTranslations('en');

  return (key: string, args?: Record<string, string>): string => {
    const resolve = (source: any, path: string) => path.split('.').reduce((obj, k) => obj?.[k], source);

    let value = resolve(translations, key);
    if (value === undefined) {
      // Prefer Korean fallback first for missing keys, then English
      value = resolve(koTranslations, key);
      if (value === undefined) {
        value = resolve(enTranslations, key);
      }
    }

    if (value === undefined || typeof value !== 'string') {
      return `[${key}]`;
    }

    let translation = value as string;
    if (args) {
      Object.entries(args).forEach(([argKey, argValue]) => {
        translation = translation.replace(`{${argKey}}`, String(argValue));
      });
    }
    return translation;
  };
};