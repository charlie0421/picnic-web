import React, { Suspense } from 'react';
import { getNotices } from '@/lib/data-fetching/server/notice-service';
import NoticePageClient from './NoticePageClient';
import NoticeSkeleton from '@/components/server/mypage/NoticeSkeleton';

interface NoticePageProps {
  params: Promise<{
    lang: string;
  }>;
}

export default async function NoticePage({ params }: NoticePageProps) {
  const { lang } = await params;
  const notices = await getNotices();

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
      <Suspense fallback={<NoticeSkeleton />}>
        <NoticePageClient notices={notices} translations={translations} />
      </Suspense>
    </div>
  );
}