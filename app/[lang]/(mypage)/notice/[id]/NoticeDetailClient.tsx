'use client';

import React from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';
import { getCurrentLocale, type SupportedLanguage } from '@/utils/date';
import { useTranslations } from '@/hooks/useTranslations';
import { getLocalizedString } from '@/utils/api/strings';
import { type Database } from '@/types/supabase';

type Notice = Database['public']['Tables']['notices']['Row'];

interface NoticeDetailClientProps {
  notice: Notice;
}

const NoticeDetailClient = ({ notice }: NoticeDetailClientProps) => {
  const { currentLanguage: lang } = useLanguage();
  const { tDynamic } = useTranslations();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <Link href={`/${lang}/notice`} className="text-blue-600 hover:underline">
            {tDynamic('Mypage.notice_back_to_list')}
          </Link>
        </div>
        <div className="border-b pb-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            {notice.is_pinned && (
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                {tDynamic('Mypage.notice_pinned')}
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
            __html: (getLocalizedString(notice.content, lang) || '').replace(/\\n/g, '<br />'),
          }}
        />
      </div>
    </div>
  );
};

export default NoticeDetailClient;
