import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import '@/app/[lang]/globals.css';
import { ADSENSE_META, VIEWPORT, inter } from '@/app/shell';

export const metadata: Metadata = {
  title: 'Picnic',
  description: 'Picnic - Your favorite voting platform',
  other: ADSENSE_META,
};

export const viewport: Viewport = VIEWPORT;

/**
 * 언어 세그먼트가 없는 페이지(/auth/*, /ads/*)의 문서 뼈대.
 * 루트 레이아웃이 pass-through 라 여기서 <html>·<body> 를 렌더한다. 콘텐츠 페이지가 아니므로
 * AdSense 와 쿠키 배너는 싣지 않는다. 그룹 폴더는 URL 에 나타나지 않는다.
 */
export default function BareLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
