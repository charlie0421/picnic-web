import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import RootLayout, { metadata } from '@/app/layout';

/**
 * 루트 레이아웃은 [lang] 파라미터를 받을 수 없다. 여기서 <html lang> 을 정하려고 headers() 를 읽으면
 * 모든 페이지가 동적 렌더링이 되므로, <html> 은 [lang]/(bare) 레이아웃과 not-found 가 렌더한다.
 */
describe('루트 레이아웃 — pass-through', () => {
  it('children 을 그대로 반환한다', () => {
    const children = { marker: true } as unknown as React.ReactNode;
    expect(RootLayout({ children })).toBe(children);
  });

  // 루트 metadata 는 모든 경로의 기본값이다. 특히 어느 라우트에도 맞지 않는 URL 의 전역 404 는
  // 루트 레이아웃 + app/not-found.tsx 만 렌더하므로, 여기서 빠지면 404 페이지에 <title> 이 없어진다.
  it('기본 메타데이터(제목·설명·AdSense 계정 확인)를 내보낸다', () => {
    expect(metadata).toMatchObject({
      title: 'Picnic',
      description: 'Picnic - Your favorite voting platform',
      other: { 'google-adsense-account': 'ca-pub-1539304887624918' },
    });
  });

  it('요청 시점 API 를 import 하지 않는다', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(source).not.toMatch(/next\/headers/);
  });
});
