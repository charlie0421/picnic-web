import { afterEach, expect, it, vi } from 'vitest';
import { replayDocumentReady, observeReplayDocumentReady } from '@/lib/sentry/replay/document-ready';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

it('waits for React streaming placeholders even after the document load event', async () => {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  document.body.innerHTML = '<div hidden id="S:4"><div><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template></div></div>';
  const ready = vi.fn(); const remove = observeReplayDocumentReady(window, ready);
  expect(replayDocumentReady(document)).toBe(false);
  window.dispatchEvent(new Event('load')); expect(ready).not.toHaveBeenCalled();
  document.querySelector('template')!.remove(); await settle();
  expect(replayDocumentReady(document)).toBe(false); expect(ready).not.toHaveBeenCalled();
  document.getElementById('S:4')!.remove(); await settle();
  expect(replayDocumentReady(document)).toBe(true); expect(ready).toHaveBeenCalledTimes(1);
  document.body.append(document.createElement('div')); window.dispatchEvent(new Event('load')); await settle();
  expect(ready).toHaveBeenCalledTimes(1); remove();
});

it('waits for document completion and releases listeners when cancelled', async () => {
  const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
  const ready = vi.fn(); const remove = observeReplayDocumentReady(window, ready);
  expect(replayDocumentReady(document)).toBe(false);
  state.mockReturnValue('complete'); window.dispatchEvent(new Event('load'));
  expect(ready).toHaveBeenCalledTimes(1); remove();
  document.body.innerHTML = '<template></template>';
  const cancelled = vi.fn(); const cancel = observeReplayDocumentReady(window, cancelled); cancel();
  document.body.replaceChildren(); await settle(); window.dispatchEvent(new Event('load'));
  expect(cancelled).not.toHaveBeenCalled();
});

it('does not become ready when an observer wakes for an unrelated mutation', async () => {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  document.body.innerHTML = '<template id="B:0"></template>';
  const ready = vi.fn(); const remove = observeReplayDocumentReady(window, ready);
  document.body.append(document.createElement('p')); await settle();
  expect(ready).not.toHaveBeenCalled(); expect(replayDocumentReady(document)).toBe(false); remove();
});
