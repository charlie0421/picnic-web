import { describe, expect, it } from 'vitest';
import { diagnosticConfig, parseDiagnosticDisclosure } from '@/lib/sentry/replay/diagnostic-config';
const key = 'a'.repeat(32), commit = 'b'.repeat(40), digest = 'c'.repeat(64);
const dsn = `https://${key}@o123.ingest.us.sentry.io/456`;
describe('fixed diagnostic destination', () => {
  it('derives only the fixed envelope endpoint and build metadata', () => {
    expect(diagnosticConfig(dsn, digest, commit)).toEqual({ origin: 'https://www.picnic.fan',
      endpoint: `https://o123.ingest.us.sentry.io/api/456/envelope/?sentry_key=${key}&sentry_version=7`,
      release: `picnic-web@${commit}`, environment: 'replay-diagnostic-production', manifestSha256: digest });
  });
  it.each([dsn+'?', dsn+'#', dsn+'/more', dsn.replace('https:', 'http:'), dsn.replace('@', ':password@'),
    dsn.replace('.io/', '.io:443/'), dsn.replace('.sentry.io', '.sentry.io.evil.test'), dsn.replace('/456', '/bad'),
    dsn.replace(key, 'bad'), ' '+dsn, dsn.replace('o123', 'localhost')])('rejects %s', value => expect(diagnosticConfig(value, digest, commit)).toBeNull());
  it('requires the full commit and exact digest', () => {
    expect(diagnosticConfig(dsn, '', commit)).toBeNull(); expect(diagnosticConfig(dsn, digest, 'short')).toBeNull();
  });
  it.each([dsn.replace('.ingest.us.', '.ingest.de.'), dsn.replace('.ingest.us.', '.ingest.')])(
    'rejects a destination without the disclosed explicit US region: %s', value => {
      expect(diagnosticConfig(value, digest, commit)).toBeNull();
    });
});
const disclosure = { retentionDays: 90, storedTechnicalFields: ['browser','os','device'] };
it.each([1, 30, 90])('accepts confirmed retention of %i days with no stored technical fields', retentionDays => {
  const value = { retentionDays, storedTechnicalFields: [] };
  expect(parseDiagnosticDisclosure(value)).toEqual(value);
});
it.each([
  { retentionDays: 90 },
  { storedTechnicalFields: [] },
  { retentionDays: 90, deletionRequestUrl: 'https://x.y' },
  { ...disclosure, retentionDays: '90' },
  { ...disclosure, storedTechnicalFields: 'browser' },
])('rejects incomplete or mistyped disclosure: %j', value => {
  expect(parseDiagnosticDisclosure(value)).toBeNull();
});
it('requires confirmed finite disclosure, without unknown keys or duplicate fields', () => {
  expect(parseDiagnosticDisclosure(disclosure)).toEqual(disclosure);
  for (const bad of [null, {}, {...disclosure, retentionDays: 91}, {...disclosure, retentionDays: 1.5},
    {...disclosure, retentionDays: 0}, {...disclosure, deletionRequestUrl: 'javascript:alert(1)'},
    {...disclosure, storedTechnicalFields: ['ip']}, {...disclosure, storedTechnicalFields: ['os','os']}, {...disclosure, extra: true}]) {
    expect(parseDiagnosticDisclosure(bad)).toBeNull();
  }
});

it('rejects the retired intake field instead of accepting a stale disclosure', () => {
  expect(parseDiagnosticDisclosure({ ...disclosure, deletionRequestUrl: 'https://www.picnic.fan/support' })).toBeNull();
});
