import React, { Suspense } from 'react';
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

export async function generateMetadata(props: VoteDetailPageProps): Promise<Metadata> {
  const { id, lang } = await props.params;
  // VoteDetailFetcher 와 같은 규칙으로 id 를 해석한다 (숫자가 아니면 페이지가 404)
  const voteId = parseInt(id, 10);
  if (isNaN(voteId)) {
    return {};
  }

  // VoteDetailFetcher 와 같은 cached getter(getVoteById) — 한 요청에서 조회는 한 번만 나간다.
  const vote = await getVoteById(voteId);
  if (!vote) {
    return {};
  }

  // 미공개 투표(visible_at 없음·미래)는 본문이 notFound 이므로 제목·이미지를 메타데이터로 흘리지 않는다
  const visibleAt = vote.visible_at ? Date.parse(vote.visible_at) : Number.NaN;
  if (!Number.isFinite(visibleAt) || visibleAt > Date.now()) {
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
