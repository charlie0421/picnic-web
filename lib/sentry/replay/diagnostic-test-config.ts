/** Separate synthetic adapter. next.config rejects this flag in every Vercel environment. */
export function syntheticDiagnosticOrigin(): 'http://127.0.0.1:53931' | null {
  return process.env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_TEST === '1'
    && process.env.NEXT_PUBLIC_SUPABASE_URL === 'http://127.0.0.1:59862'
    && process.env.NEXT_PUBLIC_SENTRY_DSN === 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o1.ingest.us.sentry.io/1'
    ? 'http://127.0.0.1:53931' : null;
}
