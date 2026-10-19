import { diagnosticBuildMetadata } from './diagnostic-build-metadata';
import { exactKeys, parseDiagnosticDisclosure, type DiagnosticAllowance } from './diagnostic-config';

/** The deadline includes reading the body. Late network/body completions never reopen eligibility. */
export function checkDiagnosticEligibility(signal: AbortSignal): Promise<DiagnosticAllowance | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    const controller = new AbortController(); let settled = false;
    const finish = (value: DiagnosticAllowance | null) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      controller.abort(); resolve(value);
    };
    const abort = () => finish(null);
    const timer = setTimeout(abort, 1000);
    signal.addEventListener('abort', abort, { once: true });
    void (async () => {
      try {
        const response = await fetch('/api/replay/eligibility?mode=diagnostic', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
        if (!response.ok || response.redirected) { finish(null); return; }
        const body: unknown = await response.json();
        const digest = diagnosticBuildMetadata().manifestSha256;
        if (!exactKeys(body, ['allowed', 'manifestSha256', 'disclosure']) || body.allowed !== true
          || !/^[a-f0-9]{64}$/.test(digest) || body.manifestSha256 !== digest) { finish(null); return; }
        const disclosure = parseDiagnosticDisclosure(body.disclosure);
        finish(disclosure ? { allowed: true, manifestSha256: digest, disclosure } : null);
      } catch { finish(null); }
    })();
  });
}
