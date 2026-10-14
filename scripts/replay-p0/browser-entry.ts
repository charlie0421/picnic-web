import * as Sentry from '@sentry/browser';
import { continueTrace } from '@sentry/core';

type ProbeOptions = { propagation: boolean; cached: boolean };

/** Synthetic, loopback-only characterization. This module has no product importer. */
export async function captureContract({ propagation, cached }: ProbeOptions) {
  if (location.hostname !== '127.0.0.1') throw new Error('loopback-only');
  const replay = Sentry.replayIntegration({
    maskAllText: true, maskAllInputs: true, blockAllMedia: true,
    stickySession: false, useCompression: false,
    minReplayDuration: 0, flushMinDelay: 60_000, flushMaxDelay: 60_000,
  });
  const client = Sentry.init({
    dsn: `http://public@${location.host}/1`,
    environment: 'replay-p0-local', release: 'replay-p0-fixture',
    replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0,
    tracesSampleRate: 1, tracePropagationTargets: propagation ? [location.origin] : [],
    integrations: [Sentry.browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false }), replay],
  });
  if (!client) throw new Error('missing-client');
  replay.start();
  const replayId = replay.getReplayId();
  if (!replayId) throw new Error('missing-replay');
  let guardCalls = 0;
  client.on('createDsc', dsc => { guardCalls++; delete dsc.replay_id; });
  const exercise = () => Sentry.startSpan({ name: 'p0-probe', op: 'p0', forceTransaction: true }, async () => {
    await fetch('/probe/during');
    Sentry.captureException(new Error('p0-synthetic-error'));
    await replay.flush();
    const card = document.querySelector<HTMLElement>('.card')!;
    const label = card.querySelector('span')!;
    const button = document.querySelector<HTMLButtonElement>('.toggle')!;
    label.firstChild!.textContent = 'Changed synthetic label';
    card.style.cssText = 'width:120px;height:100px;opacity:0.5;--banner-current-index:1';
    button.setAttribute('aria-expanded', 'true');
    button.click();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await replay.flush();
    card.style.setProperty('width', '140px', 'important');
    card.style.removeProperty('opacity');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    card.remove();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    document.querySelector('.track')!.append(card);
    button.disabled = true;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    card.removeAttribute('style');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await replay.flush();
    await replay.stop();
    await fetch('/probe/after');
  });
  if (cached) {
    await continueTrace({
      sentryTrace: '11111111111111111111111111111111-2222222222222222-1',
      baggage: `sentry-trace_id=11111111111111111111111111111111,sentry-public_key=public,sentry-replay_id=${replayId},sentry-sampled=true`,
    }, exercise);
  } else {
    await Sentry.startNewTrace(exercise);
  }
  const flushed = await Sentry.flush(5000);
  await client.close(1000);
  return { sdkVersion: Sentry.SDK_VERSION, replayId, guardCalls, flushed };
}

Object.assign(window, { replayP0: { captureContract } });
