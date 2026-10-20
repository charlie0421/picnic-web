// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { validateDiagnosticTestBuild } from '@/scripts/replay-diagnostic/test-build.cjs';
import { harnessEnv } from '@/scripts/replay-p0/tools/vote-list-server.cjs';
import { syntheticDiagnosticOrigin } from '@/lib/sentry/replay/diagnostic-test-config';
const dsn=`https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1`;
afterEach(()=>vi.unstubAllEnvs());
it('provides an isolated diagnostic environment without enabling the old local recorder',()=>{
 const env=harnessEnv({out:'/o',fontMock:true,build:true,diagnostic:true});expect(env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_TEST).toBe('1');expect(env.NEXT_PUBLIC_REPLAY_LOCAL_TEST).toBeUndefined();expect(env.NEXT_PUBLIC_SENTRY_DSN).toBe(dsn);expect(env.REPLAY_DIAGNOSTIC_ENABLED).toBe('1');expect(env.REPLAY_NET_ALLOW).toBeUndefined();expect(()=>validateDiagnosticTestBuild(env)).not.toThrow();
});
it.each([{VERCEL:'1'},{VERCEL_ENV:'preview'},{ENVELOPE_TEST:''},{NEXT_PUBLIC_SUPABASE_URL:'https://real.supabase.co'},{NEXT_PUBLIC_SENTRY_DSN:'https://wrong@host/1'}])('refuses an unsafe synthetic build %j',patch=>{
 const env=harnessEnv({out:'/o',fontMock:true,build:true,diagnostic:true});expect(()=>validateDiagnosticTestBuild({...env,...patch})).toThrow();
});
it('cannot activate the synthetic origin with a partial flag or production data',()=>{
 expect(syntheticDiagnosticOrigin()).toBeNull();vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_TEST','1');expect(syntheticDiagnosticOrigin()).toBeNull();
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:59862');vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN',dsn);expect(syntheticDiagnosticOrigin()).toBe('http://127.0.0.1:53931');
});
