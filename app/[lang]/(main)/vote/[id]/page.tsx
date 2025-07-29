import React, { Suspense } from 'react';
import VoteDetailFetcher from '@/components/server/vote/VoteDetailFetcher';
import VoteDetailSkeleton from '@/components/server/VoteDetailSkeleton';
import { ErrorBoundary } from 'react-error-boundary';
import { VoteErrorFallback } from '@/components/client/vote/common/VoteErrorFallback';

interface VoteDetailPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

export default async function VoteDetailPage(props: VoteDetailPageProps) {
  const { id } = await props.params;

  return (
    <div className="container mx-auto px-4 py-8">
      <ErrorBoundary FallbackComponent={VoteErrorFallback}>
        <Suspense fallback={<VoteDetailSkeleton />}>
          <VoteDetailFetcher voteId={id} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
