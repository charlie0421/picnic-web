import { afterEach, beforeEach, expect, it } from 'vitest';
import { createReplaySignals } from '@/lib/sentry/replay/signals';
import { installReplayLifecycle } from '@/lib/sentry/replay/lifecycle';

let cleanup: () => void;
beforeEach(() => { history.replaceState(null, '', '/ko/vote'); document.body.innerHTML = '<a href="/login">Login</a><section class="vote-banner-section"><div class="banner-carousel"><button data-replay-action="banner">Next</button></div></section><main>Scroll area</main>'; });
afterEach(() => { cleanup?.(); document.body.innerHTML = ''; });

it('closes before an app click handler can reveal a login dialog', () => {
  const signals = createReplaySignals(); cleanup = installReplayLifecycle(signals, window);
  let observed = false;
  document.querySelector('a')!.addEventListener('click', event => { event.preventDefault(); observed = signals.snapshot().closed; });
  document.querySelector('a')!.click();
  expect(observed).toBe(true);
});
it('permits banner actions and scrolling but closes before other keyboard actions', () => {
  const signals = createReplaySignals(); cleanup = installReplayLifecycle(signals, window);
  document.querySelector('button')!.click();
  document.querySelector('main')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  window.dispatchEvent(new Event('scroll'));
  expect(signals.snapshot().closed).toBe(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  expect(signals.snapshot().closed).toBe(true);
});
it('does not trust a banner attribute outside the approved controls', () => {
  const signals = createReplaySignals(); cleanup = installReplayLifecycle(signals, window);
  const button = document.createElement('button'); button.dataset.replayAction = 'banner'; document.body.append(button);
  button.click(); expect(signals.snapshot().closed).toBe(true);
});
it.each(['popstate', 'hashchange', 'pagehide', 'storage', 'resize'])('closes on %s', event => {
  const signals = createReplaySignals(); cleanup = installReplayLifecycle(signals, window);
  window.dispatchEvent(new Event(event)); expect(signals.snapshot().closed).toBe(true);
});
it.each(['pushState', 'replaceState'] as const)('closes before %s updates the URL', method => {
  const signals = createReplaySignals(); const before = location.href; let seen = '';
  signals.subscribe(state => { if (state.closed) seen = location.href; });
  cleanup = installReplayLifecycle(signals, window);
  history[method](null, '', '/ko/vote?status=completed');
  expect(seen).toBe(before); expect(location.search).toBe('?status=completed');
});
it('closes when a document is restored from bfcache', () => {
  const signals = createReplaySignals(); cleanup = installReplayLifecycle(signals, window);
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  expect(signals.snapshot().closed).toBe(true);
});
