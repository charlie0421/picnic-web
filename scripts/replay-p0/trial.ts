import * as Sentry from '@sentry/browser';
import { continueTrace } from '@sentry/core';
import { scrubBrowserEvent } from '../../lib/sentry/browser-scrub';
import { scrubSpan } from '../../lib/sentry/scrub';
import { createController } from './controller';
import { createP0Transport } from './transport';
import { transformInWorker } from './worker-client';
import type { Cleanup, Eligibility, Reason } from './contract';

export type TrialMode = 'normal' | 'close-import' | 'close-start' | 'close-snapshot' | 'close-transform'
  | 'close-fetch' | 'worker-timeout' | 'fetch-timeout' | 'finite-processor' | 'hung-processor' | 'hung-sdk-worker'
  | 'close-compression' | 'close-transport' | 'pagehide' | 'hidden' | 'bfcache' | 'expired' | 'css-canary';
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export function createTrial(mode: TrialMode = 'normal', compression = true) {
  if (location.hostname !== '127.0.0.1') throw new Error('loopback-only');
  if (mode === 'normal') {
    document.querySelector('.card span')!.firstChild!.textContent = 'canary-person@example.test';
    history.replaceState(null, '', '/ko/vote?canary=synthetic-path');
  }
  let eligibility: Eligibility = { initialized: true, auth: 'anonymous', ads: 'denied', adsEverLoaded: false, exactPublicRoute: true };
  let replay: ReturnType<typeof Sentry.replayIntegration> | undefined;
  let client: ReturnType<typeof Sentry.init>;
  let transport: ReturnType<typeof createP0Transport> | undefined;
  let cleanup: Cleanup = 'pending';
  let closeReason: Reason | null = null;
  let sdkAttempts = 0;
  let sdkStarts = 0;
  let closedAt: number | null = null;
  const lifecycle: { event: string; phase: string; cleanup: Cleanup; hidden: boolean; persisted?: boolean }[] = [];
  const noteLifecycle = (event: string, persisted?: boolean) => {
    if (mode !== 'bfcache') return;
    lifecycle.push({ event, phase: controller.snapshot().phase, cleanup, hidden: document.hidden, persisted });
    sessionStorage.setItem('p0-lifecycle', JSON.stringify(lifecycle));
  };
  const processorTimes: number[] = [];
  const networkStarts: { phase: string; generation: number; time: number }[] = [];
  const close = (reason: Reason) => { closeReason ??= reason; closedAt ??= performance.now(); controller.close(reason); };
  let releaseImport: () => void = () => undefined;
  const importGate = new Promise<void>(resolve => { releaseImport = resolve; });
  const controller = createController({
    readEligibility: () => eligibility, readReadyState: () => document.readyState,
    cancelOwnedWork: () => transport?.cancel(), onCleanup: value => { cleanup = value; noteLifecycle('cleanup'); }, now: () => Date.now(),
    load: async () => {
      if (mode === 'close-import') await importGate;
      const { replayIntegration } = await import('@sentry-internal/replay');
      return {
        start() {
          sdkStarts++;
          if (mode === 'close-start') { close('ineligible'); return; }
          replay = replayIntegration({
            maskAllText: true, maskAllInputs: true, blockAllMedia: true, stickySession: false,
            useCompression: compression, minReplayDuration: 0, flushMinDelay: 60000, flushMaxDelay: 60000,
            beforeAddRecordingEvent(event) {
              if (mode === 'close-snapshot' && event.data.tag === 'options') close('ineligible');
              if (mode === 'normal' && event.data.tag === 'options') return { ...event,
                data: { ...event.data, payload: { ...event.data.payload, canary: 'canary-custom@example.test' } } };
              return event;
            },
          });
          client = Sentry.init({
            dsn: `http://public@${location.host}/1`, release: 'replay-p0-fixture', environment: 'replay-p0-local',
            replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0, tracesSampleRate: 1, tracePropagationTargets: [],
            beforeSend: scrubBrowserEvent, beforeSendTransaction: scrubBrowserEvent, beforeSendSpan: scrubSpan,
            integrations: [Sentry.browserTracingIntegration({ instrumentPageLoad: false, instrumentNavigation: false }), replay],
            transport(options) {
              transport = createP0Transport({ snapshot: controller.snapshot, close, endpoint: location.origin + '/replay',
                normal: Sentry.makeFetchTransport(options),
                transform(input, state, signal) {
                  const work = transformInWorker(input, state, signal);
                  if (mode === 'close-transform') close('ineligible');
                  return work;
                },
                fetch(input, init) {
                  networkStarts.push({ ...controller.snapshot(), time: performance.now() });
                  const request = fetch(input, init);
                  if (mode === 'close-fetch') close('ineligible');
                  return request;
                },
              });
              const owned = transport;
              return { flush: owned.flush, send(envelope) {
                if (envelope[1].some(i => i[0].type === 'replay_event')) {
                  sdkAttempts++;
                  if (mode === 'close-transport') close('ineligible');
                }
                return owned.send(envelope);
              } };
            },
          });
          if (!client) throw new Error('missing-client');
          if (mode === 'normal') client.addEventProcessor(event => event.type === 'replay_event' ? {
            ...event, user: { username: 'canary-user' }, request: { url: 'https://canary.invalid/private' },
            tags: { private: 'canary-tag' }, extra: { canary: 'canary-extra' },
          } : event);
          if (mode === 'finite-processor' || mode === 'hung-processor') client.addEventProcessor(event => {
            if (event.type !== 'replay_event') return event;
            processorTimes.push(performance.now());
            if (mode === 'hung-processor') return new Promise(() => undefined);
            throw new Error('synthetic-processor-failure');
          });
          replay.start();
        },
        stop: async () => { await replay?.stop(); },
        flush: async () => { await replay?.flush(); },
      };
    },
  });
  document.addEventListener('DOMContentLoaded', controller.domReady, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') close('hidden'); noteLifecycle('visibilitychange');
  });
  addEventListener('pagehide', event => { close('hidden'); noteLifecycle('pagehide', event.persisted); });
  let restored = false;
  addEventListener('pageshow', event => { if (event.persisted) restored = true; noteLifecycle('pageshow', event.persisted); });
  return {
    prepare: controller.prepare, flush: controller.flush, close, releaseImport,
    status: () => ({ ...controller.snapshot(), sdkVersion: Sentry.SDK_VERSION, cleanup, closeReason, closedAt,
      processorTimes: [...processorTimes], networkStarts: [...networkStarts], sdkAttempts, sdkStarts, restored }),
    forbid() { eligibility = { ...eligibility, auth: 'authenticated' }; controller.eligibilityChanged(); },
    async step(stage: number) {
      const card = document.querySelector<HTMLElement>('.card')!;
      const button = document.querySelector<HTMLButtonElement>('.toggle')!;
      if (stage === 1) {
        card.querySelector('span')!.firstChild!.textContent = 'Changed synthetic label';
        card.style.cssText = 'width:120px;height:100px;opacity:0.5;--banner-current-index:1';
        card.setAttribute('data-canary', 'canary-p0@example.test');
        button.setAttribute('aria-expanded', 'true'); button.click();
        await frame();
      } else {
        card.style.setProperty('width', '140px', 'important'); card.style.removeProperty('opacity'); await frame();
        card.remove(); await frame(); document.querySelector('.track')!.append(card); button.disabled = true; await frame();
        card.removeAttribute('style'); await frame();
      }
    },
    view: readView,
    async ordinary(phase: 'during' | 'after', cached = false) {
      const work = () => Sentry.startSpan({ name: `p0-${phase}`, op: 'p0', forceTransaction: true }, async () => {
        Sentry.captureException(new Error(`p0-synthetic-${phase}`)); await fetch('/probe/' + phase);
      });
      if (cached) await continueTrace({ sentryTrace: '11111111111111111111111111111111-2222222222222222-1',
        baggage: `sentry-trace_id=11111111111111111111111111111111,sentry-public_key=public,sentry-replay_id=${replay?.getReplayId() || '3'.repeat(32)},sentry-sampled=true` }, work);
      else await Sentry.startNewTrace(work);
      await Sentry.flush(5000);
    },
    async directRestart() {
      const before = sdkAttempts; replay?.start(); const restarted = !!replay?.getReplayId();
      try { await replay?.flush(); } catch { /* Expected closed-gate rejection. */ }
      await replay?.stop(); return { restarted, attempted: sdkAttempts - before };
    },
    async dispose() { close('hidden'); await client?.close(1000); },
  };
}

export function readView() {
  const rectangles = ['.fixture', '.track', '.card'].map(selector => {
    const element = document.querySelector<HTMLElement>(selector)!;
    const r = element.getBoundingClientRect();
    return { selector, x: r.x, y: r.y, width: r.width, height: r.height, opacity: Number(getComputedStyle(element).opacity) };
  });
  const button = document.querySelector<HTMLButtonElement>('.toggle')!;
  return { rectangles, expanded: button.getAttribute('aria-expanded'), disabled: button.disabled,
    index: getComputedStyle(document.querySelector('.card')!).getPropertyValue('--banner-current-index').trim() };
}
