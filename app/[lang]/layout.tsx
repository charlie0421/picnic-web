import { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import './globals.css';
import { Metadata, Viewport } from 'next';
import ClientLayout from './ClientLayout';
import ConsentAwareAdsense from '@/components/client/ads/ConsentAwareAdsense';
import CookieConsentBanner from '@/components/client/ads/CookieConsentBanner';
import { ADSENSE_CLIENT_ID, VIEWPORT, inter } from '@/app/shell';
import {
  DEFAULT_METADATA,
  brandMetadata,
  brandName,
  getLanguageTag,
  getOpenGraphLocale,
  isSupportedLanguage,
  siteDescription,
} from './utils/metadata-utils';


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
export const viewport: Viewport = VIEWPORT;


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
    // canonical 은 DEFAULT_METADATA 의 './'(현재 경로)를 그대로 쓴다 — 홈으로 고정하지 않는다.
    alternates: DEFAULT_METADATA.alternates,
    ...brandMetadata(lang),
    openGraph: {
      ...DEFAULT_METADATA.openGraph,
      siteName: brandName(lang),
      title: brandName(lang),
      description: siteDescription(lang),
      locale: getOpenGraphLocale(lang),
    },
    twitter: {
      ...DEFAULT_METADATA.twitter,
      title: brandName(lang),
      description: siteDescription(lang),
    },
    manifest: '/manifest.json',
    // AdSense 계정 확인 메타는 루트 레이아웃 metadata 가 싣는다 (Next 가 other 를 병합한다).
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

const cdnOrigin = (() => {
  const rawCdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!rawCdnUrl) return null;
  try {
    return new URL(rawCdnUrl).origin;
  } catch {
    return null;
  }
})();

/**
 * 로케일 페이지의 문서 뼈대. <html lang> 을 경로 파라미터로 정한다 — 요청 시점 API(headers/cookies)를
 * 부르지 않으므로 하위 페이지가 정적/ISR 로 렌더될 수 있다. 여기서 headers() 를 부르면 전부 동적이 된다.
 */
export default async function LanguageLayout({
  children,
  params: paramsPromise,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await paramsPromise;
  // middleware 를 거치지 않는 요청의 마지막 방어선(matcher 가 건너뛰는 /_next/…, 없는 /sitemap-N.xml).
  // 정규 언어가 아닌 세그먼트는 [lang] 페이지로 렌더하지 않는다. 표기 변형은 middleware 가 정규 주소로 보낸다.
  if (!isSupportedLanguage(lang)) notFound();
  const htmlLang = getLanguageTag(lang) ?? lang;

  // 경로 기반 광고 분기(투표 라우트 지연·/download 제외)는 한 번도 켜진 적이 없다.
  // 정책 결정(#5) 전까지 실제 동작(지연 없음·1.2s idle)을 그대로 명시한다.
  const shouldLoadAds = process.env.NODE_ENV === 'production';

  return (
    <html lang={htmlLang}>
      <head>
        {cdnOrigin && (
          <>
            <link rel="preconnect" href={cdnOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={cdnOrigin} />
          </>
        )}
      </head>
      <body className={inter.className}>
        {/* Google AdSense (Auto ads) - 프로덕션에서만 */}
        {shouldLoadAds && (
          <ConsentAwareAdsense
            clientId={ADSENSE_CLIENT_ID}
            delayUntilIdle={false}
            idleTimeout={1200}
          />
        )}
        <div className="bg-white">
          <ClientLayout initialLanguage={lang}>{children}</ClientLayout>
        </div>
        {/* Cookie Consent Banner - 프로덕션에서만 */}
        {shouldLoadAds && <CookieConsentBanner />}
      </body>
    </html>
  );
}
