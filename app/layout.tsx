import type { ReactNode } from 'react';

/**
 * 루트 레이아웃은 아무것도 렌더하지 않는다.
 *
 * <html lang> 은 경로의 언어에 달려 있는데 루트 레이아웃은 [lang] 파라미터를 받을 수 없다.
 * 예전에는 middleware 의 x-locale 헤더를 headers() 로 읽었고, 그 한 줄이 모든 페이지를 동적 렌더링으로
 * 만들어 ISR 이 하나도 동작하지 않았다. 이제 <html>·<body> 는 아래 네 곳이 렌더한다:
 *   app/[lang]/layout.tsx · app/(bare)/layout.tsx · app/not-found.tsx · app/global-error.tsx
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
