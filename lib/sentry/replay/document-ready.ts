// React can retain streamed HTML after the window load event. The projector
// deliberately rejects these temporary nodes; wait for hydration to remove them.
export function replayDocumentReady(doc: Document): boolean {
  return doc.readyState === 'complete' && !doc.querySelector('template,[hidden][id^="S:"]');
}

/** Wake the waiting gate once. Closure cancels this observer without starting Replay. */
export function observeReplayDocumentReady(win: Window, ready: () => void): () => void {
  let done = false;
  const observer = new MutationObserver(check);
  function remove() { done = true; observer.disconnect(); win.removeEventListener('load', check); }
  function check() {
    if (!done && replayDocumentReady(win.document)) { remove(); ready(); }
  }
  if (!replayDocumentReady(win.document)) {
    observer.observe(win.document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'id'] });
    win.addEventListener('load', check);
  }
  return remove;
}
