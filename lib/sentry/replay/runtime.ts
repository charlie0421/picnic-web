import type { Transport } from '@sentry/core';
import { createController } from '@/scripts/replay-p0/controller';
import { createP0Transport } from '@/scripts/replay-p0/transport';
import type { SdkHandle, Transform } from '@/scripts/replay-p0/contract';
import type { LocalReplayConfig } from './config';
import type { ReplaySignals } from './signals';

type Dependencies = {
  signals: ReplaySignals; config: LocalReplayConfig; normal: Transport;
  load(): Promise<SdkHandle>; transform: Transform; fetch: typeof fetch;
  page(): { href: string; visible: boolean; ready: boolean };
  onReady(callback: () => void): () => void;
};

/** The same controller and projecting transport used by the P0 trials, bound to live product facts. */
export function createProductReplayRuntime(deps: Dependencies) {
  const { signals } = deps;
  let transport: ReturnType<typeof createP0Transport> | undefined;
  let removeReady = () => {};
  function eligibility() {
    const state = signals.snapshot(); const page = deps.page();
    return { ...state, initialized: !state.closed && page.ready && state.languageReady && state.voteReady && state.bannersReady && state.popupReady,
      exactPublicRoute: page.visible && page.href === deps.config.origin + '/ko/vote' };
  }
  const controller = createController({
    readEligibility: eligibility, readReadyState: () => deps.page().ready ? 'complete' : 'loading',
    load: deps.load, now: Date.now, onCleanup: () => {}, cancelOwnedWork: () => { transport?.cancel(); removeReady(); },
  });
  transport = createP0Transport({ normal: deps.normal, endpoint: deps.config.endpoint, fetch: deps.fetch, transform: deps.transform,
    close: reason => { signals.close(); controller.close(reason); },
    snapshot: () => { controller.eligibilityChanged(); return controller.snapshot(); },
  });
  function update() {
    const state = signals.snapshot(); const page = deps.page();
    if (state.closed || state.auth === 'authenticated' || state.ads === 'granted' || state.adsEverLoaded
      || page.href !== deps.config.origin + '/ko/vote' || !page.visible) { controller.close('ineligible'); return; }
    if (controller.snapshot().phase !== 'WAITING') { controller.eligibilityChanged(); return; }
    if (state.auth === 'anonymous' && state.ads === 'denied' && state.languageReady && state.voteReady && state.bannersReady && state.popupReady && page.ready) {
      void controller.prepare();
    }
  }
  removeReady = deps.onReady(update);
  const unsubscribe = signals.subscribe(update);
  return { transport, close() { signals.close(); controller.close('ineligible'); unsubscribe(); removeReady(); } };
}
