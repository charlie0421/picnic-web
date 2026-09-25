import React, { Suspense, cache } from 'react';
import type { Metadata } from 'next';
import VoteDetailFetcher from '@/components/server/vote/VoteDetailFetcher';
import VoteDetailSkeleton from '@/components/server/VoteDetailSkeleton';
import { ErrorBoundary } from 'react-error-boundary';
import { VoteErrorFallback } from '@/components/client/vote/common/VoteErrorFallback';
import { settings, type Language } from '@/config/settings';
import { getVoteById } from '@/utils/api/queries';
import { getLocalizedString } from '@/utils/api/strings';
import {
  DEFAULT_METADATA,
  buildLanguageAlternates,
  getOpenGraphLocale,
  resolveCdnImageUrl,
} from '@/app/[lang]/utils/metadata-utils';

interface VoteDetailPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

const toSafeLang = (lang: string): Language =>
  (settings.languages.supported as readonly string[]).includes(lang)
    ? (lang as Language)
    : settings.languages.default;

// VoteDetailFetcher 와 같은 getVoteById 요청이라 Next 의 fetch 메모이제이션으로 한 요청에서 한 번만 나간다.
// cache 는 같은 렌더 안에서 이 조회가 여러 번 불려도 한 번만 실행되게 한다.
const getVoteForMetadata = cache((voteId: number) => getVoteById(voteId));

export async function generateMetadata(props: VoteDetailPageProps): Promise<Metadata> {
  const { id, lang } = await props.params;
  // VoteDetailFetcher 와 같은 규칙으로 id 를 해석한다 (숫자가 아니면 페이지가 404)
  const voteId = parseInt(id, 10);
  if (isNaN(voteId)) {
    return {};
  }

  const vote = await getVoteForMetadata(voteId);
  if (!vote) {
    return {};
  }

  const safeLang = toSafeLang(lang);
  const title = getLocalizedString(vote.title, safeLang);
  const path = `/vote/${voteId}`;
  const canonical = `/${safeLang}${path}`;
  const imageUrl = resolveCdnImageUrl(vote.main_image);

  return {
    ...(title ? { title } : {}),
    alternates: {
      canonical,
      languages: buildLanguageAlternates(path),
    },
    openGraph: {
      ...DEFAULT_METADATA.openGraph,
      ...(title ? { title } : {}),
      url: canonical,
      locale: getOpenGraphLocale(safeLang),
      ...(imageUrl ? { images: [{ url: imageUrl, alt: title }] } : {}),
    },
    twitter: {
      ...DEFAULT_METADATA.twitter,
      ...(title ? { title } : {}),
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function VoteDetailPage(props: VoteDetailPageProps) {
  const { id, lang } = await props.params;
  const safeLang = toSafeLang(lang);

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
