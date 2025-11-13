'use client';

export const SUPABASE_AUTH_RATE_LIMIT_EVENT = 'supabase-auth-rate-limit';

export type NotificationLevel = 'success' | 'error' | 'warning' | 'info';

export interface SupabaseAuthRateLimitDetail {
  title?: string;
  message?: string;
  duration?: number;
  type?: NotificationLevel;
  titleKey?: string;
  messageKey?: string;
}

const DEFAULT_RATE_LIMIT_DETAIL: SupabaseAuthRateLimitDetail = {
  type: 'warning',
  titleKey: 'notifications.auth.rateLimitTitle',
  messageKey: 'notifications.auth.rateLimitMessage',
  title: 'Session expired',
  message: 'You were automatically signed out after too many requests. Please sign in again.',
  duration: 8000,
};

export function emitSupabaseAuthRateLimit(detail?: SupabaseAuthRateLimitDetail) {
  if (typeof window === 'undefined') return;

  const payload: SupabaseAuthRateLimitDetail = {
    ...DEFAULT_RATE_LIMIT_DETAIL,
    ...detail,
  };

  window.dispatchEvent(
    new CustomEvent<SupabaseAuthRateLimitDetail>(SUPABASE_AUTH_RATE_LIMIT_EVENT, {
      detail: payload,
    }),
  );
}

