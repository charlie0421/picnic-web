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

  return (key: string, args?: Record<string, string>): string => {
    const value = key.split('.').reduce((obj, k) => obj?.[k], translations);

    if (value === undefined) {
      return `[${key}]`;
    }
    
    let translation = value;

    if (typeof translation !== 'string') {
      return `[${key}]`;
    }

    if (args) {
      Object.entries(args).forEach(([argKey, argValue]) => {
        translation = translation.replace(`{${argKey}}`, String(argValue));
      });
    }
    return translation;
  };
}; 