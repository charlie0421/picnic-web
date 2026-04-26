import React, { Suspense } from 'react';
import VoteDetailFetcher from '@/components/server/vote/VoteDetailFetcher';
import VoteDetailSkeleton from '@/components/server/VoteDetailSkeleton';
import { ErrorBoundary } from 'react-error-boundary';
import { VoteErrorFallback } from '@/components/client/vote/common/VoteErrorFallback';
import { settings, type Language } from '@/config/settings';

interface VoteDetailPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

export default async function VoteDetailPage(props: VoteDetailPageProps) {
  const { id, lang } = await props.params;
  const safeLang: Language = (settings.languages.supported as readonly string[]).includes(lang)
    ? (lang as Language)
    : settings.languages.default;

  return (
    <div className="container mx-auto px-4 py-8">
      <ErrorBoundary FallbackComponent={VoteErrorFallback}>
        <Suspense fallback={<VoteDetailSkeleton />}>
          <VoteDetailFetcher voteId={id} lang={safeLang} />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
