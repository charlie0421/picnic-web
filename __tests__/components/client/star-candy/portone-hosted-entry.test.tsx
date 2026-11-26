import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

const KOREA = { country: 'South Korea', countryCode: 'KR', isKorea: true, ip: '0.0.0.0', source: 'ip-service' as const };
vi.mock('@/stores/languageStore', () => ({ useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }) }));
vi.mock('framer-motion', () => ({ motion: {
  button: ({ children, whileHover: _h, whileTap: _t, ...props }: any) => <button {...props}>{children}</button>,
  div: ({ children, initial: _i, animate: _a, transition: _r, ...props }: any) => <div {...props}>{children}</div>,
} }));
const legacy = vi.hoisted(() => ({ requestPaymentAuto: vi.fn(), verifyPayment: vi.fn() }));
vi.mock('@/lib/payment/portone', () => ({ portOneService: legacy }));
vi.mock('@/utils/ip-detection', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/ip-detection')>()), detectUserLocation: vi.fn(async () => KOREA) }));

const product = { id: 'STAR_100', web_price_krw: 1000, web_price_usd: 1 } as any;
function hookParams(selectedPaymentMethod: 'portone' | 'paypal') {
  return { user: { id: 'u1' } as any, selectedPaymentMethod, processingProductId: null, setPendingPaymentId: vi.fn(),
    setStoredPaymentId: vi.fn(), router: { push: vi.fn() } as any, pathname: '/ko/star-candy', currentLanguage: 'ko',
    showLoginRequired: vi.fn() as any, t: (key: string) => key, ensureActiveMembership: async () => false };
}
beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });
afterEach(() => vi.unstubAllEnvs());

describe('star-candy PortOne entry with hosted checkout enabled', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_PORTONE_HOSTED_CHECKOUT_ENABLED', 'true'));
  it('offers one PortOne choice and selects it for Korea, without a PICNIC method picker', async () => {
    const { PaymentMethodSelector } = await import('@/components/client/star-candy/PaymentMethodSelector');
    const onMethodChange = vi.fn();
    render(<PaymentMethodSelector onMethodChange={onMethodChange} />);
    await waitFor(() => expect(onMethodChange).toHaveBeenLastCalledWith('portone'));
    expect(screen.getByText('Port One')).toBeTruthy();
    expect(screen.queryByText(/카드|계좌|가상계좌|휴대폰|CARD|TRANSFER/)).toBeNull();
  });
  it('opens the order-bound hosted checkout, never PayPal or the legacy verify flow', async () => {
    const { usePaymentHandlers } = await import('@/components/client/star-candy/usePaymentHandlers');
    const { result } = renderHook(() => usePaymentHandlers(hookParams('portone')));
    expect(result.current.getCurrentCurrency()).toBe('KRW');
    await act(async () => { await result.current.handlePurchase(product); });
    expect(result.current.portOneHostedProductId).toBe('STAR_100');
    expect(result.current.payPalProductId).toBeNull();
    expect(legacy.requestPaymentAuto).not.toHaveBeenCalled(); expect(legacy.verifyPayment).not.toHaveBeenCalled();
    act(() => result.current.closePortOneHostedCheckout());
    expect(result.current.portOneHostedProductId).toBeNull();
  });
  it('keeps PayPal for a PayPal selection', async () => {
    const { usePaymentHandlers } = await import('@/components/client/star-candy/usePaymentHandlers');
    const { result } = renderHook(() => usePaymentHandlers(hookParams('paypal')));
    await act(async () => { await result.current.handlePurchase(product); });
    expect(result.current.payPalProductId).toBe('STAR_100');
    expect(result.current.portOneHostedProductId).toBeNull();
  });
});

describe('star-candy PortOne entry by default', () => {
  it('keeps PortOne hidden and never starts any PortOne flow while the hosted flag is unset', async () => {
    const { usePaymentHandlers } = await import('@/components/client/star-candy/usePaymentHandlers');
    const { result } = renderHook(() => usePaymentHandlers(hookParams('portone')));
    await act(async () => { await result.current.handlePurchase(product); });
    expect(result.current.portOneHostedProductId).toBeNull();
    expect(result.current.payPalProductId).toBe('STAR_100');
    expect(legacy.requestPaymentAuto).not.toHaveBeenCalled();
  });
});
