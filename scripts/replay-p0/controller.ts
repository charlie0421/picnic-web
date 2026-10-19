import { isEligible, type Cleanup, type Eligibility, type Gate, type Reason, type SdkHandle } from './contract';
export type ControllerDeps = { load(): Promise<SdkHandle>; readEligibility(): Eligibility;
  readReadyState(): DocumentReadyState; cancelOwnedWork(): void; onCleanup(status: Cleanup): void; now(): number;
  durationMs?: number; monotonic?: boolean };

/** Normal application calls only. Public SDK access elsewhere remains a documented limitation. */
export function createController(deps: ControllerDeps) {
  let gate: Gate = { phase: 'WAITING', generation: 0 };
  let sdk: SdkHandle | undefined;
  let stopped = false;
  let starting = false;
  let startedAt: number | null = null;
  let lastNow: number | null = null;
  const durationMs = deps.durationMs ?? 300000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = (status: Cleanup) => { try { deps.onCleanup(status); } catch { /* No raw diagnostic forwarding. */ } };
  function stop() {
    // record() installs its stop handle only when start() returns. The gate and owned work
    // close synchronously; public SDK cleanup waits for that same-stack installation.
    if (!sdk || stopped || starting) return;
    stopped = true; cleanup('pending');
    try { void sdk.stop().then(() => cleanup('resolved'), () => cleanup('rejected')); }
    catch { cleanup('rejected'); }
  }
  function close(_reason: Reason) {
    if (gate.phase === 'CLOSED') return;
    gate = { phase: 'CLOSED', generation: gate.generation + 1 };
    clearTimeout(timer);
    try { deps.cancelOwnedWork(); } catch { /* Keep the gate closed even if cancellation throws. */ }
    stop();
  }
  function eligible() {
    try { return isEligible(deps.readEligibility()); } catch { return false; }
  }
  function clock(): number | null {
    try {
      const now = deps.now();
      if (deps.monotonic && (!Number.isFinite(now) || now < 0 || (lastNow !== null && now < lastNow))) { close('expired'); return null; }
      lastNow = now; return now;
    } catch { close('expired'); return null; }
  }
  function domReady() {
    if (gate.phase !== 'LOADING' || !sdk) return;
    if (!eligible()) { close('ineligible'); return; }
    if (deps.readReadyState() === 'loading') return;
    gate.phase = 'ARMED';
    if (!eligible()) { close('ineligible'); return; }
    if (!Number.isFinite(durationMs) || durationMs <= 0) { close('expired'); return; }
    startedAt = clock(); if (startedAt === null) return;
    gate.phase = 'RECORDING';
    timer = setTimeout(() => close('expired'), durationMs);
    starting = true;
    try { sdk.start(); } catch { close('sdk'); }
    finally { starting = false; if (snapshot().phase === 'CLOSED') stop(); }
  }
  async function prepare() {
    if (gate.phase !== 'WAITING') return;
    if (!eligible()) { close('ineligible'); return; }
    gate = { phase: 'LOADING', generation: gate.generation + 1 };
    const generation = gate.generation;
    try {
      sdk = await deps.load();
      if (gate.generation !== generation) { stop(); return; }
      domReady();
    } catch { close('sdk'); }
  }
  function snapshot(): Gate {
    if (gate.phase === 'RECORDING' && startedAt !== null) {
      const now = clock(); if (now !== null && now - startedAt >= durationMs) close('expired');
    }
    return { ...gate };
  }
  async function flush() {
    if (snapshot().phase !== 'RECORDING' || !sdk) return;
    if (!eligible()) { close('ineligible'); return; }
    try { await sdk.flush(); } catch { close('sdk'); }
  }
  function eligibilityChanged() {
    if (gate.phase !== 'CLOSED' && !eligible()) close('ineligible');
  }
  return { prepare, eligibilityChanged, domReady, close, snapshot, flush };
}
