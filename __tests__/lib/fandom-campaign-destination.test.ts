import { describe, it, expect } from 'vitest';
import { attributedDestination } from '@/lib/charts/campaign-destination';
const token = 'fb128893-0087-453c-b25f-f292daa122ab';
describe('partner checkout attribution', () => {
    it('carries one opaque token only for a configured HTTPS checkout', () => {
        expect(attributedDestination('https://example.test/cart?item=3', 'https://example.test', token)).toBe(
            'https://example.test/cart?item=3#picnic_click=' + token,
        );
        for (const destination of [
            'https://elsewhere.test/cart',
            'https://example.test.fake/cart',
            'http://example.test/cart',
            'https://example.test/#existing',
        ]) {
            expect(attributedDestination(destination, 'https://example.test', token)).toBe(destination);
        }
    });
});
