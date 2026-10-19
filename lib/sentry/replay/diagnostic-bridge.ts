import type { Transport } from '@sentry/core';
import { createController } from '@/scripts/replay-p0/controller';
import { isEligible, type SdkHandle, type Transform } from '@/scripts/replay-p0/contract';
import { diagnosticBuildMetadata } from './diagnostic-build-metadata';
import { diagnosticConfig, type DiagnosticAllowance, type DiagnosticConfig, type DiagnosticDisclosure } from './diagnostic-config';
import { diagnosticSession, type DiagnosticSession } from './diagnostic-session';
import { replaySignals, type ReplaySignals } from './signals';
import { diagnosticPageIsSafe, localPageIsSafe } from './page-safety';
import { syntheticDiagnosticOrigin } from './diagnostic-test-config';
import { installReplayInteractionLifecycle } from './lifecycle';
import { checkDiagnosticEligibility } from './diagnostic-eligibility';
import { createDiagnosticTransport } from './diagnostic-transport';
import { diagnosticWorkerTransform } from './worker-client';
import { getDiagnosticNormalTransport, installDiagnosticTransport } from './diagnostic-registry';

export type DiagnosticView = { phase: 'unavailable' | 'ready' | 'loading' | 'recording' | 'closed';
  id: string | null; delivery: 'none' | 'accepted' | 'unknown'; disclosure: DiagnosticDisclosure | null };
export type DiagnosticBridge = { start(): void; stop(): void; idDisplayed(id: string): void;
  snapshot(): DiagnosticView; subscribe(fn: () => void): () => void };
type DiagnosticSdk = SdkHandle & { getReplayId(): string | undefined };
type Deps = { config: DiagnosticConfig; signals: ReplaySignals; session: DiagnosticSession; normal: Transport; win: Window;
  loadSdk(): Promise<DiagnosticSdk>; eligible(signal: AbortSignal): Promise<DiagnosticAllowance | null>;
  install(transport: Transport): boolean; interaction(): () => void; transform: Transform; fetch: typeof fetch;
  pageSafe(): boolean; ready(): boolean; visible(): boolean; now(): number };
export const UNAVAILABLE_DIAGNOSTIC_VIEW: DiagnosticView = { phase: 'unavailable', id: null, delivery: 'none', disclosure: null };

