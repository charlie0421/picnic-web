import React, { Suspense } from 'react';
import { getServerUser } from '@/lib/supabase/server';
import NotificationsClient from './NotificationsClient';
import { LoadingState } from '@/components/server';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  // 서버 사이드에서 인증 확인
  const user = await getServerUser();

  // 서버사이드에서 번역 로드
  let localeMessages: Record<string, any> = {};
  try {
    localeMessages = await import(`@/public/locales/${lang}.json`).then((m) => m.default);
  } catch (error) {
    console.error('번역 파일 로드 실패:', error);
    localeMessages = await import(`@/public/locales/en.json`).then((m) => m.default);
  }

  // 필요한 번역 키들 추출
  const translations = {
    notifications_title: localeMessages.notifications_title || '알림함',
    notifications_empty: localeMessages.notifications_empty || '알림이 없습니다',
    notifications_loading: localeMessages.notifications_loading || '로딩 중...',
    notifications_error: localeMessages.notifications_error || '알림을 불러오는 중 오류가 발생했습니다',
    notifications_mark_read: localeMessages.notifications_mark_read || '읽음 처리',
    notifications_all_read: localeMessages.notifications_all_read || '모든 알림을 읽음 처리했습니다',
  };

  return (
    <Suspense fallback={<LoadingState />}>
      <NotificationsClient initialUser={user} translations={translations} />
    </Suspense>
  );
}

