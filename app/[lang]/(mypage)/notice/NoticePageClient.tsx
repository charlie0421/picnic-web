'use client';

import React from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import { getCurrentLocale, type SupportedLanguage } from '@/utils/date';
import { getLocalizedString } from '@/utils/api/strings';
import { useParams } from 'next/navigation';

interface Notice {
    id: number;
    title: any;
    created_at: string;
    is_pinned: boolean;
}

interface NoticePageClientProps {
    notices: Notice[];
    translations: {
        page_title_notice: string;
        notice_no_items: string;
        notice_pinned: string;
    }
}

const NoticePageClient = ({ notices, translations }: NoticePageClientProps) => {
  const params = useParams();
  const lang = params.lang as string;

  return (
    <div className="space-y-4">
      {notices.length === 0 ? (
        <p>{translations.notice_no_items}</p>
      ) : (
        notices.map((notice) => (
          <Link
            key={notice.id}
            href={`/${lang}/notice/${notice.id}`}
            className="block p-4 border rounded-lg hover:bg-gray-50"
          >
            {notice.is_pinned && (
              <span className="font-bold text-blue-600">[{translations.notice_pinned}] </span>
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
  );
};

export default NoticePageClient;