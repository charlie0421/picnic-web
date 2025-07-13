import { Metadata } from 'next';
import StarCandyProductsFetcherServer from '@/components/server/star-candy/StarCandyProductsFetcher';
import { getLanguageFromParams } from '@/utils/api/language';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const language = getLanguageFromParams({ lang });
  
  return {
    title: language === 'ko' ? '별사탕 충전 | 피크닉' : 'Star Candy Recharge | Picnic',
    description: language === 'ko' 
      ? '피크닉 별사탕을 충전하고 더 많은 투표에 참여하세요!' 
      : 'Recharge your Picnic Star Candy and participate in more votes!',
  };
}

export default async function StarCandyPage({ params }: { params: Promise<{ lang: string }> }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: getLanguageFromParams(await params) === 'ko' ? '별사탕 충전 | 피크닉' : 'Star Candy Recharge | Picnic',
            description: getLanguageFromParams(await params) === 'ko' ? '피크닉 별사탕을 충전하고 더 많은 투표에 참여하세요!' : 'Recharge your Picnic Star Candy and participate in more votes!',
            url: `${process.env.SITE_URL}/${(await params).lang}/star-candy`,
          }),
        }}
      />
      <main className="container mx-auto px-4 py-6">
        <section>
          <StarCandyProductsFetcherServer />
        </section>
      </main>
    </>
  );
}