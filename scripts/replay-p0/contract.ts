export type Eligibility = {
  initialized: boolean;
  auth: 'unknown' | 'anonymous' | 'authenticated';
  ads: 'unknown' | 'denied' | 'granted';
  adsEverLoaded: boolean;
  exactPublicRoute: boolean;
};

export function isEligible(value: Eligibility): boolean {
  return value.initialized === true && value.auth === 'anonymous' && value.ads === 'denied'
    && value.adsEverLoaded === false && value.exactPublicRoute === true;
}
