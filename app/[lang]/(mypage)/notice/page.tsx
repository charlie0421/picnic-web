import React from 'react';
import NoticePageClient from './NoticePageClient';

interface Props {
  params: Promise<{ lang: string }>;
}

export default async function NoticePage({ params }: Props) {
  const { lang } = await params;

  // 번역 파일 직접 로드
  let localeMessages: Record<string, any> = {};
  try {
    localeMessages = await import(`../../../../public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    // fallback to English
    localeMessages = await import(`../../../../public/locales/en.json`).then(m => m.default);
  }

  // 클라이언트 컴포넌트에서 필요한 번역들 준비
  const translations = {
    page_title_notice: localeMessages.page_title_notice || '공지사항',
    notice_no_items: localeMessages.notice_no_items || '등록된 공지사항이 없습니다.',
    notice_pinned: localeMessages.notice_pinned || '공지',
  };

  return (
    <NoticePageClient 
      lang={lang}
      translations={translations}
    />
  );
}
