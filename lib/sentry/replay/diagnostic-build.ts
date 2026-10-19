import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { diagnosticBuildMetadata, DIAGNOSTIC_ENVIRONMENT, type DiagnosticProof } from './diagnostic-build-metadata';
import { syntheticDiagnosticOrigin } from './diagnostic-test-config';

export async function readDiagnosticBuild({ root = process.cwd() }: { root?: string } = {}): Promise<DiagnosticProof | null> {
  try {
    const proof = JSON.parse(await readFile(path.join(root, 'lib/sentry/replay/generated/diagnostic-proof.json'), 'utf8'));
    const buildDir = syntheticDiagnosticOrigin() && process.env.ENVELOPE_TEST === '1' ? '.next-envtest' : '.next';
    const buildId = (await readFile(path.join(root, buildDir, 'BUILD_ID'), 'utf8')).trim();
    const meta = diagnosticBuildMetadata();
    const fields = ['version', 'verified', 'buildId', 'commit', 'manifestSha256', 'sdkVersion', 'release', 'environment'];
    if (!proof || typeof proof !== 'object' || Object.keys(proof).length !== fields.length || !fields.every(k => Object.hasOwn(proof, k))) return null;
    if (proof.version !== 1 || proof.verified !== true || proof.sdkVersion !== '9.47.1' || proof.buildId !== buildId || !/^[\w-]+$/.test(buildId)) return null;
    if (!/^[a-f0-9]{40}$/.test(meta.commit) || !/^[a-f0-9]{64}$/.test(meta.manifestSha256)) return null;
    if (meta.release !== `picnic-web@${meta.commit}` || meta.environment !== DIAGNOSTIC_ENVIRONMENT) return null;
    if (!Object.entries(meta).every(([key, value]) => proof[key] === value)) return null;
    return proof as DiagnosticProof;
  } catch { return null; }
}
