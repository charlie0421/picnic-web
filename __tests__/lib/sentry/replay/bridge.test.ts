import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
const fixture = vi.hoisted(() => ({ signals: null as any, runtime: vi.fn(), deps: null as any }));
vi.mock('@/lib/sentry/replay/signals', async original => ({ ...await original<any>(), get replaySignals() { return fixture.signals; } }));
vi.mock('@/lib/sentry/replay/runtime', () => ({ createProductReplayRuntime: (deps: any) => { fixture.deps = deps; return fixture.runtime(deps); } }));
vi.mock('@sentry/nextjs', async () => await import('@sentry/browser'));
import { attachLocalReplay } from '@/lib/sentry/replay/bridge';
const config = { origin: 'http://127.0.0.1:53931', endpoint: 'http://127.0.0.1:59862/replay' };
const normal = { send: vi.fn().mockResolvedValue({ statusCode: 200 }), flush: vi.fn().mockResolvedValue(true) };
beforeEach(() => {
  fixture.signals = createReplaySignals(); fixture.deps = null; fixture.runtime.mockReset().mockReturnValue({ transport: normal });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"anonymous":true}')));
});
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('does not report ready while React streaming placeholders remain after load', async () => {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  document.body.innerHTML = '<div hidden id="S:4"><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template></div>';
  await attachLocalReplay(config, normal);
  expect(fixture.deps.page().ready).toBe(false);
  const ready = vi.fn(); const remove = fixture.deps.onReady(ready);
  document.body.replaceChildren(); await Promise.resolve();
  expect(fixture.deps.page().ready).toBe(true); expect(ready).toHaveBeenCalledTimes(1); remove();
});
it.each(['not-json', '{"anonymous":"true"}', '{"anonymous":true,"extra":1}', '{"anonymous":false}', 'null'])('closes on an invalid eligibility response %s', async body => {
  vi.mocked(fetch).mockResolvedValue(new Response(body));
  expect(await attachLocalReplay(config, normal)).toBeUndefined();
  expect(fixture.signals.snapshot().closed).toBe(true); expect(fixture.runtime).not.toHaveBeenCalled();
});
it('closes on the 1s eligibility deadline without starting a runtime', async () => {
  vi.useFakeTimers(); vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const work = attachLocalReplay(config, normal); await vi.advanceTimersByTimeAsync(1000);
  expect(await work).toBeUndefined(); expect(fixture.signals.snapshot().closed).toBe(true); expect(fixture.runtime).not.toHaveBeenCalled();
});
it('does not start when closed while eligibility is pending', async () => {
  let resolve!: (r: Response) => void; vi.mocked(fetch).mockImplementation(() => new Promise(r => { resolve = r; }));
  const work = attachLocalReplay(config, normal); fixture.signals.close(); resolve(new Response('{"anonymous":true}'));
  expect(await work).toBeUndefined(); expect(fixture.runtime).not.toHaveBeenCalled();
});
it('closes when runtime construction rejects a non-loopback endpoint', async () => {
  fixture.runtime.mockImplementation(() => { throw new Error('loopback-only'); });
  expect(await attachLocalReplay(config, normal)).toBeUndefined(); expect(fixture.signals.snapshot().closed).toBe(true);
});
