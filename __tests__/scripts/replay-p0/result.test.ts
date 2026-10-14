// @vitest-environment node
import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
const { exitCode } = createRequire(import.meta.url)('../../../scripts/replay-p0/result.cjs');
const valid = { normal: 'pass', barrier: 'pass', finiteCleanup: 'pass', limits: 'pass', isolation: 'pass',
  expectedLimitations: ['hung-processor', 'hung-sdk-worker', 'direct-restart'].map(name => ({ case: name, observed: true })) };
it('accepts independently passing required groups and observed limitations', () => expect(exitCode(valid)).toBe(0));
it.each(['normal', 'barrier', 'finiteCleanup', 'limits', 'isolation'])('does not hide a failed %s behind limitations', field => {
  expect(exitCode({ ...valid, [field]: 'fail' })).toBe(1);
});
it('requires every named limitation, not an empty or incomplete list', () => {
  expect(exitCode({ ...valid, expectedLimitations: [] })).toBe(1);
  expect(exitCode({ ...valid, expectedLimitations: [{ case: 'hung-processor', observed: true }] })).toBe(1);
  expect(exitCode({ ...valid, expectedLimitations: valid.expectedLimitations.map(x => ({ ...x, observed: false })) })).toBe(1);
});
it('also rejects an unobserved additional limitation', () => {
  expect(exitCode({ ...valid, expectedLimitations: [...valid.expectedLimitations,
    { case: 'additional-limit', observed: false }] })).toBe(1);
});
