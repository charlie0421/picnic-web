import type { Metadata } from 'next';
import { getTranslations } from '@/lib/i18n/server';
import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';
import ChartDashboard from '@/components/charts/ChartDashboard';
import { chartCopyKeys } from '@/lib/charts/copy';
import { createPageMetadata, getLanguageTag } from '@/app/[lang]/utils/metadata-utils';

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations(lang as Language);
  const canonical = `https://chart.picnic.fan/${lang}/charts`;
  const metadata = createPageMetadata(t('nav_kpop_dashboard'), t('kpop_dashboard.subtitle'), {
    alternates: {
      canonical,
      languages: Object.fromEntries(SUPPORTED_LANGUAGES.map(language => [getLanguageTag(language), `https://chart.picnic.fan/${language}/charts`])),
    },
  }, lang);
  return { ...metadata, openGraph: { ...metadata.openGraph, url: canonical } };
}

export default async function ChartsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const t = await getTranslations(lang as Language);
  const copy = Object.fromEntries(chartCopyKeys.map(key => [key, t(`kpop_dashboard.${key}`)])) as Record<typeof chartCopyKeys[number], string>;
  return <ChartDashboard locale={lang} copy={copy} />;
}
