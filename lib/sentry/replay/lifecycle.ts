import type { ReplaySignals } from './signals';

/** Install before loading the recorder. These listeners close; they never cancel the user's action. */
export function installReplayLifecycle(signals: ReplaySignals, win: Window): () => void {
  const removers: (() => void)[] = [];
  const close = () => signals.close();
  function listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener, true);
    removers.push(() => target.removeEventListener(type, listener, true));
  }
  const bannerAction = (event: Event) => event.target instanceof Element
    && !!event.target.closest('.vote-banner-section .banner-carousel button[data-replay-action="banner"]');
  listen(win, 'click', event => { if (!bannerAction(event)) close(); });
  listen(win, 'pointerdown', event => {
    if (!bannerAction(event) && event.target instanceof Element
      && event.target.closest('a,button,input,select,textarea,[role="button"],[contenteditable]')) close();
  });
  listen(win, 'keydown', event => {
    if (!bannerAction(event) || !['Enter', ' '].includes((event as KeyboardEvent).key)) close();
  });
  for (const event of ['beforeinput', 'input', 'change', 'submit', 'popstate', 'hashchange', 'pagehide', 'storage', 'resize', 'freeze', 'contextmenu', 'dragstart', 'picnic-consent-updated']) listen(win, event, close);
  listen(win, 'pageshow', event => { if ((event as PageTransitionEvent).persisted) close(); });
  listen(win.document, 'visibilitychange', () => { if (win.document.visibilityState !== 'visible') close(); });
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = win.history[method];
    const wrapped = function(this: History, ...args: Parameters<History['pushState']>) {
      const url = args[2];
      try { if (url != null && new URL(String(url), win.location.href).href !== win.location.href) close(); }
      catch { close(); }
      return original.apply(this, args);
    };
    win.history[method] = wrapped;
    removers.push(() => { if (win.history[method] === wrapped) win.history[method] = original; });
  }
  return () => { for (const remove of removers) remove(); };
}
