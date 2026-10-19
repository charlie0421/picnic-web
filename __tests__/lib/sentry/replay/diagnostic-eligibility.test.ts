import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkDiagnosticEligibility } from '@/lib/sentry/replay/diagnostic-eligibility';
const digest = 'c'.repeat(64);
const allowance = { allowed: true, manifestSha256: digest, disclosure: { retentionDays: 90, storedTechnicalFields: ['browser'] } };
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv('NEXT_PUBLIC_REPLAY_DIAGNOSTIC_MANIFEST_SHA256', digest); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('checks a strict response with same-origin credentials and no caching or redirects', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(allowance))); vi.stubGlobal('fetch', fetcher);
  expect(await checkDiagnosticEligibility(new AbortController().signal)).toEqual(allowance);
  expect(fetcher).toHaveBeenCalledWith('/api/replay/eligibility?mode=diagnostic', expect.objectContaining({ cache:'no-store', credentials:'same-origin', redirect:'error' }));
});
it.each([{...allowance, extra:true}, {...allowance, manifestSha256:'bad'}, {...allowance, allowed:false}])('rejects an invalid response', async body => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
  expect(await checkDiagnosticEligibility(new AbortController().signal)).toBeNull();
});
it('does not fetch after abort, and settles on abort even when fetch ignores its signal', async () => {
  const controller = new AbortController(); const fetcher = vi.fn(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher);
  controller.abort(); expect(await checkDiagnosticEligibility(controller.signal)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  const active = new AbortController(); const pending = checkDiagnosticEligibility(active.signal); active.abort(); expect(await pending).toBeNull();
});
it('includes JSON parsing within the 1 second deadline and ignores late completion', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, redirected:false, json: () => new Promise(r => {resolve=r;}) }));
  const pending=checkDiagnosticEligibility(new AbortController().signal); await vi.advanceTimersByTimeAsync(1001);
  expect(await pending).toBeNull(); resolve(allowance); await Promise.resolve();
});
it.each([302, 404, 500])('denies HTTP %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null,{status})));
  expect(await checkDiagnosticEligibility(new AbortController().signal)).toBeNull();
});

it('rejects an older server response that still requires intake', async () => {
  const stale = {...allowance, disclosure:{...allowance.disclosure, deletionRequestUrl:'https://www.picnic.fan/support'}};
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(stale))));
  expect(await checkDiagnosticEligibility(new AbortController().signal)).toBeNull();
});
