import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';

export const metadata: Metadata = {
  title: 'Picnic',
  description: 'Picnic - Your favorite voting platform',
  // AdSense 계정 메타 태그 (권장)
  other: {
    'google-adsense-account': 'ca-pub-1539304887624918',
  },
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cdnOrigin = (() => {
    const rawCdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
    if (!rawCdnUrl) {
      return null;
    }
    try {
      const url = new URL(rawCdnUrl);
      return url.origin;
    } catch {
      return null;
    }
  })();

  // 현재 경로에서 언어 감지
  const headersList = await headers();
  const rawPathHeader = headersList.get('x-pathname');
  const rawUrlHeader = headersList.get('x-url');
  const pathname = (() => {
    if (rawPathHeader) return rawPathHeader;
    if (!rawUrlHeader) return '';
    try {
      const url = new URL(rawUrlHeader);
      return url.pathname;
    } catch {
      return rawUrlHeader;
    }
  })();
  
  // 경로에서 언어 추출 (예: /ko, /en, /ja, /zh-tw 등)
  const languageMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/);
  const currentLang = languageMatch ? languageMatch[1] : 'ko';

  const shouldLoadAds = process.env.NODE_ENV === 'production';
  const voteRoutePattern = /^\/[a-z]{2}(?:-[a-z]{2})?\/vote(?:\/|$)/i;
  const shouldDelayAds = voteRoutePattern.test(pathname || '');

  return (
    <html lang={currentLang}>
      <head>
        {cdnOrigin && (
          <>
            <link rel="preconnect" href={cdnOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={cdnOrigin} />
          </>
        )}
      </head>
      <body className={inter.className}>
        {/* Google AdSense (Auto ads) - 프로덕션에서만 지연 로딩 */}
        {shouldLoadAds && (
          <ConsentAwareAdsense
            clientId="ca-pub-1539304887624918"
            delayUntilIdle={shouldDelayAds}
            idleTimeout={shouldDelayAds ? 2200 : 1200}
          />
        )}
        <div className="bg-white">
          {children}
        </div>
      </body>
    </html>
  );
} 