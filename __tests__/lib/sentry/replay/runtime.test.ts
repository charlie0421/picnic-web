import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
import { createProductReplayRuntime } from '@/lib/sentry/replay/runtime';
import { emptyProjectionState } from '@/scripts/replay-p0/contract';
const config = { origin: 'http://127.0.0.1:53931', endpoint: 'http://127.0.0.1:59862/replay' };
function fixture() {
  const signals = createReplaySignals();
  const sdk = { start: vi.fn(), stop: vi.fn().mockResolvedValue(undefined), flush: vi.fn().mockResolvedValue(undefined) };
  const load = vi.fn().mockResolvedValue(sdk);
  const normal = { send: vi.fn().mockResolvedValue({ statusCode: 200 }), flush: vi.fn().mockResolvedValue(true) };
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
  const transform = vi.fn().mockResolvedValue({ ok: true, value: { bytes: new Uint8Array([1]), next: emptyProjectionState(), segment: 0 } });
  let href = config.origin + '/ko/vote';
  const runtime = () => createProductReplayRuntime({ signals, config, normal, load, transform, fetch,
    page: () => ({ href, visible: true, ready: true }), onReady: () => () => {} });
  const ready = (languageReady=true) => { if(languageReady)signals.setLanguageReady(true); signals.setAuth('anonymous'); signals.setAds('denied'); signals.setReady('vote'); signals.setReady('banner', 5); signals.setReady('popup'); };
  return { signals, sdk, load, normal, fetch, transform, runtime, ready, navigate: () => { href += '?status=end'; } };
}
afterEach(() => vi.useRealTimers());
describe('product Replay runtime', () => {
  it('waits for all affirmative facts and starts once', async () => {
    vi.useFakeTimers(); const f = fixture(); const r = f.runtime();
    expect(f.load).not.toHaveBeenCalled();
    f.ready(); await Promise.resolve(); await Promise.resolve();
    expect(f.sdk.start).toHaveBeenCalledTimes(1);
    f.signals.setReady('vote'); expect(f.sdk.start).toHaveBeenCalledTimes(1);
    r.close();
  });
  it('never starts if closed while the SDK import is pending', async () => {
    const f = fixture(); let release!: (sdk: typeof f.sdk) => void;
    f.load.mockReturnValue(new Promise(resolve => { release = resolve; }));
    f.ready(); f.runtime(); f.signals.close(); release(f.sdk); await Promise.resolve(); await Promise.resolve();
    expect(f.sdk.start).not.toHaveBeenCalled(); expect(f.sdk.stop).toHaveBeenCalledTimes(1);
  });
  it('checks the live route again before sending and never restarts', async () => {
    vi.useFakeTimers(); const f = fixture(); f.ready(); const r = f.runtime(); await Promise.resolve(); await Promise.resolve();
    f.navigate();
    await r.transport.send([{}, [[{ type: 'replay_event' }, {}], [{ type: 'replay_recording' }, 'raw']]] as any);
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.sdk.stop).toHaveBeenCalledTimes(1);
    f.signals.setReady('vote'); expect(f.sdk.start).toHaveBeenCalledTimes(1);
  });
  it('aborts pending transformation before a state change can send its result', async () => {
    vi.useFakeTimers(); const f = fixture(); let resolve!: (value: any) => void;
    f.transform.mockImplementation(() => new Promise(r => { resolve = r; }));
    f.ready(); const r = f.runtime(); await Promise.resolve(); await Promise.resolve();
    const sending = r.transport.send([{}, [[{ type: 'replay_event' }, {}], [{ type: 'replay_recording' }, 'raw']]] as any);
    f.signals.setAuth('authenticated');
    resolve({ ok: true, value: { bytes: new Uint8Array([1]), next: emptyProjectionState(), segment: 0 } });
    await sending; expect(f.fetch).not.toHaveBeenCalled(); expect(f.sdk.stop).toHaveBeenCalledTimes(1);
  });
});

it('waits for initial language loading and closes permanently on a later load', async () => {
  const f=fixture(); f.ready(false); const r=f.runtime(); await Promise.resolve(); await Promise.resolve();
  expect(f.sdk.start).not.toHaveBeenCalled(); f.signals.setLanguageReady(true); await Promise.resolve(); await Promise.resolve();
  expect(f.sdk.start).toHaveBeenCalledTimes(1); f.signals.setLanguageReady(false); expect(f.sdk.stop).toHaveBeenCalledTimes(1);
  f.signals.setLanguageReady(true); expect(f.sdk.start).toHaveBeenCalledTimes(1); r.close();
});
