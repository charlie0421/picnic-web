import React from 'react';
import NoticeDetailClient from './NoticeDetailClient';

interface Props {
  params: Promise<{ lang: string; id: string }>;
}

const NoticeDetailPage = async ({ params }: Props) => {
  const { lang } = await params;
  
  // Load translations server-side
  let localeMessages: Record<string, any> = {};
  try {
    localeMessages = await import(`../../../../../public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    console.warn(`Translation file for ${lang} not found, falling back to English`);
    localeMessages = await import(`../../../../../public/locales/en.json`).then(m => m.default);
  }

  // Helper function to extract translations
  const t = (key: string) => localeMessages[key] || key;

  // Prepare all necessary translations for the notice detail page
  const translations = {
    notice_invalid_id: t('notice_invalid_id'),
    notice_loading_error: t('notice_loading_error'),
    notice_not_found: t('notice_not_found'),
    notice_back_to_list: t('notice_back_to_list'),
    notice_pinned: t('notice_pinned'),
  };

  return <NoticeDetailClient lang={lang} translations={translations} />;
};

export default NoticeDetailPage;
