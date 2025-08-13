import React, { Suspense } from 'react';
import FaqClient from './FaqClient';
import { getFaqs, getFaqCategories } from '@/lib/data-fetching/server/policy-service';
import { getTranslations } from '@/lib/i18n/server';
import FaqSkeleton from '@/components/server/mypage/FAQSkeleton';

export const dynamic = 'force-dynamic';

interface FaqPageProps {
  params: Promise<{
    lang: string;
  }>;
}

const FaqFetcher = async ({ lang }: { lang: string }) => {
  const [faqs, categories] = await Promise.all([
    getFaqs(lang),
    getFaqCategories(lang),
  ]);

  // 'all' 탭을 선두에 추가하고, i18n은 클라이언트에서 처리
  const categoriesForClient = [
    { code: 'all', label: '' },
    ...categories.map(c => ({ code: c.code, label: c.label })),
  ];

  return <FaqClient faqs={faqs} categories={categoriesForClient} />;
};

export default async function FaqPage(props: FaqPageProps) {
  const params = await props.params;
  const { lang } = params;
  const t = await getTranslations(lang as any);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">
          {t('label_mypage_faq')}
        </h1>
        <Suspense fallback={<FaqSkeleton />}>
          <FaqFetcher lang={lang} />
        </Suspense>
      </div>
    </div>
  );
}
