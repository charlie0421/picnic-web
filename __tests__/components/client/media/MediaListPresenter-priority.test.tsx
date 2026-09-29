import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/** LCP: 미디어 목록의 우선(첫 3개) 썸네일은 로드 전에도 숨기지 않는다(opacity-0·로딩 오버레이 없음). */
const calls = vi.hoisted(() => [] as Array<{ priority?: boolean; className?: string }>);
vi.mock('@/components/ui/OptimizedImage', () => ({
  OptimizedImage: (props: any) => {
    calls.push({ priority: props.priority, className: props.className });
    return null;
  },
}));

import MediaListPresenter from '@/components/client/media/MediaListPresenter';

const media = Array.from({ length: 4 }, (_, i) => ({
  id: i + 1,
  title: { en: `m${i}` },
  thumbnail_url: `media/${i}.jpg`,
  video_id: null,
  video_url: null,
})) as any;

describe('MediaListPresenter 우선 썸네일', () => {
  it('priority 썸네일은 opacity-0 로 숨기지 않고, 그 외는 기존처럼 로드 후 표시', () => {
    calls.length = 0;
    const html = renderToString(<MediaListPresenter media={media} />);
    const priority = calls.filter((c) => c.priority);
    const rest = calls.filter((c) => !c.priority);

    expect(priority).toHaveLength(3);
    for (const c of priority) expect(c.className).not.toMatch(/\bopacity-0\b/);
    for (const c of rest) expect(c.className).toMatch(/\bopacity-0\b/);
    expect((html.match(/animate-spin/g) ?? []).length).toBe(1);
  });
});
