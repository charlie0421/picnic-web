import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

/**
 * [lang] 레이아웃은 요청 헤더를 읽지 않는다(PERF-01). x-pathname 은 middleware 가 만들지 않으므로
 * 헤더 기반 VoteLite·open-in-browser 분기는 한 번도 켜진 적이 없는 사문 코드였다(결정 #11: VoteLite 폐기).
 */
const headers = vi.fn(() => {
  throw new Error('[lang] layout must not read request headers');
});
vi.mock('next/headers', () => ({ headers: async () => headers() }));
vi.mock('@/app/[lang]/ClientLayout', () => ({ default: ({ children }: any) => children }));

import LanguageLayout from '@/app/[lang]/layout';
import ClientLayout from '@/app/[lang]/ClientLayout';

describe('[lang] layout', () => {
  it.each(['ko', 'en'])('%s: 헤더를 읽지 않고 항상 ClientLayout 으로 감싼다', async (lang) => {
    const element = (await LanguageLayout({
      children: 'page',
      params: Promise.resolve({ lang }),
    })) as ReactElement<{ initialLanguage: string }>;

    expect(headers).not.toHaveBeenCalled();
    expect(element.type).toBe(ClientLayout);
    expect(element.props.initialLanguage).toBe(lang);
  });
});
