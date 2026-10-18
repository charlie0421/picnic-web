import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
const fixture = vi.hoisted(() => ({ signals: null as any, runtime: vi.fn(), deps: null as any }));
vi.mock('@/lib/sentry/replay/signals', async original => ({ ...await original<any>(), get replaySignals() { return fixture.signals; } }));
vi.mock('@/lib/sentry/replay/runtime', () => ({ createProductReplayRuntime: (deps: any) => { fixture.deps = deps; return fixture.runtime(deps); } }));
vi.mock('@sentry/nextjs', async () => await import('@sentry/browser'));
import * as Sentry from '@sentry/browser';
import { attachLocalReplay } from '@/lib/sentry/replay/bridge';
const config = { origin: 'http://127.0.0.1:53931', endpoint: 'http://127.0.0.1:59862/replay' };
const normal = { send: vi.fn().mockResolvedValue({ statusCode: 200 }), flush: vi.fn().mockResolvedValue(true) };
beforeEach(() => {
  fixture.signals = createReplaySignals(); fixture.deps = null; fixture.runtime.mockReset().mockReturnValue({ transport: normal });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"anonymous":true}')));
});
afterEach(async () => { await Sentry.close(100); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('removes Replay from real SDK dynamic sampling context and outgoing baggage', async () => {
  // jsdom runs in Node; select the same browser path that webpack uses. The recorder itself is real.
  vi.stubGlobal('__SENTRY_BROWSER_BUNDLE__', true);
  Sentry.init({ dsn: 'http://public@127.0.0.1:59862/1', transport: () => normal, tracesSampleRate: 1,
    replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });
  await attachLocalReplay(config, normal);
  const sdk = await fixture.deps.load();
  sdk.start();
  try {
    expect(Sentry.getReplay()?.getReplayId()).toBeTruthy(); // Exercise an active real recorder.
    const trace = Sentry.getTraceData();
    expect(trace.baggage).toContain('sentry-trace_id');
    expect(trace.baggage).not.toContain('replay_id');
  } finally { fixture.signals.close(); await sdk.stop(); }
});
