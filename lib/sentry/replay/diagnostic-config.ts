import { DIAGNOSTIC_ENVIRONMENT } from './diagnostic-build-metadata';
export type DiagnosticDisclosure = { retentionDays: number; storedTechnicalFields: Array<'browser' | 'os' | 'device'> };
export type DiagnosticConfig = Readonly<{ origin: 'https://www.picnic.fan'; endpoint: string; release: string;
  environment: typeof DIAGNOSTIC_ENVIRONMENT; manifestSha256: string }>;
export type DiagnosticAllowance = { allowed: true; manifestSha256: string; disclosure: DiagnosticDisclosure };
export function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function diagnosticConfig(publicDsn: string, manifestSha256: string, commit: string): DiagnosticConfig | null {
  // Match the original string: URL normalization would hide explicit ports, empty ?/# and whitespace.
  const match = /^https:\/\/([a-f0-9]{32})@(o\d+\.ingest(?:\.(?:us|de))?\.sentry\.io)\/([1-9]\d*)$/.exec(publicDsn);
  if (!match || !/^[a-f0-9]{64}$/.test(manifestSha256) || !/^[a-f0-9]{40}$/.test(commit)) return null;
  return Object.freeze({ origin: 'https://www.picnic.fan',
    endpoint: `https://${match[2]}/api/${match[3]}/envelope/?sentry_key=${match[1]}&sentry_version=7`,
    release: `picnic-web@${commit}`, environment: DIAGNOSTIC_ENVIRONMENT, manifestSha256 });
}
export function parseDiagnosticDisclosure(value: unknown): DiagnosticDisclosure | null {
  if (!exactKeys(value, ['retentionDays', 'storedTechnicalFields'])) return null;
  const { retentionDays, storedTechnicalFields } = value;
  if (typeof retentionDays !== 'number' || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) return null;
  if (!Array.isArray(storedTechnicalFields) || !storedTechnicalFields.every(field => ['browser', 'os', 'device'].includes(field))
    || new Set(storedTechnicalFields).size !== storedTechnicalFields.length) return null;
  return { retentionDays, storedTechnicalFields: [...storedTechnicalFields] };
}
