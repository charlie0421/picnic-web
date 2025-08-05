import { getTranslations } from '@/lib/i18n/server';
import { getQnaThreads } from '@/lib/data-fetching/server/qna-service';
import { Suspense } from 'react';
import QnaClient from './QnaClient';
import QnaSkeleton from '@/components/server/mypage/QnaSkeleton';

interface QnaPageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{
    page?: string | string[];
  }>;
}

export default async function QnaPage(props: QnaPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const pageQuery = searchParams.page ?? '1';
  const page = Number(Array.isArray(pageQuery) ? pageQuery[0] : pageQuery);
  const limit = 10;
  const { lang } = params;

  const t = await getTranslations(lang as any);
  const {
    qnaThreads,
    pagination,
    error,
  } = await getQnaThreads({ page, limit });

  const totalCount = pagination?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Suspense fallback={<QnaSkeleton />}>
      <QnaClient
        initialQnaThreads={qnaThreads}
        initialPagination={{
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        }}
        initialError={error}
        translations={{
          title: t('label_mypage_qna'),
          new_qna: t('label_new_qna'),
          no_qna: t('label_no_qna'),
          status_open: t('label_qna_status_open'),
          status_closed: t('label_qna_status_closed'),
          created_at: t('label_created_at'),
        }}
      />
    </Suspense>
  );
}
