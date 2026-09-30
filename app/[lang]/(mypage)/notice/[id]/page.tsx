import React, { Suspense } from 'react';
import { getNoticeById } from '@/lib/data-fetching/server/notice-service';
import NoticeDetailClient from './NoticeDetailClient';
import { getTranslations } from '@/lib/i18n/server';
import NoticeDetailSkeleton from '@/components/server/mypage/NoticeDetailSkeleton';

// ISR: 요청 시 생성하고 5분마다 재생성한다.
export const revalidate = 300;

// 빌드에서는 만들지 않는다 — 빈 목록이어야 [id] 가 요청 시 정적 생성(ISR) 대상이 된다.
export async function generateStaticParams() {
  return [];
}

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
