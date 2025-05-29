import { Metadata } from 'next';
import { createLocalizedPageMetadata, createLocalizedJsonLd } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';
import { Language } from '@/config/settings';
import { BannerListFetcher, LoadingState } from '@/components/server';
import { Suspense } from 'react';
import { VoteListFetcher } from '@/components/server/vote/VoteListFetcher';
import { VOTE_STATUS, VOTE_AREAS } from '@/stores/voteFilterStore';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const { lang: langParam } = await params;
  const language = (langParam || 'ko') as Language;

  // 언어별 제목과 설명
  const titles: Record<Language, string> = {
    ko: '투표',
    en: 'Vote',
    ja: '投票',
    zh: '投票',
    id: 'Vote',
  };

  const descriptions: Record<Language, string> = {
    ko: '피크닉에서 좋아하는 아티스트에게 투표하고 응원하세요.',
    en: 'Vote for your favorite artists and show your support on Picnic.',
    ja: 'ピクニックで好きなアーティストに投票して応援しよう。',
    zh: '在野餐为你最喜欢的艺人投票并表达支持。',
    id: 'Vote untuk artis favorit Anda dan tunjukkan dukungan Anda di Picnic.',
  };

  return createLocalizedPageMetadata(
    language,
    '/vote',
    titles[language],
    descriptions[language],
    {
      keywords: language === 'ko' 
        ? ['투표', 'K-Pop', '아티스트', '팬덤', '응원', '피크닉']
        : ['Vote', 'K-Pop', 'Artist', 'Fandom', 'Support', 'Picnic'],
    }
  );
}

interface VoteListPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  params: Promise<{ lang: string }>;
}

export default async function VoteListPage({
  searchParams,
  params,
}: VoteListPageProps) {
  // URL 파라미터에서 status와 area 가져오기
  const resolvedSearchParams = await searchParams;
  const { lang: langParam } = await params;
  const language = (langParam || 'ko') as Language;
  
  const status = resolvedSearchParams.status || VOTE_STATUS.ONGOING;
  const area = resolvedSearchParams.area || VOTE_AREAS.KPOP;

  // 언어별 페이지 제목과 설명
  const pageTitle = language === 'ko' ? '피크닉 투표' : 'Picnic Vote';
  const pageDescription = language === 'ko' 
    ? '피크닉에서 좋아하는 아티스트에게 투표하고 응원하세요.'
    : 'Vote for your favorite artists and show your support on Picnic.';

  // 구조화된 데이터 생성
  const websiteJsonLd = createLocalizedJsonLd(
    language,
    'WebSite',
    {
      '@id': `${SITE_URL}/#website`,
      url: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}vote`,
      name: pageTitle,
      description: pageDescription,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}vote?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    }
  );

  const breadcrumbJsonLd = createLocalizedJsonLd(
    language,
    'BreadcrumbList',
    {
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: language === 'ko' ? '홈' : 'Home',
          item: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: language === 'ko' ? '투표' : 'Vote',
          item: `${SITE_URL}/${language === 'ko' ? '' : `${language}/`}vote`,
        },
      ],
    }
  );

  return (
    <>
      {/* 웹사이트 구조화된 데이터 */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: websiteJsonLd,
        }}
      />
      
      {/* 브레드크럼 구조화된 데이터 */}
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd,
        }}
      />
      
      <main className='container mx-auto px-4 py-8 space-y-8'>
        {/* 배너 섹션 */}
        <section>
          <Suspense fallback={<LoadingState message='배너를 불러오는 중...' />}>
            <BannerListFetcher />
          </Suspense>
        </section>

        {/* 투표 섹션 */}
        <section>
          <Suspense
            fallback={<LoadingState message='투표 데이터를 불러오는 중...' />}
          >
            <VoteListFetcher
              className='w-full'
              status={status as any}
              area={area as any}
            />
          </Suspense>
        </section>
      </main>
    </>
  );
}
