import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PayPalButtonsComponentOptions } from '@paypal/paypal-js';

const sdk = vi.hoisted(() => ({ loadScript: vi.fn(), render: vi.fn(), close: vi.fn(), buttons: vi.fn() }));
vi.mock('@paypal/paypal-js', () => ({ loadScript: sdk.loadScript }));
vi.mock('@/components/ui/Dialog', () => ({
  Dialog: Object.assign(({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => <div>{children}<button onClick={onClose}>close-test-dialog</button></div>, {
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  }),
}));

const ORDER = 'decc5ea0-6c2b-4b08-8cd9-a6709a5e217f';
const ACTOR = 'd7267ab1-ebf3-4a90-8abc-52fc608f78ea';
const PROVIDER = '1P746844G7552750R';

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_PAYPAL_CLIENT_ID', 'sandbox-client');
  vi.stubEnv('NEXT_PUBLIC_PAYPAL_ENV', 'sandbox');
  vi.stubEnv('NEXT_PUBLIC_WEB_PAYPAL_POLICY_VERSION', 'policy-1');
  sdk.loadScript.mockResolvedValue({ Buttons: sdk.buttons });
  sdk.buttons.mockReturnValue({ render: sdk.render, close: sdk.close, isEligible: () => true });
  sdk.render.mockResolvedValue(undefined);
  sdk.close.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('offers a PayPal button only after explicit consent and renders the server quote', async () => {
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  const fetcher = vi.fn(async (url: string) => {
    if (url === '/api/payment/orders') {
      return Response.json({ contractVersion: 'web-payment-order.v1', orderId: ORDER,
        quote: { environment: 'SANDBOX', provider: 'paypal', currency: 'USD', productId: 'STAR_100',
          billingCountry: 'US', acceptedPolicyVersion: 'policy-1', productName: 'Quoted Candy',
          amountMinor: '123', expiresAt: new Date(Date.now() + 60_000).toISOString() } });
    }
    if (url.endsWith('/capture')) expect(JSON.parse(sessionStorage.getItem(key)!).captureAttempted).toBe(true);
    const state = url.endsWith('provider-order') ? 'PROVIDER_ORDER_READY' : 'INTAKE_PENDING';
    return Response.json({ contractVersion: 'web-payment-charge.v1', orderId: ORDER, newOrderAllowed: false, state,
      ...(state === 'PROVIDER_ORDER_READY' ? { providerOrderId: PROVIDER } : {}) });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<PayPalCheckout userId={ACTOR} productId="STAR_100" language="en" t={key => key} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'confirm_payment' })).toBeDisabled();
  expect(sdk.loadScript).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Billing country (two letters)'), { target: { value: 'us' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' }));
  await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(1));
  expect(screen.getByText('USD 1.23')).toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(1);
  const options = sdk.buttons.mock.calls[0][0] as PayPalButtonsComponentOptions;
  await act(async () => {
    expect(await options.createOrder!({} as never, {} as never)).toBe(PROVIDER);
    await options.onApprove!({ orderID: PROVIDER } as never, {} as never);
  });
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
  await expect(options.createOrder!({} as never, {} as never)).rejects.toThrow('WEB_PAYPAL_QUOTE_EXPIRED');
  expect(screen.getByText('label_payment_pending')).toBeInTheDocument();
  expect(screen.queryByText('payment_success')).not.toBeInTheDocument();
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([
    '/api/payment/orders',
    '/api/payment/orders/' + ORDER + '/paypal/provider-order',
    '/api/payment/orders/' + ORDER + '/paypal/capture',
  ]);
});

const key = 'web-paypal-checkout-v1:' + ACTOR;
const input = { productId: 'STAR_100', billingCountry: 'US', requestId: ORDER, acceptedPolicyVersion: 'policy-1' };
function saveQuote(expiresAt: string, captureAttempted = false) {
  sessionStorage.setItem(key, JSON.stringify({ input, captureAttempted,
    quote: { orderId: ORDER, environment: 'SANDBOX', productName: 'Prior Quote', amountMinor: '123', expiresAt } }));
}
function status(settlementState = 'NOT_INTAKE') {
  return Response.json({ contractVersion: 'web-payment-charge.v1', orderId: ORDER,
    state: 'STATUS', newOrderAllowed: false, paymentState: 'NOT_SUBMITTED', settlementState, reviewRequired: false });
}

