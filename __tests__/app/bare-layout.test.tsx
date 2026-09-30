import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'font-inter' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import BareLayout, { metadata } from '@/app/(bare)/layout';
import GlobalNotFound from '@/app/not-found';

type HtmlElement = ReactElement<{ lang: string; children: ReactElement<{ className?: string }> }>;

describe('[lang] 밖 문서 뼈대', () => {
  it('(bare) 레이아웃은 <html lang="ko"><body> 를 렌더한다', () => {
    const html = BareLayout({ children: 'page' }) as HtmlElement;
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('ko');
    expect(html.props.children.type).toBe('body');
    expect(html.props.children.props.className).toBe('font-inter');
  });

  it('(bare) 레이아웃도 AdSense 계정 메타 태그를 싣는다', () => {
    expect(metadata.other).toMatchObject({ 'google-adsense-account': 'ca-pub-1539304887624918' });
  });

  it('전역 not-found 는 자체 <html><body> 를 렌더한다 (루트 레이아웃이 pass-through)', () => {
    const html = (GlobalNotFound as () => HtmlElement)();
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('ko');
    expect(html.props.children.type).toBe('body');
  });
});