export function createDiagnosticBridge(deps: Deps): DiagnosticBridge {
  let view = UNAVAILABLE_DIAGNOSTIC_VIEW, checked = false;
  const listeners = new Set<() => void>(), pending = new AbortController();
  let transport: ReturnType<typeof createDiagnosticTransport> | undefined;
  let removeInteraction = () => {}, unsubscribe = () => {};
  const publish = (patch: Partial<DiagnosticView>) => { view = { ...view, ...patch }; for (const fn of Array.from(listeners)) fn(); };
  const eligibility = () => ({ ...deps.signals.snapshot(), initialized: !deps.signals.snapshot().closed && !deps.session.snapshot().closed
    && deps.ready() && deps.signals.snapshot().voteReady && deps.signals.snapshot().bannersReady && deps.signals.snapshot().popupReady,
    exactPublicRoute: deps.visible() && deps.pageSafe() });
  const local = () => isEligible(eligibility());
  function stop() {
    if (view.phase === 'closed') return;
    deps.session.close(); publish({ phase: 'closed' });
    pending.abort(); controller.close('ineligible'); transport?.cancel();
    deps.signals.close(); removeInteraction(); unsubscribe(); deps.win.removeEventListener('load', update);
  }
  const controller = createController({
    readEligibility: eligibility, readReadyState: () => deps.ready() ? 'complete' : 'loading', now: deps.now,
    durationMs: 60000, monotonic: true, onCleanup: () => {}, cancelOwnedWork: stop,
    load: async () => {
      const sdk = await deps.loadSdk();
      return {
        start() {
          sdk.start();
          const id = sdk.getReplayId();
          if (!id || !/^[a-f0-9]{32}$/.test(id)) { stop(); return; }
          if (view.phase !== 'closed') publish({ phase: 'recording', id });
        }, stop: () => sdk.stop(), flush: () => sdk.flush(),
      };
    },
  });
  function valid(allowance: DiagnosticAllowance | null): allowance is DiagnosticAllowance {
    return allowance?.allowed === true && allowance.manifestSha256 === deps.config.manifestSha256;
  }
  function update() {
    const state = deps.signals.snapshot();
    if (deps.session.snapshot().closed || state.closed || state.auth === 'authenticated' || state.ads === 'granted' || state.adsEverLoaded || !deps.visible()) { stop(); return; }
    if (deps.ready() && !deps.pageSafe()) { stop(); return; }
    if (view.phase === 'loading' || view.phase === 'recording') { controller.eligibilityChanged(); return; }
    if (checked || !local()) return;
    checked = true;
    void deps.eligible(pending.signal).then(allowance => {
      if (pending.signal.aborted || !local() || !valid(allowance)) { stop(); return; }
      publish({ phase: 'ready', disclosure: allowance.disclosure });
    }, stop);
  }
  function start() {
    if (view.phase !== 'ready' || !local()) return;
    // Install in this event handler, before consent or any asynchronous SDK work.
    removeInteraction = deps.interaction();
    if (!deps.session.consent()) { stop(); return; }
    const disclosure = view.disclosure;
    publish({ phase: 'loading' });
    void (async () => {
      try {
        const allowance = await deps.eligible(pending.signal);
        if (pending.signal.aborted || !local() || !valid(allowance) || JSON.stringify(allowance.disclosure) !== JSON.stringify(disclosure)) { stop(); return; }
        transport = createDiagnosticTransport({ config: deps.config, disclosure: allowance.disclosure, normal: deps.normal, transform: deps.transform, fetch: deps.fetch,
          gate: () => controller.snapshot(), close: () => stop(), locallyEligible: () => deps.session.snapshot().attempted && local(),
          visibleId: () => deps.session.snapshot().visibleId, eligible: deps.eligible,
          onDelivery: delivery => publish({ delivery }),
        });
        if (!deps.install(transport.transport)) { stop(); return; }
        await controller.prepare();
      } catch { stop(); }
    })();
  }
  deps.win.addEventListener('load', update);
  unsubscribe = deps.signals.subscribe(update);
  if (view.phase === 'closed') unsubscribe();
  return { start, stop, snapshot: () => view, subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    idDisplayed(id) { if (view.phase !== 'recording' || id !== view.id || !deps.session.markIdVisible(id)) stop(); },
  };
}
let singleton: DiagnosticBridge | undefined;
export function getDiagnosticBridge(): DiagnosticBridge {
  if (singleton) return singleton;
  const metadata = diagnosticBuildMetadata();
  const config = diagnosticConfig(process.env.NEXT_PUBLIC_SENTRY_DSN ?? '', metadata.manifestSha256, metadata.commit);
  const normal = getDiagnosticNormalTransport();
  if (!config || !normal || typeof window === 'undefined') return { start() {}, stop() {}, idDisplayed() {}, snapshot: () => UNAVAILABLE_DIAGNOSTIC_VIEW, subscribe: () => () => {} };
  const synthetic = syntheticDiagnosticOrigin();
  singleton = createDiagnosticBridge({ config, normal, signals: replaySignals, session: diagnosticSession, win: window,
    eligible: checkDiagnosticEligibility, install: installDiagnosticTransport,
    interaction: () => installReplayInteractionLifecycle(replaySignals, window),
    transform: diagnosticWorkerTransform(synthetic ?? config.origin, () => replaySignals.snapshot().bannerCount), fetch: window.fetch.bind(window),
    pageSafe: () => synthetic ? location.href === synthetic + '/ko/vote' && localPageIsSafe() : diagnosticPageIsSafe(window), ready: () => document.readyState === 'complete',
    visible: () => document.visibilityState === 'visible', now: () => performance.now(),
    loadSdk: async () => {
      const Sentry = await import('@sentry/nextjs');
      let replay: ReturnType<typeof Sentry.replayIntegration> | undefined;
      return {
        start() {
          replay = Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true,
            stickySession: false, useCompression: false, minReplayDuration: 0, flushMinDelay: 1500, flushMaxDelay: 1500 });
          Sentry.addIntegration(replay);
          try { replay.start(); }
          finally { Sentry.getClient()?.on('createDsc', dsc => { delete dsc.replay_id; }); }
        }, getReplayId: () => replay?.getReplayId(), async stop() { await replay?.stop(); }, async flush() { await replay?.flush(); },
      };
    },
  });
  return singleton;
}
