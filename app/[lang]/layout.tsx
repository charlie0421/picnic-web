import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import './layout.css';
import { Metadata, Viewport } from 'next';
import ClientLayout from './ClientLayout';
import { DEFAULT_METADATA } from './utils/metadata-utils';

const inter = Inter({ subsets: ['latin'] });

// Next.js 15에서 요구하는 viewport 내보내기
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  return <>{children}</>;
}
