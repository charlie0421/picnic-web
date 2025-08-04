import { getTranslations } from '@/lib/i18n/server';
import { getVoteHistory, getUserComments } from '@/lib/data-fetching/server/user-service';
import { Suspense } from 'react';
import CommentsClient from './CommentsClient';
import CommentsSkeleton from '@/components/server/mypage/CommentsSkeleton';

interface CommentsPageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{
    page?: string | string[];
  }>;
}

export default async function CommentsPage(props: CommentsPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  const pageQuery = searchParams.page ?? '1';
  const page = Number(Array.isArray(pageQuery) ? pageQuery[0] : pageQuery);
  const limit = 10;
  const { lang } = params;

  const t = await getTranslations(lang as any);
  const {
    comments,
    pagination,
    statistics: commentsStats,
    error: commentsError,
  } = await getUserComments({ page, limit, lang });
  const { statistics: voteHistoryStats, error: statsError } =
    await getVoteHistory({ page: 1, limit: 10 });

  const totalCount = pagination?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const initialError = commentsError || statsError;
  const statistics = {
    ...commentsStats,
    ...voteHistoryStats,
  };

  return (
    <Suspense fallback={<CommentsSkeleton />}>
      <CommentsClient
        initialComments={comments}
        initialPagination={{ page, limit, totalCount, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 }}
        initialStatistics={statistics}
        initialError={initialError}
      />
    </Suspense>
  );
}
