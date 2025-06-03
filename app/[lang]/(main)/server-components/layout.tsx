'use client';

import Link from 'next/link';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

/**
 * 서버 컴포넌트 데모 페이지 레이아웃
 */
export default function ServerComponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { getLocalizedPath } = useLocaleRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Server Components Demo</h1>
            <Link href={getLocalizedPath('/')} className="text-gray-600 hover:text-primary">
              홈으로
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
} 