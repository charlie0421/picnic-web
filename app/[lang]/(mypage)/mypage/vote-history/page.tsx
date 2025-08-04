import { getTranslations } from '@/lib/i18n/server';
import { getVoteHistory } from '@/lib/data-fetching/server/user-service';
import { Suspense } from 'react';
import VoteHistoryClient from './VoteHistoryClient';
import VoteHistorySkeleton from '@/components/server/mypage/VoteHistorySkeleton';

interface VoteHistoryPageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{
    page?: string | string[];
  }>;
}

export default async function VoteHistoryPage(props: VoteHistoryPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  const pageQuery = searchParams.page ?? '1';
  const page = Number(Array.isArray(pageQuery) ? pageQuery[0] : pageQuery);
  const limit = 10;
  const { lang } = params;

  const t = await getTranslations(lang as any);
  const {
    voteHistory,
    pagination,
    statistics,
    error,
  } = await getVoteHistory({ page, limit });

  const totalCount = pagination?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Suspense fallback={<VoteHistorySkeleton />}>
      <VoteHistoryClient
        initialVoteHistory={voteHistory}
        initialPagination={{
          page,
          limit,
          totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        }}
        initialStatistics={statistics}
        initialError={error}
      />
    </Suspense>
  );
}
