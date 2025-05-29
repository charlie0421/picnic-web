import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import './layout.css';
import { Metadata, Viewport } from 'next';
import ClientLayout from './ClientLayout';
import { createInternationalizedMetadata, createLocalizedJsonLd } from './utils/metadata-utils';
import { Language, SUPPORTED_LANGUAGES } from '@/config/settings';
import { notFound } from 'next/navigation';

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
  const language = lang as Language;

  // 국제화된 메타데이터 생성
  return createInternationalizedMetadata(language, '/');
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
  const language = lang as Language;

  // 지원되는 언어인지 확인
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    notFound();
  }

  // 메시지 로드
  let messages;
  try {
    messages = (await import(`../../locales/${language}.json`)).default;
  } catch (error) {
    // 기본 언어로 폴백
    messages = (await import(`../../locales/ko.json`)).default;
  }

  // 언어별 구조화된 데이터 생성
  const websiteJsonLd = createLocalizedJsonLd(
    language,
    'WebSite',
    {
      '@id': `https://picnic.com/#website`,
      url: 'https://picnic.com',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://picnic.com/search?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    }
  );

  const organizationJsonLd = createLocalizedJsonLd(
    language,
    'Organization',
    {
      '@id': `https://picnic.com/#organization`,
      name: language === 'ko' ? '피크닉' : 'Picnic',
      url: 'https://picnic.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://picnic.com/images/logo.png',
        width: 400,
        height: 400,
      },
      sameAs: [
        'https://twitter.com/picnic',
        'https://instagram.com/picnic',
        'https://facebook.com/picnic',
      ],
    }
  );

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
        
        {/* 언어별 구조화된 데이터 */}
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: websiteJsonLd,
          }}
        />
        <script
          type='application/ld+json'
          dangerouslySetInnerHTML={{
            __html: organizationJsonLd,
          }}
        />
      </head>
      <body className={inter.className}>
        <ClientLayout initialLanguage={lang} messages={messages}>{children}</ClientLayout>
      </body>
    </html>
  );
}
