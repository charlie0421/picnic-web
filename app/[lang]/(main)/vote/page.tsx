import VotePageClient from '@/app/[lang]/(main)/vote/VotePageClient';
import { Metadata } from 'next';
import { createPageMetadata } from '@/app/[lang]/utils/metadata-utils';
import { createWebsiteSchema } from '@/app/[lang]/utils/seo-utils';
import { SITE_URL } from '@/app/[lang]/constants/static-pages';

export async function generateMetadata({
  params,
}: {
  params: { lang: string | Promise<string> };
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const langParam = await Promise.resolve(params.lang || 'ko');
  const lang = String(langParam);

  return createPageMetadata(
    '투표',
    '피크닉에서 좋아하는 아티스트에게 투표하고 응원하세요.',
    {
      alternates: {
        canonical: `${SITE_URL}/${lang}/vote`,
        languages: {
          'ko-KR': `${SITE_URL}/ko/vote`,
          'en-US': `${SITE_URL}/en/vote`,
        },
      },
    }
  );
}

export default function VotePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            createWebsiteSchema(
              `${SITE_URL}/vote`,
              '피크닉 투표',
              '피크닉에서 좋아하는 아티스트에게 투표하고 응원하세요.'
            )
          ),
        }}
      />
      <VotePageClient />
    </>
  );
}
