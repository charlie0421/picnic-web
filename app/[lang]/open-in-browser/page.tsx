import type { Metadata } from 'next';
import { headers } from 'next/headers';

const L = {
  ko: {
    title: '외부 브라우저로 열기',
    desc: '인앱 브라우저에서는 로그인/결제 등 일부 기능이 제한됩니다. 아래 안내에 따라 외부 브라우저에서 열어주세요.',
    target: '목표 페이지',
    androidOpenChrome: '크롬으로 열기',
    androidInstallChrome: '크롬 설치/업데이트',
    iosTitle: 'Safari 에서 열기',
    iosStep1: '1. 화면 우측 상단의 ⋯ (더보기) 또는 화살표(⤴) 아이콘을 누르세요.',
    iosStep2: '2. 메뉴에서 "Safari 에서 열기" / "기본 브라우저에서 열기" 를 선택하세요.',
    iosCopy: '링크 복사',
    iosCopyHint: '메뉴가 보이지 않으면 링크를 복사해 Safari 에 붙여넣기 하세요.',
  },
  en: {
    title: 'Open in your browser',
    desc: 'In-app browsers limit features like login and payments. Please open this page in an external browser using the steps below.',
    target: 'Target page',
    androidOpenChrome: 'Open in Chrome',
    androidInstallChrome: 'Install/Update Chrome',
    iosTitle: 'Open in Safari',
    iosStep1: '1. Tap the ⋯ (more) or arrow (⤴) icon at the top of the screen.',
    iosStep2: '2. Choose "Open in Safari" or "Open in default browser".',
    iosCopy: 'Copy link',
    iosCopyHint: 'If the menu is not visible, copy the link and paste it into Safari.',
  },
} as const;

type Lang = keyof typeof L;

function pickLang(raw: string): Lang {
  return raw === 'ko' ? 'ko' : 'en';
}

export const metadata: Metadata = {
  title: 'Open in your browser',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ lang: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OpenInBrowserPage({ params, searchParams }: Props) {
  const { lang: rawLang } = await params;
  const lang = pickLang(rawLang);
  const t = L[lang];

  const sp = (await searchParams) || {};
  const rawReturn =
    (typeof sp?.returnTo === 'string'
      ? sp?.returnTo
      : Array.isArray(sp?.returnTo)
        ? sp?.returnTo[0]
        : undefined) || '/';
  const safeReturn = rawReturn.startsWith('/') ? rawReturn : `/${rawReturn}`;
  const host = 'www.picnic.fan';
  const httpsBase = `https://${host}`;
  const fallbackUrl = `${httpsBase}${safeReturn}`;

  // OS detection (server-side from UA). 정확하지 않을 수 있어 양쪽 안내 둘 다 표시되도록 fallback.
  const ua = (await headers()).get('user-agent') || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const showAndroid = isAndroid || (!isIOS && !isAndroid);
  const showIOS = isIOS || (!isIOS && !isAndroid);

  const intentHref = `intent://${host}${safeReturn}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  const chromeMarketHttp = 'https://play.google.com/store/apps/details?id=com.android.chrome';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: '#ffffff',
        color: '#111',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{t.title}</h1>
        <p style={{ color: '#4b5563', marginBottom: 20, lineHeight: 1.5 }}>{t.desc}</p>
        <p style={{ marginBottom: 16, fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>
          {t.target}: {fallbackUrl}
        </p>

        {showAndroid && (
          <div style={{ marginBottom: showIOS ? 24 : 0 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href={intentHref}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: '#2563eb',
                  color: '#fff',
                  textDecoration: 'none',
                }}
              >
                {t.androidOpenChrome}
              </a>
              <a
                href={chromeMarketHttp}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  background: '#e5e7eb',
                  color: '#111827',
                  textDecoration: 'none',
                }}
              >
                {t.androidInstallChrome}
              </a>
            </div>
          </div>
        )}

        {showIOS && (
          <div
            style={{
              borderTop: showAndroid ? '1px solid #e5e7eb' : 'none',
              paddingTop: showAndroid ? 20 : 0,
              textAlign: 'left',
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>
              {t.iosTitle}
            </h2>
            <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>
              {t.iosStep1}
            </p>
            <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              {t.iosStep2}
            </p>
            <p style={{ color: '#6b7280', fontSize: 12, lineHeight: 1.6 }}>{t.iosCopyHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
