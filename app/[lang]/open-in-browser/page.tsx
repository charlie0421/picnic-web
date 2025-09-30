'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function OpenInBrowserPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const returnTo = searchParams.get('returnTo') || '/';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const target = `${origin}${returnTo}`;

    try {
      const scheme = origin.startsWith('https') ? 'https' : 'http';
      const hostAndPath = target.replace(/^https?:\/\//, '');
      const fallbackUrl = target; // 폴백은 동일 URL을 https로 열기
      const intent = `intent://${hostAndPath}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
      // 일부 인앱은 자동 리다이렉트를 무시할 수 있어 약간의 지연과 함께 시도
      setTimeout(() => {
        try { window.location.href = intent; } catch {}
      }, 50);
    } catch {}
  }, [searchParams]);

  const returnTo = searchParams.get('returnTo') || '/';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const scheme = origin.startsWith('https') ? 'https' : 'http';
  const hostAndPath = origin ? `${origin.replace(/^https?:\/\//, '')}${returnTo}` : returnTo.replace(/^\//, '');
  const fallbackUrl = origin ? `${origin}${returnTo}` : returnTo;
  const intentHref = `intent://${hostAndPath}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;

  return (
    <div className='min-h-screen flex flex-col items-center justify-center p-6'>
      <h1 className='text-lg font-semibold mb-3'>외부 브라우저로 열기</h1>
      <p className='text-gray-600 mb-6 text-center'>
        카카오톡 인앱 브라우저에서는 구글 로그인이 제한됩니다. 아래 버튼을 눌러 크롬에서 열어주세요.
      </p>
      <a href={intentHref} className='px-4 py-2 rounded-md bg-blue-600 text-white'>
        크롬으로 열기
      </a>
    </div>
  );
}


