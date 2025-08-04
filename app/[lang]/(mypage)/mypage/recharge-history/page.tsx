import { getTranslations } from '@/lib/i18n/server';
import { getRechargeHistory } from '@/lib/data-fetching/server/user-service';
import { Suspense } from 'react';
import RechargeHistoryClient from './RechargeHistoryClient';
import RechargeHistorySkeleton from '@/components/server/mypage/RechargeHistorySkeleton';

interface RechargeHistoryPageProps {
  params: Promise<{
    lang: string;
  }>;
  searchParams: Promise<{
    page?: string | string[];
  }>;
}

export default async function RechargeHistoryPage(
  props: RechargeHistoryPageProps
) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  const pageQuery = searchParams.page ?? '1';
  const page = Number(Array.isArray(pageQuery) ? pageQuery[0] : pageQuery);
  const limit = 10;
  const { lang } = params;

  const t = await getTranslations(lang as any);
  const {
    history,
    pagination,
    error,
  } = await getRechargeHistory({ page, limit });

  const totalCount = pagination?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Suspense fallback={<RechargeHistorySkeleton />}>
      <RechargeHistoryClient
        initialHistory={history}
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
