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
  };

  return {
    ...DEFAULT_METADATA,
    ...languageSpecificMetadata,
  };
}

// 정적 metadata 내보내기 제거 (중복된 metadata 내보내기)

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  // Next.js 15.3.1에서는 params 전체를 await 해야 함
  const { lang } = await params;

  return (
    <html lang={lang || 'ko'}>
      <head>
        {/* PWA Manifest */}
        <link rel='manifest' href='/manifest.json' />
        <meta name='msapplication-TileColor' content='#4F46E5' />
        <meta name='theme-color' content='#ffffff' />
        
        {/* 브라우저 확장 프로그램 비활성화 */}
        <meta name='1password-ignore' content='true' />
        <meta name='lastpass-ignore' content='true' />
        <meta name='dashlane-ignore' content='true' />
        <meta name='bitwarden-ignore' content='true' />
        
        {/* JSON-LD 구조화된 데이터 - 웹사이트 정보 */}
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              url: 'https://picnic.com',
              name: '피크닉',
              description:
                '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://picnic.com/search?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <ClientLayout initialLanguage={lang}>{children}</ClientLayout>
      </body>
    </html>
  );
}
