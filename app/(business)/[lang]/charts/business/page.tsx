import type { Metadata } from 'next';
import { getTranslations } from '@/lib/i18n/server';
import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';
import BusinessInquiryForm from '@/components/charts/BusinessInquiryForm';
import { businessCopyKeys, type BusinessCopy } from '@/lib/charts/business-copy';
import { createPageMetadata, getLanguageTag } from '@/app/[lang]/utils/metadata-utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations(lang as Language);
  const canonical = `https://chart.picnic.fan/${lang}/charts/business`;
  const metadata = createPageMetadata(t('kpop_business.title'), t('kpop_business.subtitle'), {
    alternates: { canonical, languages: Object.fromEntries(SUPPORTED_LANGUAGES.map(language => [getLanguageTag(language), `https://chart.picnic.fan/${language}/charts/business`])) },
  }, lang);
  return { ...metadata, openGraph: { ...metadata.openGraph, url: canonical } };
}

export default async function BusinessPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = await getTranslations(lang as Language);
  const copy = Object.fromEntries(businessCopyKeys.map(key => [key, t(`kpop_business.${key}`)])) as BusinessCopy;
  return <BusinessInquiryForm locale={lang} copy={copy} />;
}
