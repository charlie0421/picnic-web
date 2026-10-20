'use strict';
const SYNTHETIC_DSN = `https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1`;
function validateDiagnosticTestBuild(env) {
  if (env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_TEST !== '1') return;
  if (env.VERCEL || env.VERCEL_ENV || env.ENVELOPE_TEST !== '1'
    || env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:59862' || env.NEXT_PUBLIC_SENTRY_DSN !== SYNTHETIC_DSN
    || env.NEXT_PUBLIC_REPLAY_LOCAL_TEST === '1') throw new Error('Diagnostic synthetic configuration must stay isolated on loopback');
}
module.exports = { validateDiagnosticTestBuild, SYNTHETIC_DSN };
