'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

export default function OpenInBrowserPage() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/';
  const { origin, scheme, hostAndPath, fallbackUrl, intentHref } = useMemo(() => {
    const o = typeof window !== 'undefined' ? window.location.origin : '';
    const sc = o.startsWith('https') ? 'https' : 'http';
    const hp = o ? `${o.replace(/^https?:\/\//, '')}${returnTo}` : returnTo.replace(/^\//, '');
    const fb = o ? `${o}${returnTo}` : returnTo;
    const ih = `intent://${hp}#Intent;scheme=${sc};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fb)};end`;
    return { origin: o, scheme: sc, hostAndPath: hp, fallbackUrl: fb, intentHref: ih };
  }, [searchParams, returnTo]);
  const chromeMarket = 'market://details?id=com.android.chrome';
  const chromeMarketHttp = 'https://play.google.com/store/apps/details?id=com.android.chrome';

  return (
    <div className='min-h-screen flex flex-col items-center justify-center p-6'>
      <h1 className='text-lg font-semibold mb-3'>외부 브라우저로 열기</h1>
      <p className='text-gray-600 mb-6 text-center'>
        카카오톡 인앱 브라우저에서는 구글 로그인이 제한됩니다. 아래 버튼을 눌러 크롬에서 열어주세요.
      </p>
      <a href={intentHref} className='px-4 py-2 rounded-md bg-blue-600 text-white mb-3'>
        크롬으로 열기
      </a>
      <a href={chromeMarket} onClick={(e) => { /* 인앱에서 market 스킴 차단 시 http 폴백 */ e.currentTarget.href = chromeMarket; setTimeout(() => { try { window.location.href = chromeMarketHttp; } catch {} }, 200); }} className='px-4 py-2 rounded-md bg-gray-200 text-gray-800'>
        크롬 설치/업데이트
      </a>
      <p className='mt-4 text-sm text-gray-500 text-center'>
        자동으로 열리지 않으면 위 버튼을 탭해 주세요.
      </p>
    </div>
  );
}


