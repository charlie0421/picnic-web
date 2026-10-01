import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

const setCurrentLang = vi.fn();

vi.mock('next/navigation', () => ({ usePathname: () => '/en/vote' }));
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    isHydrated: true,
    currentLanguage: 'en',
    setHydrated: vi.fn(),
    syncLanguageWithPath: vi.fn(),
    loadTranslations: vi.fn(),
    isTranslationLoaded: { en: true },
    translations: { en: { key: 'value' } },
    isLoading: false,
    setCurrentLang,
  }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { LanguageSyncProvider } from '@/components/providers/LanguageSyncProvider';

const clearLocaleCookie = () => {
  document.cookie = 'locale=; path=/; max-age=0';
};

const renderAndSettle = async () => {
  render(<LanguageSyncProvider initialLanguage="en">child</LanguageSyncProvider>);
  // 기기 언어 감지는 idle 콜백(jsdom 에서는 600ms 타이머)에서 실행된다
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};

/**
 * 기기 언어 감지는 저장된 언어가 없는 첫 방문에만 한다.
 * 저장값이 기본 언어(en)일 때도 감지하면, 영어를 고른 사용자의 쿠키가 방문마다 기기 언어로 되돌아간다.
 * middleware 는 locale 쿠키로 접두어 없는 주소의 언어를 정하므로(lib/i18n/locale-routing.ts) 그 선택이 무시된다.
 */
describe('LanguageSyncProvider — 기기 언어 감지', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearLocaleCookie();
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ko-KR');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearLocaleCookie();
  });

  it('저장된 언어가 없으면 기기 언어를 쿠키에 쓴다', async () => {
    await renderAndSettle();
    expect(document.cookie).toContain('locale=ko');
    expect(setCurrentLang).toHaveBeenCalledWith('ko');
  });

  it('영어(기본 언어)를 저장해 둔 사용자의 쿠키를 기기 언어로 덮어쓰지 않는다', async () => {
    document.cookie = 'locale=en; path=/';
    await renderAndSettle();
    expect(document.cookie).toContain('locale=en');
    expect(setCurrentLang).not.toHaveBeenCalledWith('ko');
  });

  it('다른 언어를 저장해 둔 사용자의 쿠키도 그대로 둔다', async () => {
    document.cookie = 'locale=ja; path=/';
    await renderAndSettle();
    expect(document.cookie).toContain('locale=ja');
    expect(setCurrentLang).not.toHaveBeenCalled();
  });
});
