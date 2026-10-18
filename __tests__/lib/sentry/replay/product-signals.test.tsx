import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
const state = vi.hoisted(() => ({ signals: null as any }));
vi.mock('@/lib/sentry/replay/signals', async importOriginal => ({
  ...await importOriginal<any>(), get replaySignals() { return state.signals; },
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ lang: 'ko' }) }));
import { ConsentAwareAdsense } from '@/components/client/ads/ConsentAwareAdsense';
import { CookieConsentBanner } from '@/components/client/ads/CookieConsentBanner';

describe('product consent barriers', () => {
  beforeEach(() => { state.signals = createReplaySignals(); localStorage.clear(); document.getElementById('adsense-script')?.remove(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); document.getElementById('adsense-script')?.remove(); });
  it.each([null, '{broken', '{}'])('does not consider %s an ad denial', stored => {
    if (stored !== null) localStorage.setItem('picnic-cookie-consent', stored);
    render(<ConsentAwareAdsense clientId="synthetic" />);
    expect(state.signals.snapshot().ads).toBe('unknown');
  });
  it('keeps storage failures unknown', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    render(<ConsentAwareAdsense clientId="synthetic" />);
    expect(state.signals.snapshot().ads).toBe('unknown');
    expect(document.getElementById('adsense-script')).toBeNull();
  });
  it('recognizes only explicit denial and closes before inserting an approved ad script', () => {
    localStorage.setItem('picnic-cookie-consent', 'denied');
    render(<ConsentAwareAdsense clientId="synthetic" />);
    expect(state.signals.snapshot().ads).toBe('denied');
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      expect(state.signals.snapshot()).toMatchObject({ closed: true, adsEverLoaded: true });
      return append(node);
    });
    localStorage.setItem('picnic-cookie-consent', 'granted');
    fireEvent(window, new CustomEvent('picnic-consent-updated'));
    expect(document.getElementById('adsense-script')).not.toBeNull();
  });
  it('closes before saving the user consent choice', async () => {
    const { getByText } = render(<CookieConsentBanner />);
    await waitFor(() => expect(getByText('거부')).toBeTruthy(), { timeout: 1500 });
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
      expect(state.signals.snapshot().closed).toBe(true);
      return set.call(this, key, value);
    });
    fireEvent.click(getByText('거부'));
  });
});
