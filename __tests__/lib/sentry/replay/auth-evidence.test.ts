import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
const fixture = vi.hoisted(() => ({ signals: null as any, user: null as any }));
vi.mock('@/lib/sentry/replay/signals', async original => ({ ...await original<any>(), get replaySignals() { return fixture.signals; } }));
vi.mock('@/lib/supabase/client', () => ({ createBrowserSupabaseClient: vi.fn() }));
vi.mock('@/utils/jwt-parser', () => ({ getInstantUserFromCookies: () => fixture.user, getTokenExpiry: () => null, isTokenExpiringSoon: () => false }));
vi.mock('@/utils/storage', () => ({ setLastLoginInfo: vi.fn(), getProviderDisplayName: vi.fn() }));
import { performInstantUserAuthImpl } from '@/lib/supabase/auth-store-auth';
import { AuthSessionMissingError } from '@supabase/supabase-js';
function store(result: Promise<any>) {
  return { getIsAuthEvaluating: () => false, setIsAuthEvaluating: vi.fn(), getSupabaseClient: () => ({ auth: { getUser: () => result } }),
    getState: () => ({ user: null }), updateState: vi.fn(), getSignOutFn: vi.fn(), getLoadUserProfileFn: vi.fn(),
    loadUserProfile: vi.fn().mockResolvedValue({}), getLastExpiryWarningKey: vi.fn(), setLastExpiryWarningKey: vi.fn() } as any;
}
beforeEach(() => { fixture.signals = createReplaySignals(); fixture.user = null; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it.each([null, new AuthSessionMissingError()])('reports affirmative absent-session evidence: %s', async error => {
  await performInstantUserAuthImpl(store(Promise.resolve({ data: { user: null }, error })));
  expect(fixture.signals.snapshot().auth).toBe('anonymous');
});
it.each([{ message: 'network failure' }, undefined])('keeps malformed/failed auth unknown: %s', async error => {
  await performInstantUserAuthImpl(store(Promise.resolve({ data: { user: null }, error })));
  expect(fixture.signals.snapshot().auth).toBe('unknown');
});
it('does not accept a late response after the 1s timeout', async () => {
  vi.useFakeTimers(); let resolve!: (value: any) => void;
  const work = performInstantUserAuthImpl(store(new Promise(r => { resolve = r; })));
  await vi.advanceTimersByTimeAsync(1001); await work;
  resolve({ data: { user: null }, error: null }); await Promise.resolve();
  expect(fixture.signals.snapshot().auth).toBe('unknown');
});
it('closes before a JWT user is published', async () => {
  fixture.signals.setAuth('anonymous'); fixture.user = { id: 'synthetic-user', app_metadata: {} };
  const s = store(Promise.resolve({})); s.updateState.mockImplementation(() => expect(fixture.signals.snapshot().closed).toBe(true));
  await performInstantUserAuthImpl(s);
});
