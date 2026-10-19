import type { Transport } from '@sentry/core';
import { installReplaySafetyLifecycle } from './lifecycle';
import { replaySignals } from './signals';
import { diagnosticSession } from './diagnostic-session';
import { syntheticDiagnosticOrigin } from './diagnostic-test-config';
let normal: Transport | undefined, diagnostic: Transport | undefined;
/** Runs during client transport initialization, before a later SPA mount can qualify. */
export function initializeDiagnosticDocument(transport: Transport, win: Window) {
  if (normal) return;
  normal = transport;
  installReplaySafetyLifecycle(replaySignals, win);
  if (win.location.href !== (syntheticDiagnosticOrigin() ?? 'https://www.picnic.fan') + '/ko/vote') { diagnosticSession.close(); replaySignals.close(); }
}
export function getDiagnosticNormalTransport() { return normal; }
export function installDiagnosticTransport(transport: Transport): boolean {
  if (diagnostic) return false; diagnostic = transport; return true;
}
export function getDiagnosticTransport() { return diagnostic; }
