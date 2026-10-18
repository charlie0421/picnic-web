import { describe, expect, it } from 'vitest';
import { createReplaySignals } from '@/lib/sentry/replay/signals';

describe('Replay document safety signals', () => {
  it('does not treat unknown auth or missing consent as eligible', () => {
    const signals = createReplaySignals();
    expect(signals.snapshot()).toMatchObject({ auth: 'unknown', ads: 'unknown', closed: false });
    signals.setAuth('anonymous');
    signals.setAds('denied');
    expect(signals.snapshot()).toMatchObject({ auth: 'anonymous', ads: 'denied', adsEverLoaded: false });
  });

  it('closes synchronously before the caller can publish authenticated UI', () => {
    const signals = createReplaySignals();
    signals.setAuth('anonymous');
    const seen: string[] = [];
    signals.subscribe(state => { if (state.closed) seen.push('closed'); });
    signals.setAuth('authenticated');
    seen.push('publish UI');
    expect(seen).toEqual(['closed', 'publish UI']);
    signals.setAuth('anonymous');
    expect(signals.snapshot().closed).toBe(true);
  });

  it('closes an already confirmed document when auth becomes uncertain', () => {
    const signals = createReplaySignals();
    signals.setAuth('unknown');
    expect(signals.snapshot().closed).toBe(false);
    signals.setAuth('anonymous');
    signals.setAuth('unknown');
    expect(signals.snapshot()).toMatchObject({ auth: 'unknown', closed: true });
  });

  it('never forgets an ad execution, even after consent is denied again', () => {
    const signals = createReplaySignals();
    signals.setAds('denied');
    signals.markAdsLoaded();
    signals.setAds('denied');
    expect(signals.snapshot()).toMatchObject({ closed: true, adsEverLoaded: true });
  });

  it('closes when denied consent becomes unknown or granted', () => {
    for (const next of ['unknown', 'granted'] as const) {
      const signals = createReplaySignals();
      signals.setAds('denied');
      signals.setAds(next);
      expect(signals.snapshot().closed).toBe(true);
    }
  });

  it('requires all page sections and closes when a ready section changes', () => {
    const signals = createReplaySignals();
    signals.setReady('vote'); signals.setReady('banner', 5);
    expect(signals.snapshot()).toMatchObject({ voteReady: true, bannersReady: true, popupReady: false, bannerCount: 5 });
    signals.setReady('popup');
    signals.setReady('banner', 6);
    expect(signals.snapshot().closed).toBe(true);
  });

  it('does not expose a mutable copy of its state to callers', () => {
    const signals = createReplaySignals();
    const state = signals.snapshot();
    state.auth = 'authenticated';
    expect(signals.snapshot().auth).toBe('unknown');
  });
});

it('synchronously tells earlier listeners about a later listener failure', () => {
  const signals = createReplaySignals(); const observed: boolean[] = [];
  signals.subscribe(state => observed.push(state.closed));
  signals.subscribe(state => { if (state.auth === 'anonymous') throw new Error('listener failure'); });
  signals.setAuth('anonymous');
  expect(signals.snapshot().closed).toBe(true);
  expect(observed.at(-1)).toBe(true);
});
