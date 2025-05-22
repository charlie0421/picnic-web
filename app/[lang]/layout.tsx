import {ReactNode} from 'react';
import {Inter} from 'next/font/google';
import './globals.css';
import './layout.css';
import { Metadata } from 'next';
import ClientLayout from './ClientLayout';

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
  
  return {
    title: {
      default: 'Picnic',
      template: '%s | Picnic',
    },
    description: 'Picnic - 투표 및 미디어 플랫폼',
    openGraph: {
      title: 'Picnic',
      description: 'Picnic - 투표 및 미디어 플랫폼',
      siteName: 'Picnic',
    },
  };
}

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
      <body className={inter.className}>
        <ClientLayout initialLanguage={lang}>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
