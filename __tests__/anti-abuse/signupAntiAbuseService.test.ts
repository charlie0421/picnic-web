import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    functions: { invoke: mockInvoke },
  }),
}));

import { AntiAbuseError } from '@/lib/anti-abuse/handler';
import {
  runSignupPrecheck,
  runSignupVerify,
  getStoredSignupHint,
  clearStoredSignupHint,
  type SignupHint,
} from '@/lib/anti-abuse/signupAntiAbuseService';

describe('runSignupPrecheck', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    clearStoredSignupHint();
  });

  it('returns SignupHint and persists to sessionStorage on 200 with sig', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: { ip_hash: 'abc', sig: 'sig_xyz', exp: 1234567890 },
      },
      error: null,
    });

    const hint = await runSignupPrecheck();
    expect(hint).toEqual({ ip_hash: 'abc', sig: 'sig_xyz', exp: 1234567890 });
    expect(getStoredSignupHint()).toEqual(hint);
  });

  it('returns null on 200 with skipped flag', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: { ip_hash: 'unknown', sig: null, exp: null, skipped: true },
      },
      error: null,
    });

    expect(await runSignupPrecheck()).toBeNull();
    expect(getStoredSignupHint()).toBeNull();
  });

  it('throws AntiAbuseError(signup) on 429 RATE_LIMITED', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        status: 429,
        details: {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            details: { reason: 'signup_ip_quota' },
          },
        },
      },
    });

    await expect(runSignupPrecheck()).rejects.toThrow(AntiAbuseError);
    try {
      await runSignupPrecheck();
    } catch (e) {
      expect((e as AntiAbuseError).channel).toBe('signup');
    }
  });

  it('returns null on supabase error that is not anti-abuse (silent fallback)', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { status: 500, message: 'server error' },
    });
    expect(await runSignupPrecheck()).toBeNull();
  });

  it('returns null on network exception (silent fallback)', async () => {
    mockInvoke.mockRejectedValue(new Error('network down'));
    expect(await runSignupPrecheck()).toBeNull();
  });

  it('returns null on malformed response (no data field)', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    expect(await runSignupPrecheck()).toBeNull();
  });

  it('returns null when sig fields have wrong types', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, data: { ip_hash: 'h', sig: 123, exp: 'oops' } },
      error: null,
    });
    expect(await runSignupPrecheck()).toBeNull();
  });
});

describe('runSignupVerify', () => {
  const hint: SignupHint = { ip_hash: 'abc', sig: 's', exp: 1 };

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('200 success — completes without throwing', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    await runSignupVerify(hint);
  });

  it('422 sig invalid — swallowed silently', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { status: 422, details: { error: { code: 'SIG_INVALID' } } },
    });
    await runSignupVerify(hint); // should not throw
  });

  it('401 unauthorized — swallowed silently', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { status: 401, message: 'unauthorized' },
    });
    await runSignupVerify(hint);
  });

  it('network exception — swallowed silently', async () => {
    mockInvoke.mockRejectedValue(new Error('boom'));
    await runSignupVerify(hint);
  });

  it('sends ip_hash, sig, exp in body', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    await runSignupVerify(hint);
    expect(mockInvoke).toHaveBeenCalledWith(
      'anti-abuse-signup-verify',
      { body: hint },
    );
  });
});

describe('getStoredSignupHint / clearStoredSignupHint', () => {
  beforeEach(() => clearStoredSignupHint());

  it('returns null when nothing stored', () => {
    expect(getStoredSignupHint()).toBeNull();
  });

  it('returns null on malformed json', () => {
    window.sessionStorage.setItem('aa_signup_hint', 'not-json');
    expect(getStoredSignupHint()).toBeNull();
  });

  it('returns null when fields missing or wrong type', () => {
    window.sessionStorage.setItem(
      'aa_signup_hint',
      JSON.stringify({ ip_hash: 'h', sig: 's' }), // exp 누락
    );
    expect(getStoredSignupHint()).toBeNull();
  });
});
