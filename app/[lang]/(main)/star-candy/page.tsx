import { Metadata } from 'next';
import { StarCandyProducts } from '@/components/client/star-candy/StarCandyProducts';
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
    <div className="container mx-auto px-4 py-8">
      <StarCandyProducts />
    </div>
  );
}