import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';
import { Language, SUPPORTED_LANGUAGES } from '@/config/settings';

export default getRequestConfig(async ({ locale }) => {
  // 지원되는 언어인지 확인
  if (!SUPPORTED_LANGUAGES.includes(locale as Language)) {
    notFound();
  }

  return {
    locale: locale as string,
    messages: (await import(`./locales/${locale}.json`)).default
  };
}); 