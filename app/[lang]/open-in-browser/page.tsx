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
      const intent = `intent://${target.replace(/^https?:\/\//, '')}#Intent;scheme=${scheme};package=com.android.chrome;end`;
      window.location.replace(intent);
    } catch {}
  }, [searchParams]);

  const returnTo = searchParams.get('returnTo') || '/';
  const href = typeof window !== 'undefined' ? `${window.location.origin}${returnTo}` : returnTo;

  return (
    <div className='min-h-screen flex flex-col items-center justify-center p-6'>
      <h1 className='text-lg font-semibold mb-3'>외부 브라우저로 열기</h1>
      <p className='text-gray-600 mb-6 text-center'>
        카카오톡 인앱 브라우저에서는 구글 로그인이 제한됩니다. 아래 버튼을 눌러 크롬에서 열어주세요.
      </p>
      <a href={href} className='px-4 py-2 rounded-md bg-blue-600 text-white'>
        크롬으로 열기
      </a>
    </div>
  );
}


