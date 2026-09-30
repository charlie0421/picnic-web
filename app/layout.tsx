import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { ADSENSE_META } from '@/app/shell';

// 모든 경로의 기본 메타데이터. 하위 세그먼트([lang] 의 generateMetadata 등)가 같은 필드를 덮어쓰고,
// other 는 Next 가 병합하므로 AdSense 계정 확인 메타는 모든 페이지에 실린다.
// 어느 라우트에도 맞지 않는 URL 의 전역 404 는 이 레이아웃 + app/not-found.tsx 만 렌더하므로,
// 이 export 가 없으면 404 페이지에 <title> 이 없다.
export const metadata: Metadata = {
  title: 'Picnic',
  description: 'Picnic - Your favorite voting platform',
  // AdSense 계정 메타 태그 (권장)
  other: ADSENSE_META,
};

/**
 * 루트 레이아웃은 아무것도 렌더하지 않는다.
 *
 * <html lang> 은 경로의 언어에 달려 있는데 루트 레이아웃은 [lang] 파라미터를 받을 수 없다.
 * 예전에는 middleware 의 x-locale 헤더를 headers() 로 읽었고, 그 한 줄이 모든 페이지를 동적 렌더링으로
 * 만들어 ISR 이 하나도 동작하지 않았다. 이제 <html>·<body> 는 아래 네 곳이 렌더한다:
 *   app/[lang]/layout.tsx · app/(bare)/layout.tsx · app/not-found.tsx · app/global-error.tsx
 *
 * metadata 는 정적 객체라 렌더링 모드에 영향을 주지 않는다. 여기서 headers()·cookies() 를 부르면 안 된다.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
