import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';
import CookieConsentBanner from '@/components/client/ads/CookieConsentBanner';
import { getLanguageTag } from '@/app/[lang]/utils/metadata-utils';

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

  // middleware 가 경로에서 검증해 넣는 로케일 (클라이언트가 보낸 값은 middleware 가 지운다)
  const headersList = await headers();
  const currentLang = getLanguageTag(headersList.get('x-locale')) ?? 'ko';

  // 경로 기반 광고 분기(투표 라우트 지연·/download 제외)는 x-pathname 이 없어 한 번도 켜진 적이 없다.
  // 정책 결정(#5) 전까지 실제 동작(지연 없음·1.2s idle)을 그대로 명시한다.
  const shouldLoadAds = process.env.NODE_ENV === 'production';

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
            delayUntilIdle={false}
            idleTimeout={1200}
          />
        )}
        <div className="bg-white">
          {children}
        </div>
        {/* Cookie Consent Banner - 프로덕션에서만 표시 */}
        {shouldLoadAds && <CookieConsentBanner />}
      </body>
    </html>
  );
} 