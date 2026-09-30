import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import RootLayout from '@/app/layout';

/**
 * 루트 레이아웃은 [lang] 파라미터를 받을 수 없다. 여기서 <html lang> 을 정하려고 headers() 를 읽으면
 * 모든 페이지가 동적 렌더링이 되므로, <html> 은 [lang]/(bare) 레이아웃과 not-found 가 렌더한다.
 */
describe('루트 레이아웃 — pass-through', () => {
  it('children 을 그대로 반환한다', () => {
    const children = { marker: true } as unknown as React.ReactNode;
    expect(RootLayout({ children })).toBe(children);
  });

  it('요청 시점 API 를 import 하지 않는다', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(source).not.toMatch(/next\/headers/);
  });
});
