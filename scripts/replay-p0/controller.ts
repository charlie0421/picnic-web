import { isEligible, type Cleanup, type Eligibility, type Gate, type Reason, type SdkHandle } from './contract';
export type ControllerDeps = { load(): Promise<SdkHandle>; readEligibility(): Eligibility;
  readReadyState(): DocumentReadyState; cancelOwnedWork(): void; onCleanup(status: Cleanup): void; now(): number };

/** Normal application calls only. Public SDK access elsewhere remains a documented limitation. */
export function createController(deps: ControllerDeps) {
  let gate: Gate = { phase: 'WAITING', generation: 0 };
  let sdk: SdkHandle | undefined;
  let stopped = false;
  let startedAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = (status: Cleanup) => { try { deps.onCleanup(status); } catch { /* No raw diagnostic forwarding. */ } };
  function stop() {
    if (!sdk || stopped) return;
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
  function domReady() {
    if (gate.phase !== 'LOADING' || !sdk) return;
    if (!eligible()) { close('ineligible'); return; }
    if (deps.readReadyState() === 'loading') return;
    gate.phase = 'ARMED';
    if (!eligible()) { close('ineligible'); return; }
    startedAt = deps.now(); gate.phase = 'RECORDING';
    timer = setTimeout(() => close('expired'), 300000);
    try { sdk.start(); } catch { close('sdk'); }
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
    if (gate.phase === 'RECORDING' && startedAt !== null && deps.now() - startedAt >= 300000) close('expired');
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
