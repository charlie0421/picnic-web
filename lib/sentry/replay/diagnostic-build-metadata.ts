import type { VoteListManifest } from '@/scripts/replay-p0/contracts/vote-list';
export type DiagnosticManifestTemplate = Omit<VoteListManifest, 'release' | 'environment'> & { sourceStyleSha256: string[] };
export const DIAGNOSTIC_ENVIRONMENT = 'replay-diagnostic-production' as const;
export function diagnosticBuildMetadata() {
  return {
    commit: process.env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_COMMIT ?? '',
    manifestSha256: process.env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_MANIFEST_SHA256 ?? '',
    release: process.env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_RELEASE ?? '',
    environment: process.env.NEXT_PUBLIC_REPLAY_DIAGNOSTIC_ENVIRONMENT ?? '',
  };
}
export type DiagnosticProof = {
  version: 1; verified: true; buildId: string; commit: string; manifestSha256: string;
  sdkVersion: '9.47.1'; release: string; environment: typeof DIAGNOSTIC_ENVIRONMENT;
};
