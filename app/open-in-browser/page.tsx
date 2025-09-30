export default async function OpenInBrowserPage({ searchParams }: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = (await searchParams) || {};
  const rawReturn = (typeof sp?.returnTo === 'string' ? sp?.returnTo : Array.isArray(sp?.returnTo) ? sp?.returnTo[0] : undefined) || '/';
  const safeReturn = rawReturn.startsWith('/') ? rawReturn : `/${rawReturn}`;
  const host = 'www.picnic.fan';
  const httpsBase = `https://${host}`;
  const fallbackUrl = `${httpsBase}${safeReturn}`;
  const intentHref = `intent://${host}${safeReturn}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  const chromeMarketHttp = 'https://play.google.com/store/apps/details?id=com.android.chrome';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#ffffff', color: '#111' }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>외부 브라우저로 열기</h1>
        <p style={{ color: '#4b5563', marginBottom: 20, lineHeight: 1.5 }}>
          인앱 브라우저에서는 구글 로그인이 제한될 수 있습니다. 아래 버튼을 눌러 크롬에서 열어주세요.
        </p>
        <p style={{ marginBottom: 16, fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>목표 페이지: {fallbackUrl}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <a href={intentHref} style={{ padding: '10px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', textDecoration: 'none' }}>
            크롬으로 열기
          </a>
          <a href={chromeMarketHttp} style={{ padding: '10px 16px', borderRadius: 8, background: '#e5e7eb', color: '#111827', textDecoration: 'none' }}>
            크롬 설치/업데이트
          </a>
        </div>
      </div>
    </div>
  );
}


