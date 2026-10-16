import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, renderHook, act } from '@testing-library/react';

// PortOne 웹 결제는 웹훅 서명 검증(#77)을 고치기 전까지 막는다.
// 한국 사용자도, 직접 고른 값도 PortOne 결제로 이어지면 안 된다.

const KOREA = {
  country: 'South Korea',
  countryCode: 'KR',
  isKorea: true,
  ip: '0.0.0.0',
  source: 'ip-service' as const,
};

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, whileHover, whileTap, ...props }: any) => <button {...props}>{children}</button>,
    div: ({ children, initial, animate, transition, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

const portOne = vi.hoisted(() => ({ requestPaymentAuto: vi.fn() }));
const payPal = vi.hoisted(() => ({
  initialize: vi.fn(async () => false),
  createOrder: vi.fn(),
  getPayPal: vi.fn(),
}));
vi.mock('@/lib/payment/portone', () => ({ portOneService: portOne }));
vi.mock('@/lib/payment/paypal', () => ({ payPalService: payPal }));

vi.mock('@/utils/ip-detection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/ip-detection')>();
  return { ...actual, detectUserLocation: vi.fn(async () => KOREA) };
});

import { getPaymentMethodByLocation } from '@/utils/ip-detection';
import { PaymentMethodSelector } from '@/components/client/star-candy/PaymentMethodSelector';
import { usePaymentHandlers } from '@/components/client/star-candy/usePaymentHandlers';

describe('PortOne 웹 결제 숨김', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('한국 위치에서도 PayPal 을 고른다', () => {
    expect(getPaymentMethodByLocation(KOREA)).toBe('paypal');
  });

  it('선택지에 PortOne 이 없고 한국 사용자에게 PayPal 을 알린다', async () => {
    const onMethodChange = vi.fn();
    render(<PaymentMethodSelector onMethodChange={onMethodChange} />);

    await waitFor(() => expect(onMethodChange).toHaveBeenCalled());
    expect(onMethodChange).not.toHaveBeenCalledWith('portone');
    expect(onMethodChange).toHaveBeenLastCalledWith('paypal');
    expect(screen.queryByText('Port One')).toBeNull();
    expect(screen.getByText('PayPal')).toBeTruthy();
  });

  it('portone 이 넘어와도 PortOne 결제를 시작하지 않고 USD 가격을 쓴다', async () => {
    const { result } = renderHook(() =>
      usePaymentHandlers({
        user: { id: 'u1' } as any,
        selectedPaymentMethod: 'portone',
        processingProductId: null,
        setPendingPaymentId: vi.fn(),
        setStoredPaymentId: vi.fn(),
        router: { push: vi.fn() } as any,
        pathname: '/ko/star-candy',
        currentLanguage: 'ko',
        showLoginRequired: vi.fn() as any,
        t: (key: string) => key,
        ensureActiveMembership: async () => false,
      }),
    );

    const product = { id: 'p1', web_price_krw: 1000, web_price_usd: 1 } as any;
    expect(result.current.getCurrentCurrency()).toBe('USD');
    expect(result.current.getCurrentPrice(product)).toBe(1);

    await act(async () => {
      await result.current.handlePurchase(product);
    });

    expect(portOne.requestPaymentAuto).not.toHaveBeenCalled();
    expect(payPal.initialize).toHaveBeenCalledTimes(1);
  });
});
