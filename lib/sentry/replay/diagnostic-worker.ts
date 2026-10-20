import type { Envelope } from '@sentry/core';
import type { ProjectResult, ProjectionState } from '@/scripts/replay-p0/contract';
import { projectWithContract } from '@/scripts/replay-p0/engine/envelope';
import { createVoteListContract } from '@/scripts/replay-p0/contracts/vote-list';
import template from './generated/diagnostic-manifest.json';
import { diagnosticBuildMetadata, DIAGNOSTIC_ENVIRONMENT, type DiagnosticManifestTemplate } from './diagnostic-build-metadata';

export async function projectDiagnosticEnvelope(input: Envelope, state: ProjectionState, origin: string, bannerCount: number): Promise<ProjectResult> {
  try {
    const metadata = diagnosticBuildMetadata();
    if (!/^[a-f0-9]{40}$/.test(metadata.commit) || !/^[a-f0-9]{64}$/.test(metadata.manifestSha256)
      || metadata.release !== `picnic-web@${metadata.commit}` || metadata.environment !== DIAGNOSTIC_ENVIRONMENT) return { ok: false, reason: 'schema' };
    const manifest = { ...template as DiagnosticManifestTemplate, release: metadata.release, environment: metadata.environment };
    return await projectWithContract(input, state, createVoteListContract({ manifest, origin, bannerCount }));
  } catch { return { ok: false, reason: 'schema' }; }
}
if (typeof self !== 'undefined') {
  const worker = self as unknown as { onmessage: (event: MessageEvent) => void; postMessage(value: unknown, transfer: Transferable[]): void };
  worker.onmessage = async event => {
    const { id, input, state, origin, bannerCount } = event.data;
    const result = await projectDiagnosticEnvelope(input, state, origin, bannerCount);
    worker.postMessage({ id, result }, result.ok ? [result.value.bytes.buffer] : []);
  };
}
