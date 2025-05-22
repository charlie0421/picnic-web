import {ReactNode} from 'react';
import {Inter} from 'next/font/google';
import './globals.css';
import './layout.css';
import { Metadata } from 'next';
import ClientLayout from './ClientLayout';
import { DEFAULT_METADATA } from './utils/metadata-utils';

const inter = Inter({ subsets: ['latin'] });

// 동적 메타데이터 생성
export async function generateMetadata({
  params
}: {
  params: { lang: string | Promise<string> }
}): Promise<Metadata> {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const paramsResolved = await Promise.resolve(params);
  const lang = String(paramsResolved.lang || 'ko');
  
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

// 기본 메타데이터
export const metadata: Metadata = DEFAULT_METADATA;

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { lang: string | Promise<string> };
}) {
  // Next.js 15.3.1에서는 params를 먼저 await 해야 함
  const paramsResolved = await Promise.resolve(params);
  const langParam = paramsResolved.lang;
  const lang = typeof langParam === 'string' ? langParam : await langParam || 'ko';
  
  return (
    <html lang={lang}>
      <head>
        {/* JSON-LD 구조화된 데이터 - 웹사이트 정보 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              url: 'https://picnic.com',
              name: '피크닉',
              description: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://picnic.com/search?q={search_term_string}',
                'query-input': 'required name=search_term_string'
              },
            })
          }}
        />
      </head>
      <body className={inter.className}>
        <ClientLayout initialLanguage={lang}>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