it.each([
  ['another product', 'STAR_200', 60_000],
  ['an expired quote', 'STAR_100', -1000],
])('retires %s after the server confirms there was no charge', async (_name, productId, remainingMs) => {
  saveQuote(new Date(Date.now() + remainingMs).toISOString());
  vi.stubGlobal('fetch', vi.fn(async () => status()));
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  render(<PayPalCheckout userId={ACTOR} productId={productId} language="en" t={key => key} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'confirm_payment' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'label_payment_status' }));
  await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  expect(screen.getByLabelText('Billing country (two letters)')).toBeEnabled();
  expect(sdk.loadScript).not.toHaveBeenCalled();
});

it('preserves a prior capture attempt even if the old status is not submitted', async () => {
  saveQuote(new Date(Date.now() - 1000).toISOString(), true);
  const fetcher = vi.fn(async () => status());
  vi.stubGlobal('fetch', fetcher);
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  render(<PayPalCheckout userId={ACTOR} productId="STAR_200" language="en" t={key => key} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'label_payment_status' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(sessionStorage.getItem(key)).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'confirm_payment' })).not.toBeInTheDocument();
  expect(sdk.loadScript).not.toHaveBeenCalled();
});

it('saves the request before POST and lets the buyer correct a definite refusal', async () => {
  const fetcher = vi.fn(async () => {
    expect(JSON.parse(sessionStorage.getItem(key)!).input.billingCountry).toBe('US');
    return Response.json({ error: 'WEB_PAYMENT_NOT_AVAILABLE' }, { status: 403 });
  });
  vi.stubGlobal('fetch', fetcher);
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  render(<PayPalCheckout userId={ACTOR} productId="STAR_100" language="en" t={key => key} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Billing country (two letters)'), { target: { value: 'US' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('payment_error_occurred'));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(screen.getByLabelText('Billing country (two letters)')).toBeEnabled();
});

it('sends no order when the request id cannot be saved', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  render(<PayPalCheckout userId={ACTOR} productId="STAR_100" language="en" t={key => key} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Billing country (two letters)'), { target: { value: 'US' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('payment_error_occurred'));
  expect(fetcher).not.toHaveBeenCalled();
});

it('shows success and removes an archived attempt only after the server confirms grant', async () => {
  saveQuote(new Date(Date.now() + 60_000).toISOString(), true);
  vi.stubGlobal('fetch', vi.fn(async () => status('GRANTED')));
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  render(<PayPalCheckout userId={ACTOR} productId="STAR_100" language="en" t={key => key} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'label_payment_status' }));
  await waitFor(() => expect(screen.getByText('payment_success')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'close-test-dialog' }));
  expect(sessionStorage.getItem(key)).toBeNull();
});

it('can resume an unpaid quote in the same dialog and never calls capture on cancellation', async () => {
  saveQuote(new Date(Date.now() + 60_000).toISOString());
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/status')) return status();
    return Response.json({ contractVersion: 'web-payment-charge.v1', orderId: ORDER, newOrderAllowed: false,
      ...(url.endsWith('/provider-order') ? { state: 'PROVIDER_ORDER_READY', providerOrderId: PROVIDER }
        : { state: 'NO_PROVIDER_ORDER' }) });
  });
  vi.stubGlobal('fetch', fetcher);
  const { PayPalCheckout } = await import('@/components/client/star-candy/PayPalCheckout');
  render(<PayPalCheckout userId={ACTOR} productId="STAR_100" language="en" t={key => key} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'label_payment_status' }));
  fireEvent.click(await screen.findByRole('button', { name: 'confirm_payment' }));
  await waitFor(() => expect(sdk.render).toHaveBeenCalledTimes(1));
  const options = sdk.buttons.mock.calls[0][0] as PayPalButtonsComponentOptions;
  await act(async () => {
    await options.createOrder!({} as never, {} as never);
    options.onCancel!({} as never, {} as never);
  });
  await waitFor(() => expect(sdk.close).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('label_payment_pending')).not.toBeInTheDocument();
  expect(fetcher.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual(['status', 'provider-order', 'reconcile']);
  fireEvent.click(screen.getByRole('button', { name: 'label_payment_status' }));
  expect(await screen.findByRole('button', { name: 'confirm_payment' })).toBeEnabled();
});
