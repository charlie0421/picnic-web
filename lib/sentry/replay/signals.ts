export type ReplayAuth = 'unknown' | 'anonymous' | 'authenticated';
export type ReplayAds = 'unknown' | 'denied' | 'granted';
export type ReplayState = {
  auth: ReplayAuth; ads: ReplayAds; adsEverLoaded: boolean; closed: boolean;
  voteReady: boolean; bannersReady: boolean; popupReady: boolean; bannerCount: number; languageReady: boolean;
};

/** Only coarse safety facts. Call mutations before publishing the corresponding application change. */
export function createReplaySignals() {
  let state: ReplayState = { auth: 'unknown', ads: 'unknown', adsEverLoaded: false, closed: false,
    voteReady: false, bannersReady: false, popupReady: false, bannerCount: 0, languageReady: false };
  const listeners = new Set<(next: ReplayState) => void>();
  const snapshot = () => ({ ...state });
  function notify() {
    let closedOnError = false;
    for (const listener of Array.from(listeners)) {
      try { listener(snapshot()); } catch {
        if (!state.closed) { state = { ...state, closed: true }; closedOnError = true; }
      }
    }
    // Earlier listeners must see the closure too. Already-closed failures cannot recurse.
    if (closedOnError) notify();
  }
  function publish(patch: Partial<ReplayState>) {
    const next = { ...state, ...patch, closed: state.closed || patch.closed === true };
    if (Object.keys(next).every(key => next[key as keyof ReplayState] === state[key as keyof ReplayState])) return;
    state = next;
    notify();
  }
  return {
    snapshot,
    subscribe(listener: (next: ReplayState) => void) {
      listeners.add(listener);
      try { listener(snapshot()); } catch { publish({ closed: true }); }
      return () => { listeners.delete(listener); };
    },
    close() { publish({ closed: true }); },
    setAuth(auth: ReplayAuth) {
      publish({ auth, closed: auth === 'authenticated' || (state.auth === 'anonymous' && auth !== 'anonymous') });
    },
    setAds(ads: ReplayAds) {
      publish({ ads, closed: ads === 'granted' || (state.ads === 'denied' && ads !== 'denied') });
    },
    markAdsLoaded() { publish({ adsEverLoaded: true, closed: true }); },
    setLanguageReady(languageReady: boolean) {
      publish({ languageReady, closed: state.languageReady && !languageReady });
    },
    setReady(section: 'vote' | 'banner' | 'popup', bannerCount?: number) {
      if (section === 'banner') {
        if (!Number.isInteger(bannerCount) || bannerCount! < 0 || bannerCount! > 100) { publish({ closed: true }); return; }
        publish({ bannersReady: true, bannerCount, closed: state.bannersReady && state.bannerCount !== bannerCount });
      } else publish(section === 'vote' ? { voteReady: true } : { popupReady: true });
    },
  };
}

export type ReplaySignals = ReturnType<typeof createReplaySignals>;
export const replaySignals = createReplaySignals();
