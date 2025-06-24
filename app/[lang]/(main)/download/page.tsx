import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SUPPORTED_LANGUAGES } from '@/config/settings';
import DownloadClient from './DownloadClient';
import { getLatestVersion } from '@/lib/data-fetching/supabase-service';

// 동적 렌더링 강제 (빌드 타임아웃 방지)
export const dynamic = 'force-dynamic';

interface DownloadPageProps {
  params: Promise<{ lang: string }>;
}

// 메타데이터 생성
export async function generateMetadata({
  params,
}: DownloadPageProps): Promise<Metadata> {
  const { lang } = await params;
  
  const titles = {
    ko: '피크닠 앱 다운로드 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
    en: 'Download Picnic App - Voting and Media Platform for K-Pop Artists',
    zh: '下载Picnic应用 - K-Pop艺术家投票和媒体平台',
    ja: 'Picnicアプリをダウンロード - K-Popアーティストのための投票・メディアプラットフォーム',
    id: 'Unduh Aplikasi Picnic - Platform Voting dan Media untuk Artis K-Pop',
  };

  const descriptions = {
    ko: '지금 바로 피크닠 앱을 다운로드하여 K-Pop 아티스트들을 응원하세요! iOS, Android APK 지원',
    en: 'Download the Picnic app now and support your favorite K-Pop artists! Available for iOS and Android',
    zh: '立即下载Picnic应用，支持您喜爱的K-Pop艺术家！支持iOS和Android',
    ja: '今すぐPicnicアプリをダウンロードして、お気に入りのK-Popアーティストを応援しよう！iOS、Android対応',
    id: 'Unduh aplikasi Picnic sekarang dan dukung artis K-Pop favorit Anda! Tersedia untuk iOS dan Android',
  };

  const localeMap = {
    ko: 'ko_KR',
    en: 'en_US', 
    zh: 'zh_CN',
    ja: 'ja_JP',
    id: 'id_ID',
  };

  const title = titles[lang as keyof typeof titles] || titles.en;
  const description = descriptions[lang as keyof typeof descriptions] || descriptions.en;
  const locale = localeMap[lang as keyof typeof localeMap] || 'en_US';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale,
      alternateLocale: Object.values(localeMap).filter(l => l !== locale),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      languages: {
        en: '/en/download',
        ko: '/ko/download',
        zh: '/zh/download',
        ja: '/ja/download',
        id: '/id/download',
      },
    },
  };
}

// 정적 경로 생성 - 빌드 타임아웃 방지를 위해 제거
// export async function generateStaticParams() {
//   return SUPPORTED_LANGUAGES.map((lang) => ({
//     lang,
//   }));
// }

export default async function DownloadPage({ params }: DownloadPageProps) {
  const { lang } = await params;

  // 지원되지 않는 언어인 경우 404
  if (!SUPPORTED_LANGUAGES.includes(lang as any)) {
    notFound();
  }

  // 버전 정보 가져오기
  const versionInfo = await getLatestVersion();

  return <DownloadClient lang={lang} versionInfo={versionInfo} />;
} 