'use client';

import React from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import Link from 'next/link';
import { getCurrentLocale, type SupportedLanguage } from '@/utils/date';
import { getLocalizedString } from '@/utils/api/strings';
import { useParams } from 'next/navigation';
import useSWRImmutable from 'swr/immutable';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Helper function to extract translations
const useTranslations = (lang: string) => {
  const { data: localeMessages, error } = useSWRImmutable(
    `/locales/${lang}.json`,
    fetcher
  );

  const t = (key: string) => {
    if (error || !localeMessages) return key;
    return localeMessages[key] || key;
  };

  return { t, isLoading: !localeMessages && !error };
};

const NoticePageClient = () => {
  const params = useParams();
  const lang = params.lang as string;
  const { t, isLoading: isLoadingTranslations } = useTranslations(lang);
  const { data: notices, error } = useSWR('/api/notices', fetcher);

  if (error) return <div>Failed to load notices.</div>;
  if (!notices || isLoadingTranslations) return <div>Loading...</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t('page_title_notice')}</h1>
      <div className="space-y-4">
        {notices.length === 0 ? (
          <p>{t('notice_no_items')}</p>
        ) : (
          notices.map((notice: any) => (
            <Link
              key={notice.id}
              href={`/${lang}/notice/${notice.id}`}
              className="block p-4 border rounded-lg hover:bg-gray-50"
            >
              {notice.is_pinned && (
                <span className="font-bold text-blue-600">[{t('notice_pinned')}] </span>
              )}
              <h2 className="text-lg font-semibold">
                {getLocalizedString(notice.title, lang)}
              </h2>
              <p className="text-sm text-gray-500">
                {format(new Date(notice.created_at), 'yyyy.MM.dd', {
                  locale: getCurrentLocale(lang as SupportedLanguage),
                })}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default NoticePageClient; 