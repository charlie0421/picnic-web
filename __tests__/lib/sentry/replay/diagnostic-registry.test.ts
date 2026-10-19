import { beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => vi.resetModules());
const normal = { send: vi.fn(), flush: vi.fn(async () => true) };
function target(href: string) {
  return { location: { href }, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    document: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    history: { pushState: vi.fn(), replaceState: vi.fn() } };
}
it.each(['https://www.picnic.fan/en/vote','https://www.picnic.fan/ko/faq','https://preview.vercel.app/ko/vote'])
  ('closes an out-of-scope document without wrapping history or adding listeners: %s', async href => {
    const { initializeDiagnosticDocument } = await import('@/lib/sentry/replay/diagnostic-registry');
    const { diagnosticSession } = await import('@/lib/sentry/replay/diagnostic-session');
    const { replaySignals } = await import('@/lib/sentry/replay/signals');
    const win = target(href), push = win.history.pushState, replace = win.history.replaceState;
    initializeDiagnosticDocument(normal, win as unknown as Window);
    expect(win.addEventListener).not.toHaveBeenCalled();expect(win.document.addEventListener).not.toHaveBeenCalled();
    expect(win.history.pushState).toBe(push);expect(win.history.replaceState).toBe(replace);
    expect(diagnosticSession.snapshot().closed).toBe(true);expect(replaySignals.snapshot().closed).toBe(true);
  });
it('installs safety listeners once on the initial target document', async () => {
  const { initializeDiagnosticDocument } = await import('@/lib/sentry/replay/diagnostic-registry');
  const { diagnosticSession } = await import('@/lib/sentry/replay/diagnostic-session');
  const win = target('https://www.picnic.fan/ko/vote'), push = win.history.pushState;
  initializeDiagnosticDocument(normal, win as unknown as Window);const calls=win.addEventListener.mock.calls.length;
  initializeDiagnosticDocument(normal, win as unknown as Window);
  expect(calls).toBeGreaterThan(0);expect(win.addEventListener).toHaveBeenCalledTimes(calls);
  expect(win.history.pushState).not.toBe(push);expect(diagnosticSession.snapshot().closed).toBe(false);
});
