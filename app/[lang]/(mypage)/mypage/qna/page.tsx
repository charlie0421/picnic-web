import { getQnaThreads } from '@/lib/data-fetching/server/qna-service';
import { Suspense } from 'react';
import QnaClient from './QnaClient';
import QnaSkeleton from '@/components/server/mypage/QnaSkeleton';

interface QnaPageProps {
  params: {
    lang: string;
  };
  searchParams: {
    page?: string | string[];
  };
}

export default async function QnaPage({ searchParams }: QnaPageProps) {

  const pageQuery = searchParams.page ?? '1';
  const page = Number(Array.isArray(pageQuery) ? pageQuery[0] : pageQuery);
  const limit = 10;
  
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
      />
    </Suspense>
  );
}
