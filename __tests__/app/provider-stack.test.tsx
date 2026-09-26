import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PERF-13/STR-002: Provider 스택은 [lang] 레이아웃의 ClientLayout 한 곳에서만 마운트한다.
 * 예전에는 (main) 셸이 같은 Provider 세트를 다시 감싸고, (mypage) 레이아웃은 ClientLayout 을 한 번 더 감쌌다
 * (컨텍스트 상태 분리·인증 구독 중복·Analytics 이중 전송).
 */
const { mounts, provider, leaf } = vi.hoisted(() => {
  const mounts = {} as Record<string, number>;
  const provider = (name: string) => ({ children }: { children?: any }) => {
    mounts[name] = (mounts[name] ?? 0) + 1;
    return children ?? null;
  };
  const leaf = (name: string) => () => {
    mounts[name] = (mounts[name] ?? 0) + 1;
    return null;
  };
  return { mounts, provider, leaf };
});

vi.mock('@/contexts/NavigationContext', () => ({ NavigationProvider: provider('Navigation') }));
vi.mock('@/contexts/GlobalLoadingContext', () => ({ GlobalLoadingProvider: provider('GlobalLoading') }));
vi.mock('@/components/providers/LanguageSyncProvider', () => ({ LanguageSyncProvider: provider('LanguageSync') }));
vi.mock('@/lib/supabase/auth-provider', () => ({ AuthProvider: provider('Auth') }));
vi.mock('@/contexts/NotificationContext', () => ({ NotificationProvider: provider('Notification') }));
vi.mock('@/components/ui/Dialog', () => ({ DialogProvider: provider('Dialog') }));
vi.mock('@/components/auth/AuthRedirectHandler', () => ({ AuthRedirectHandler: provider('AuthRedirect') }));
vi.mock('@vercel/analytics/react', () => ({ Analytics: leaf('Analytics') }));
vi.mock('@/components/ui/GlobalLoadingOverlay', () => ({ default: leaf('GlobalLoadingOverlay') }));
vi.mock('@/components/common/GlobalNotifications', () => ({ GlobalNotifications: leaf('GlobalNotifications') }));
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<any>) => {
    const name = String(loader).match(/GlobalNotifications|GlobalLoadingOverlay|LcpReporter|PopupBannerLoader|Firebase\w+/)?.[0] ?? 'dynamic';
    return leaf(name);
  },
}));
vi.mock('@/components/layouts/Header', () => ({ default: () => null }));
vi.mock('@/components/layouts/Footer', () => ({ default: () => null }));
vi.mock('@/components/layouts/ExclusiveOpenBadge', () => ({ default: () => null }));
vi.mock('@/components/mypage/MypageHeader', () => ({ MypageHeader: () => null }));
vi.mock('@/hooks/useMenu', () => ({ useMenu: () => ({ subMenuItems: [] }) }));
vi.mock('@/hooks/useLocaleRouter', () => ({ useLocaleRouter: () => ({ getLocalizedPath: (p: string) => p }) }));
vi.mock('@/hooks/useTranslations', () => ({ useTranslations: () => ({ tDynamic: (k: string) => k }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ko/vote' }));
const getServerUser = vi.hoisted(() => vi.fn(async () => null));
vi.mock('@/lib/supabase/server', () => ({ getServerUser }));

import ClientLayout from '@/app/[lang]/ClientLayout';
import MainLayout from '@/app/[lang]/(main)/layout';
import MyPageLayout from '@/app/[lang]/(mypage)/layout';

const PROVIDERS = ['Navigation', 'GlobalLoading', 'LanguageSync', 'Auth', 'Notification', 'Dialog', 'AuthRedirect'];

describe('Provider 스택 단일화', () => {
  beforeEach(() => {
    for (const key of Object.keys(mounts)) delete mounts[key];
    getServerUser.mockClear();
  });

  it('(main) 페이지: 각 Provider·전역 오버레이·Analytics 가 한 번씩만 마운트된다', async () => {
    const main = await MainLayout({ children: <div />, params: Promise.resolve({ lang: 'ko' }) });
    render(<ClientLayout initialLanguage="ko">{main}</ClientLayout>);

    for (const name of PROVIDERS) expect(mounts[name], name).toBe(1);
    expect(mounts.Analytics ?? 0).toBeLessThanOrEqual(1);
    expect(mounts.GlobalLoadingOverlay ?? 0).toBeLessThanOrEqual(1);
    expect(mounts.GlobalNotifications ?? 0).toBeLessThanOrEqual(1);
  });

  it('(mypage) 페이지: ClientLayout 을 다시 감싸지 않고, 쓰지 않는 서버 사용자 조회를 하지 않는다', async () => {
    const mypage = await MyPageLayout({ children: <div />, params: Promise.resolve({ lang: 'ko' }) });
    render(<ClientLayout initialLanguage="ko">{mypage}</ClientLayout>);

    for (const name of PROVIDERS) expect(mounts[name], name).toBe(1);
    expect(getServerUser).not.toHaveBeenCalled();
  });
});
