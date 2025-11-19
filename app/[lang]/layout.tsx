import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import './layout.css';
import { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import ClientLayout from './ClientLayout';
import { DEFAULT_METADATA } from './utils/metadata-utils';

const inter = Inter({ subsets: ['latin'] });


// 정적 경로 생성을 위한 `generateStaticParams`
export async function generateStaticParams() {
  // config/settings.ts의 SUPPORTED_LANGUAGES 중, 빌드가 보장된 언어만 정적으로 생성
  const { SUPPORTED_LANGUAGES } = await import('@/config/settings');
  const STATIC_LANGS = new Set(['en', 'ko', 'my']);
  return SUPPORTED_LANGUAGES
    .filter((lang) => STATIC_LANGS.has(lang as any))
    .map((lang) => ({ lang }));
}

// Next.js 15에서 요구하는 viewport 내보내기
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};


// 동적 메타데이터 생성
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params 전체를 await 해야 함
  const { lang } = await params;

  // 언어에 따라 다른 메타데이터 생성
  const languageSpecificMetadata: Partial<Metadata> = {
    alternates: {
      ...DEFAULT_METADATA.alternates,
      canonical: lang === 'ko' ? '/' : `/${lang}`,
    },
    openGraph: {
      ...DEFAULT_METADATA.openGraph,
      locale: lang === 'ko' ? 'ko_KR' : 'en_US',
    },
    manifest: '/manifest.json',
    other: {
      'msapplication-TileColor': '#4F46E5',
      'theme-color': '#ffffff',
      '1password-ignore': 'true',
      'lastpass-ignore': 'true',
      'dashlane-ignore': 'true',
      'bitwarden-ignore': 'true',
    },
  };

  return {
    ...DEFAULT_METADATA,
    ...languageSpecificMetadata,
  };
}

// 정적 metadata 내보내기 제거 (중복된 metadata 내보내기)

export default async function LanguageLayout({
  children,
  params: paramsPromise
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const params = await paramsPromise;
  // 특정 경로에서는 무거운 클라이언트 레이아웃을 우회 (인앱 호환성 개선)
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || headersList.get('x-url') || '';
  const isOpenInBrowser = pathname.includes('/open-in-browser');

  if (isOpenInBrowser) {
    // 최소 래핑: Provider 미적용으로 렌더 리스크 최소화
    return <>{children}</>;
  }

  return (
    <ClientLayout initialLanguage={params.lang}>
      {children}
    </ClientLayout>
  );
}
