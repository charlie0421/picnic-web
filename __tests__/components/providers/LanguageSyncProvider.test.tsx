import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

const setCurrentLang = vi.fn();
const setLanguageReady = vi.fn();
const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>(async () => ({ data: { user: null } }));
const updateProfile = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
const fromTable = vi.fn(() => ({ update: updateProfile }));
let globalLoading = false;
let translationLoading = false;
let currentLanguage = 'en';
vi.mock('@/contexts/GlobalLoadingContext', () => ({ useGlobalLoading: () => ({ isLoading: globalLoading }) }));
vi.mock('@/lib/sentry/replay/signals', () => ({ replaySignals: { setLanguageReady: (...args: unknown[]) => setLanguageReady(...args) } }));

vi.mock('next/navigation', () => ({ usePathname: () => '/en/vote' }));
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    isHydrated: true,
    currentLanguage,
    setHydrated: vi.fn(),
    syncLanguageWithPath: vi.fn(),
    loadTranslations: vi.fn(),
    isTranslationLoaded: { en: true, ja: true },
    translations: { en: { key: 'value' }, ja: { key: 'value' } },
    isLoading: translationLoading,
    setCurrentLang,
  }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getUser }, from: fromTable }),
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
    globalLoading = false; translationLoading = false; currentLanguage='en';
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

describe('Replay language readiness', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); globalLoading=false; translationLoading=false; currentLanguage='en'; document.cookie='locale=en; path=/'; });
  afterEach(() => { vi.useRealTimers(); clearLocaleCookie(); });
  it('waits for the idle language decision even when translations are cached', async () => {
    render(<LanguageSyncProvider initialLanguage="en">child</LanguageSyncProvider>);
    expect(setLanguageReady).toHaveBeenLastCalledWith(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(setLanguageReady).toHaveBeenLastCalledWith(true);
  });
  it('waits for translation and global overlay removal, then invalidates readiness on unmount', async () => {
    translationLoading=true; globalLoading=true;
    const view=render(<LanguageSyncProvider initialLanguage="en">first</LanguageSyncProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(setLanguageReady).not.toHaveBeenCalledWith(true);
    translationLoading=false;
    view.rerender(<LanguageSyncProvider initialLanguage="en">second</LanguageSyncProvider>);
    expect(setLanguageReady).not.toHaveBeenCalledWith(true);
    globalLoading=false;
    view.rerender(<LanguageSyncProvider initialLanguage="en">third</LanguageSyncProvider>);
    expect(setLanguageReady).toHaveBeenLastCalledWith(true);
    view.unmount(); expect(setLanguageReady).toHaveBeenLastCalledWith(false);
  });
});

it('cancels an obsolete idle decision after hydration changes the current language', async () => {
  vi.useFakeTimers(); vi.clearAllMocks(); clearLocaleCookie(); currentLanguage='en';
  vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('en-US');
  const view=render(<LanguageSyncProvider initialLanguage="ko">first</LanguageSyncProvider>);
  currentLanguage='ko';
  view.rerender(<LanguageSyncProvider initialLanguage="ko">second</LanguageSyncProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(setCurrentLang).toHaveBeenCalledTimes(1); expect(setCurrentLang).toHaveBeenCalledWith('en');
  view.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); clearLocaleCookie();
});

describe('first-visit preference persistence and idle cleanup', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); clearLocaleCookie(); globalLoading=false; translationLoading=false; currentLanguage='en'; getUser.mockResolvedValue({data:{user:null}}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); clearLocaleCookie(); });
  it('preserves preference persistence when hydration already selected the device language', async () => {
    vi.spyOn(window.navigator,'language','get').mockReturnValue('ko-KR');
    getUser.mockResolvedValue({data:{user:{id:'synthetic-user'}}});
    const view=render(<LanguageSyncProvider initialLanguage="ko">first</LanguageSyncProvider>);
    currentLanguage='ko'; view.rerender(<LanguageSyncProvider initialLanguage="ko">second</LanguageSyncProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(document.cookie).toContain('locale=ko'); expect(setCurrentLang).not.toHaveBeenCalled();
    expect(fromTable).toHaveBeenCalledWith('user_profiles'); expect(updateProfile).toHaveBeenCalledWith({language:'ko'}); view.unmount();
  });
  it.each(['en','ko'])('preserves the no-op when %s matches both initial and settled language', async language => {
    currentLanguage=language; vi.spyOn(window.navigator,'language','get').mockReturnValue(language);
    getUser.mockResolvedValue({data:{user:{id:'synthetic-user'}}});
    const view=render(<LanguageSyncProvider initialLanguage={language}>child</LanguageSyncProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(document.cookie).not.toContain('locale='); expect(setCurrentLang).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled(); expect(updateProfile).not.toHaveBeenCalled(); view.unmount();
  });
  it('invalidates readiness when changing between two cached languages', async () => {
    document.cookie='locale=en; path=/';
    const view=render(<LanguageSyncProvider initialLanguage="en">first</LanguageSyncProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(setLanguageReady).toHaveBeenLastCalledWith(true); setLanguageReady.mockClear();
    currentLanguage='ja'; view.rerender(<LanguageSyncProvider initialLanguage="en">second</LanguageSyncProvider>);
    expect(setLanguageReady.mock.calls.map(args=>args[0])).toEqual([false,true]); view.unmount();
  });
  it('ignores cancelled work when requestIdleCallback exists without cancelIdleCallback', async () => {
    const callbacks: Array<() => void>=[];
    vi.stubGlobal('requestIdleCallback',(callback: () => void)=>callbacks.push(callback));
    vi.stubGlobal('cancelIdleCallback',undefined);
    vi.spyOn(window.navigator,'language','get').mockReturnValue('en-US');
    const view=render(<LanguageSyncProvider initialLanguage="ko">first</LanguageSyncProvider>);
    currentLanguage='ko';
    view.rerender(<LanguageSyncProvider initialLanguage="ko">second</LanguageSyncProvider>);
    await act(async () => { for(const callback of callbacks) callback(); });
    expect(setCurrentLang).toHaveBeenCalledTimes(1); expect(setCurrentLang).toHaveBeenCalledWith('en'); view.unmount();
  });
});
