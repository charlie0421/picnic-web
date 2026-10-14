// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isEligible, type Eligibility } from '../../../scripts/replay-p0/contract';

const eligible: Eligibility = {
  initialized: true, auth: 'anonymous', ads: 'denied', adsEverLoaded: false, exactPublicRoute: true,
};

describe('P0 eligibility', () => {
  it('allows only a confirmed anonymous public page with ads never loaded', () => {
    expect(isEligible(eligible)).toBe(true);
  });
  it.each([
    { initialized: false }, { auth: 'unknown' }, { auth: 'authenticated' },
    { ads: 'unknown' }, { ads: 'granted' }, { adsEverLoaded: true }, { exactPublicRoute: false },
  ] as Partial<Eligibility>[])('rejects uncertain or forbidden input %j', override => {
    expect(isEligible({ ...eligible, ...override })).toBe(false);
  });
});

it('pins both reviewed CSS forms and the actual static fixture', async () => {
  const { readFileSync } = await import('node:fs'); const { createHash } = await import('node:crypto');
  const { default: manifest } = await import('../../../scripts/replay-p0/fixtures/sdk-contract.json');
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  expect(hash(manifest.rawCss)).toBe(manifest.rawCssSha256);
  expect(hash(manifest.normalizedCss)).toBe(manifest.normalizedCssSha256);
  const fixture = readFileSync(new URL('../../../scripts/replay-p0/fixture.html', import.meta.url), 'utf8');
  expect(fixture.match(/<style>([\s\S]*?)<\/style>/)?.[1]).toBe(manifest.rawCss);
});
