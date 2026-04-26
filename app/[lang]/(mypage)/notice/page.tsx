import React from 'react';
import { getNotices } from '@/lib/data-fetching/server/notice-service';
import Link from 'next/link';
import { getLocalizedString } from '@/utils/api/strings';
import { format } from 'date-fns';
import { getCurrentLocale, type SupportedLanguage } from '@/utils/date';

export const dynamic = 'force-dynamic';

interface NoticePageProps {
  params: Promise<{
    lang: string;
  }>;
}

export default async function NoticePage({ params }: NoticePageProps) {
  const { lang } = await params;
  const notices = await getNotices();
  const locale = getCurrentLocale(lang as SupportedLanguage);

  let localeMessages: Record<string, any> = {};
  try {
    localeMessages = await import(`@/public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    console.error('번역 파일 로드 실패:', error);
    localeMessages = await import(`@/public/locales/en.json`).then(m => m.default);
  }

  const translations = {
    page_title_notice: localeMessages.page_title_notice || 'Notices',
    notice_no_items: localeMessages.notice_no_items || 'No notices found.',
    notice_pinned: localeMessages.notice_pinned || 'Pinned',
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{translations.page_title_notice}</h1>
      <div className="space-y-4">
        {notices.length === 0 ? (
          <p>{translations.notice_no_items}</p>
        ) : (
          notices.map((notice) => (
            <Link
              key={notice.id}
              href={`/${lang}/notice/${notice.id}`}
              className="block p-4 border rounded-lg hover:bg-gray-50 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {notice.is_pinned && (
                    <span className="font-bold text-blue-600 mr-2">
                      [{translations.notice_pinned}]
                    </span>
                  )}
                  <h2 className="text-lg font-semibold mb-2">
                    {getLocalizedString(notice.title, lang)}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {format(new Date(notice.created_at), 'yyyy.MM.dd', { locale })}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}