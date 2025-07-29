'use client';

import React from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getCurrentLocale, type SupportedLanguage } from '@/utils/date';
import { getLocalizedString } from '@/utils/api/strings';
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

const NoticeDetailClient = () => {
  const params = useParams();
  const lang = params.lang as string;
  const noticeId = params.id as string;

  const { t, isLoading: isLoadingTranslations } = useTranslations(lang);
  const { data: notice, error } = useSWR(
    noticeId ? `/api/notices/${noticeId}` : null,
    fetcher
  );

  if (error) return <div>{t('notice_loading_error')}</div>;
  if (!notice || isLoadingTranslations) return <div>Loading...</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <Link href={`/${lang}/notice`} className="text-blue-600 hover:underline">
            {t('notice_back_to_list')}
          </Link>
        </div>
        <div className="border-b pb-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            {notice.is_pinned && (
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                {t('notice_pinned')}
              </span>
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              {getLocalizedString(notice.title, lang)}
            </h1>
          </div>
          <span className="text-sm text-gray-500">
            {notice.created_at &&
              format(new Date(notice.created_at), 'yyyy.MM.dd (EEE)', {
                locale: getCurrentLocale(lang as SupportedLanguage),
              })}
          </span>
        </div>
        <div
          className="prose max-w-none text-gray-900"
          dangerouslySetInnerHTML={{
            __html: getLocalizedString(notice.content, lang) || '',
          }}
        />
      </div>
    </div>
  );
};

export default NoticeDetailClient; 