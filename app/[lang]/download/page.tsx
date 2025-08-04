import { Metadata } from 'next';
import DownloadClient from '@/app/[lang]/download/DownloadClient';
import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';
import { getLatestVersion } from '@/lib/data-fetching/server/supabase-service';
import { getTranslations } from '@/lib/i18n/server';

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ lang: Language }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations(lang);
  return {
    title: t('download.title'),
    description: t('download.description'),
    openGraph: {
      title: t('download.title'),
      description: t('download.description'),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('download.title'),
      description: t('download.description'),
    },
    alternates: {
      languages: Object.fromEntries(
        SUPPORTED_LANGUAGES.map(l => [l, `/${l}/download`])
      ),
    },
  };
}

export async function generateStaticParams() {
  return SUPPORTED_LANGUAGES.map((lang) => ({
    lang,
  }));
}

export default async function DownloadPage({ params }: PageProps) {
  const { lang } = await params;
  const versionInfo = await getLatestVersion();
  const t = await getTranslations(lang);

  const translations = {
    title: t('download.title'),
    description: t('download.description'),
    iosButton: t('download.iosButton'),
    androidButton: t('download.androidButton'),
    apkButton: t('download.apkButton'),
    apkPreparing: t('download.apkPreparing'),
    languageSelect: t('download.languageSelect'),
  };

  return <DownloadClient versionInfo={versionInfo} translations={translations} />;
} 