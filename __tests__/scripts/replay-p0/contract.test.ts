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
