import { describe, it, expect } from 'vitest';
import {
  AntiAbuseError,
  AntiAbusePermissionError,
  mapAntiAbuseError,
} from '@/lib/anti-abuse/handler';

describe('mapAntiAbuseError', () => {
  it('PostgrestError P0001 RATE_LIMITED:signup → AntiAbuseError', () => {
    const e = { code: 'P0001', message: 'RATE_LIMITED:signup' };
    const m = mapAntiAbuseError(e);
    expect(m).toBeInstanceOf(AntiAbuseError);
    expect((m as AntiAbuseError).channel).toBe('signup');
    expect((m as AntiAbuseError).rawCode).toBe('P0001');
  });

  it('PostgrestError P0001 RATE_LIMITED:artist_request', () => {
    const e = { code: 'P0001', message: 'RATE_LIMITED:artist_request' };
    expect((mapAntiAbuseError(e) as AntiAbuseError).channel).toBe(
      'artist_request',
    );
  });

  it('PostgrestError 42501 → AntiAbusePermissionError with key', () => {
    const e = { code: '42501', message: 'permission denied: anti_abuse.admin' };
    const m = mapAntiAbuseError(e);
    expect(m).toBeInstanceOf(AntiAbusePermissionError);
    expect((m as AntiAbusePermissionError).requiredKey).toBe(
      'anti_abuse.admin',
    );
  });

  it('PostgrestError 42501 with unknown message — still permission error, key null', () => {
    const e = { code: '42501', message: 'permission denied for table foo' };
    const m = mapAntiAbuseError(e);
    expect(m).toBeInstanceOf(AntiAbusePermissionError);
    expect((m as AntiAbusePermissionError).requiredKey).toBeNull();
  });

  it('Edge fn 429 nested rateLimitedResponse shape (ad_watch)', () => {
    const e = {
      status: 429,
      details: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          details: { reason: 'ad_watch_ip_quota' },
        },
      },
    };
    const m = mapAntiAbuseError(e);
    expect(m).toBeInstanceOf(AntiAbuseError);
    expect((m as AntiAbuseError).channel).toBe('ad_watch');
  });

  it('Edge fn 429 nested via `response.data` field', () => {
    const e = {
      status: 429,
      response: {
        data: {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            details: { reason: 'attendance_ip_quota' },
          },
        },
      },
    };
    const m = mapAntiAbuseError(e);
    expect(m).toBeInstanceOf(AntiAbuseError);
    expect((m as AntiAbuseError).channel).toBe('attendance');
  });

  it('Edge fn 429 flat shape (defensive fallback)', () => {
    const e = {
      status: 429,
      details: { code: 'RATE_LIMITED', reason: 'ad_watch_ip_quota' },
    };
    expect((mapAntiAbuseError(e) as AntiAbuseError).channel).toBe('ad_watch');
  });

  it('Edge fn 429 with non-RATE_LIMITED body returns null', () => {
    const e = { status: 429, details: { error: 'too many' } };
    expect(mapAntiAbuseError(e)).toBeNull();
  });

  it('Edge fn non-429 status returns null', () => {
    const e = {
      status: 500,
      details: { code: 'RATE_LIMITED', reason: 'ad_watch_ip_quota' },
    };
    expect(mapAntiAbuseError(e)).toBeNull();
  });

  it('PostgrestError unrelated code returns null', () => {
    expect(mapAntiAbuseError({ code: '23505', message: 'unique_violation' })).toBeNull();
  });

  it('non-object inputs return null', () => {
    expect(mapAntiAbuseError(null)).toBeNull();
    expect(mapAntiAbuseError(undefined)).toBeNull();
    expect(mapAntiAbuseError('string')).toBeNull();
    expect(mapAntiAbuseError(42)).toBeNull();
  });

  it('RATE_LIMITED: with empty channel still returns AntiAbuseError', () => {
    const e = { code: 'P0001', message: 'RATE_LIMITED:' };
    const m = mapAntiAbuseError(e);
    expect(m).toBeInstanceOf(AntiAbuseError);
    expect((m as AntiAbuseError).channel).toBe('');
  });
});
