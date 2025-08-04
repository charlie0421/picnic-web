import React, { Suspense } from 'react';
import { getNoticeById } from '@/lib/data-fetching/server/notice-service';
import NoticeDetailClient from './NoticeDetailClient';
import { getTranslations } from '@/lib/i18n/server';
import NoticeDetailSkeleton from '@/components/server/mypage/NoticeDetailSkeleton';

interface NoticeDetailPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

const NoticeDetailPage = async (props: NoticeDetailPageProps) => {
  const params = await props.params;
  const noticeId = Number(params.id);
  const t = await getTranslations(params.lang as any);

  return (
    <Suspense fallback={<NoticeDetailSkeleton />}>
      <NoticeDetailFetcher noticeId={noticeId} t={t} />
    </Suspense>
  );
};

async function NoticeDetailFetcher({ noticeId, t }: { noticeId: number, t: any }) {
  const { data: notice, error } = await getNoticeById(noticeId);

  if (error || !notice) {
    return (
      <div className="text-center py-10">
        <p>{error ? error.message : t('Mypage.notice_not_found')}</p>
      </div>
    );
  }

  return <NoticeDetailClient notice={notice} />;
}

export default NoticeDetailPage;
