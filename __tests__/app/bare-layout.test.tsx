import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('next/font/google', () => ({ Inter: () => ({ className: 'font-inter' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import BareLayout from '@/app/(bare)/layout';
import GlobalNotFound from '@/app/not-found';

type Element = ReactElement<{ lang?: string; className?: string; children?: unknown }>;

describe('[lang] 밖 문서 뼈대', () => {
  it('(bare) 레이아웃은 <html lang="ko"><body> 안에 페이지를 렌더한다', () => {
    const html = BareLayout({ children: 'page' }) as Element;
    const body = html.props.children as Element;
    const wrapper = body.props.children as Element;

    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('ko');
    expect(body.type).toBe('body');
    expect(body.props.className).toBe('font-inter');
    // main 의 루트 레이아웃이 모든 페이지를 감싸던 래퍼를 그대로 둔다.
    expect(wrapper.type).toBe('div');
    expect(wrapper.props.className).toBe('bg-white');
    expect(wrapper.props.children).toBe('page');
  });

  // /auth/* 와 /ads/shortform/player 는 지금까지 Tailwind 없이 서비스됐다(예전 루트 레이아웃은 전역 CSS 를
  // import 하지 않았다). 여기서 globals.css 를 불러오면 preflight 가 광고 플레이어의 제목·버튼 기본 스타일을
  // 지우고 body 배경이 바뀐다 — 앱 웹뷰에서 보이는 화면이 달라진다.
  it('(bare) 레이아웃은 전역 CSS 를 불러오지 않는다', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/(bare)/layout.tsx'), 'utf8');
    expect(source).not.toMatch(/^import\s.*\.css['"]/m);
  });

  it('전역 not-found 는 자체 <html><body> 를 렌더한다 (루트 레이아웃이 pass-through)', () => {
    const html = (GlobalNotFound as () => Element)();
    expect(html.type).toBe('html');
    expect(html.props.lang).toBe('ko');
    expect((html.props.children as Element).type).toBe('body');
  });
});
