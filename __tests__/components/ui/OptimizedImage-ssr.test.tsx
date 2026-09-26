import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * PERF-04: LCP 이미지(priority)는 SSR HTML 에 <img src> 로 들어가야 하고, 로드 전에 숨기지 않아야 한다.
 * 예전에는 src 를 useEffect 에서 정하고 opacity-0 으로 숨겨 모바일 LCP 가 하이드레이션 이후(8.6~9.9s)로 밀렸다.
 */
vi.mock('next/image', () => ({
  default: ({ src, className, priority, fetchPriority, loading }: any) => (
    <img
      src={src}
      className={className}
      data-priority={String(Boolean(priority))}
      fetchPriority={fetchPriority}
      loading={loading}
    />
  ),
}));

import { OptimizedImage } from '@/components/ui/OptimizedImage';

describe('OptimizedImage SSR', () => {
  it('priority 이미지는 서버 HTML 에 src 가 있는 <img> 로 렌더된다', () => {
    const html = renderToString(
      <OptimizedImage src="banner/hero.png" alt="hero" fill priority fetchPriority="high" sizes="100vw" />,
    );
    expect(html).toMatch(/<img[^>]+src="[^"]+hero\.png[^"]*"/);
    expect(html).toContain('data-priority="true"');
    expect(html).toContain('fetchPriority="high"');
  });

  it('priority 이미지는 로드 전에도 숨기지 않고 shimmer 를 덮지 않는다', () => {
    const html = renderToString(<OptimizedImage src="banner/hero.png" alt="hero" fill priority />);
    expect(html).not.toMatch(/<img[^>]+opacity-0/);
    expect(html).not.toContain('animate-pulse');
  });

  it('priority 가 아닌 이미지는 기존처럼 뷰포트 진입 후 로드(SSR 에 img 없음)', () => {
    const html = renderToString(<OptimizedImage src="artist/a.png" alt="a" width={100} height={100} />);
    expect(html).not.toContain('<img');
  });
});
