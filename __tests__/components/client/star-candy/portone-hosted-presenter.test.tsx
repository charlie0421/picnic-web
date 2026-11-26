import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Real presenter, selector, handlers, hosted dialog and browser library. Only the network, auth, SDK and layout chrome are fakes.
const ORDER = '22222222-2222-4222-8222-222222222222';
const PAYMENT = 'web_33333333-3333-4333-8333-333333333333';
const mocks = vi.hoisted(() => ({ auth: { user: null as null | { id: string }, userProfile: null as null | Record<string, boolean>,
  isInitialized: true },
  showLoginRequired: vi.fn(async () => false), withdrawn: vi.fn(async () => false), initialize: vi.fn(async () => true) }));
vi.mock('@/stores/languageStore', () => ({ useLanguageStore: () => ({ t: (key: string) => key, currentLanguage: 'ko' }) }));
vi.mock('@/lib/supabase/auth-provider', () => ({ useAuth: () => ({ ...mocks.auth, loadUserProfile: vi.fn() }) }));
vi.mock('@/components/ui/Dialog', () => {
  const Dialog = function MockDialog({ isOpen, title, children, onClose }: any) {
    return isOpen ? <section role="dialog" aria-label={title}><button type="button" onClick={onClose}>dismiss-dialog</button>{children}</section> : null;
  };
  Dialog.Content = function MockDialogContent({ children }: any) { return <div>{children}</div>; };
  return { Dialog, useLoginRequired: () => vi.fn(), useDialog: () => ({ showLoginRequired: mocks.showLoginRequired, showDialog: vi.fn() }) };
});
vi.mock('@/hooks/useWithdrawalGuard', () => ({ useWithdrawalGuard: () => mocks.withdrawn }));
vi.mock('@/components/common/StarCandyBalanceBox', () => ({ __esModule: true, default: () => <div /> }));
vi.mock('@/components/client/star-candy/usePaymentPolling', () => ({ usePaymentPolling: () => ({ pendingPaymentId: null,
  setPendingPaymentId: vi.fn(), isVerifying: false, balanceBoxKey: 0, setStoredPaymentId: vi.fn() }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/ko/star-candy', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('next/image', () => ({ __esModule: true, default: ({ alt }: any) => <span aria-label={alt} /> }));
vi.mock('framer-motion', () => ({ motion: {
  button: ({ children, whileHover: _h, whileTap: _t, ...props }: any) => <button {...props}>{children}</button>,
  div: ({ children, initial: _i, animate: _a, transition: _r, ...props }: any) => <div {...props}>{children}</div>,
} }));
vi.mock('@/lib/payment/portone', () => ({ portOneService: { initialize: mocks.initialize, requestPaymentAuto: vi.fn(), verifyPayment: vi.fn() } }));
// The real location detection runs (Korean browser language). A mocked ip-detection with importOriginal would keep
// the first test's availability flags across vi.resetModules, because mocked modules stay cached.

const products = [{ id: 'STAR_100', star_candy: 100, web_price_krw: 1000, web_price_usd: 1, product_name: 'Star 100',
  web_bonus_amount: 0, web_description: null, web_display_order: 1 }] as any[];
const future = () => new Date(Date.now() + 600_000).toISOString();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sdk = { storeId: 'store-live', channelKey: 'channel-key-live', paymentId: PAYMENT, totalAmount: 1000, currency: 'KRW',
  payMethod: 'CARD', easyPayProvider: null, buyer: 'NONE', productType: 'DIGITAL', virtualAccountValidHours: null, giftCertificateType: null,
  isTestChannel: false };
type Routes = { order?: () => Response; checkout?: () => Response; confirm?: () => Response; lookup?: () => Response };
function server(routes: Routes = {}) {
  const calls: { url: string; body: any }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    // The optional IP lookup in location detection gets a 404 and is ignored by the app; it is not a payment call.
    if (!url.startsWith('/api/')) return json({ error: 'NOT_FOUND' }, 404);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/payment/orders') return (routes.order ?? (() => json({ contractVersion: 'web-payment-order.v1', orderId: ORDER,
      quoteId: ORDER, replayed: false, quote: { productId: 'STAR_100', productName: 'Star 100', provider: 'portone', environment: 'LIVE',
        billingCountry: 'KR', amountMinor: '1000', currency: 'KRW', acceptedPolicyVersion: 'policy-1', expiresAt: future() } })))();
    if (url.endsWith('/portone/hosted/checkout')) return (routes.checkout ?? (() => json({ state: 'READY', orderId: ORDER,
      environment: 'LIVE', productId: 'STAR_100', expiresAt: future(), continuation: `v1.9999999999.${'A'.repeat(43)}`, sdk })))();
    if (url.endsWith('/portone/hosted/confirm')) return (routes.confirm ?? (() => json({ state: 'PENDING', orderId: ORDER })))();
    if (url.endsWith('/portone/hosted/lookup')) return (routes.lookup ?? (() => json({ state: 'PENDING', orderId: ORDER })))();
    return json({ error: 'NOT_FOUND' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}
let rerenderPresenter: () => void = () => undefined;
async function renderPresenter(strict = false) {
  const { StarCandyProductsPresenter } = await import('@/components/client/star-candy/StarCandyProductsPresenter');
  const element = () => {
    const tree = <StarCandyProductsPresenter products={products} error={null} />;
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  const view = render(element());
  // Rerenders the same mounted presenter, for example after an auth state change.
  rerenderPresenter = () => view.rerender(element());
  await waitFor(() => expect(screen.queryByText('select_payment_method')).not.toBeNull());
  return screen.getByRole('button', { name: 'star_candy_purchase' }) as HTMLButtonElement;
}
function flags(hosted: boolean, customer: boolean) {
  if (hosted) vi.stubEnv('NEXT_PUBLIC_PORTONE_HOSTED_CHECKOUT_ENABLED', 'true');
  if (customer) vi.stubEnv('NEXT_PUBLIC_PORTONE_HOSTED_CUSTOMER_CHECKOUT_ENABLED', 'true');
}
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear();
  mocks.withdrawn.mockResolvedValue(false); mocks.showLoginRequired.mockResolvedValue(false);
  vi.stubEnv('NEXT_PUBLIC_WEB_PORTONE_POLICY_VERSION', 'policy-1');
  mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' }; mocks.auth.userProfile = { is_admin: false, is_super_admin: false };
  mocks.auth.isInitialized = true;
  (window as any).PortOne = { requestPayment: vi.fn() };
  window.history.replaceState(null, '', '/ko/star-candy');
  Object.defineProperty(window.navigator, 'language', { value: 'ko-KR', configurable: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete (window as any).PortOne; });

describe('star-candy PortOne purchase for a regular customer', () => {
  it('keeps the button disabled and PortOne hidden by default', async () => {
    server();
    expect((await renderPresenter()).disabled).toBe(true);
    expect(screen.queryByText('Port One')).toBeNull();
  });
  it('keeps PayPal admin-only for a regular customer even with the customer opt-in', async () => {
    flags(true, true); server();
    const button = await renderPresenter();
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(screen.getByText('PayPal'));
    await waitFor(() => expect(button.disabled).toBe(true));
  });
  it('keeps the button disabled without the explicit customer opt-in, while an admin keeps the existing gate', async () => {
    flags(true, false); server();
    expect((await renderPresenter()).disabled).toBe(true);
  });
  it('keeps the admin gate for admins regardless of the customer opt-in', async () => {
    mocks.auth.userProfile = { is_admin: true }; server();
    expect((await renderPresenter()).disabled).toBe(false);
  });
  it('opens one order, launches one public SDK request and shows pending after confirmation, even on double clicks', async () => {
    flags(true, true); const calls = server();
    const button = await renderPresenter();
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'PortOne' });
    fireEvent.click(screen.getByRole('checkbox'));
    const quote = screen.getByRole('button', { name: 'confirm_payment' });
    await act(async () => { fireEvent.click(quote); fireEvent.click(quote); });
    const pay = await screen.findByRole('button', { name: '결제창 열기' });
    let resolve!: (value: unknown) => void;
    (window as any).PortOne.requestPayment.mockImplementation(() => new Promise(r => { resolve = r; }));
    await act(async () => { fireEvent.click(pay); fireEvent.click(pay); });
    await waitFor(() => expect((window as any).PortOne.requestPayment).toHaveBeenCalledTimes(1));
    fireEvent.click(pay);
    await act(async () => { resolve({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token' }); });
    expect(await screen.findByText('label_payment_pending')).toBeTruthy();
    expect(calls.filter(call => call.url === '/api/payment/orders')).toHaveLength(1);
    expect(calls.filter(call => call.url.endsWith('/checkout'))).toHaveLength(1);
    expect(calls.find(call => call.url === '/api/payment/orders')?.body).toMatchObject({ productId: 'STAR_100', provider: 'portone', billingCountry: 'KR' });
    const request = (window as any).PortOne.requestPayment.mock.calls[0][0];
    expect(request).toMatchObject({ storeId: 'store-live', channelKey: 'channel-key-live', paymentId: PAYMENT, totalAmount: 1000,
      payMethod: 'CARD', windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' } });
    expect(request).not.toHaveProperty('confirmUrl'); expect(request).not.toHaveProperty('customer');
    expect(request.redirectUrl).toBe(`${window.location.origin}/portone-return.html?order=${ORDER}&c=v1.9999999999.${'A'.repeat(43)}&lang=ko`);
    expect(calls.find(call => call.url.endsWith('/confirm'))?.body).toEqual({ paymentId: PAYMENT, txId: 'tx-hosted',
      paymentToken: 'private-token', continuation: `v1.9999999999.${'A'.repeat(43)}` });
    expect(JSON.stringify(sessionStorage)).not.toMatch(/private-token|v1\.9999/);
    expect(dialog.textContent).not.toContain('payment_success');
  });
  it('shows a recoverable message when the order is closed for this customer (for example a TEST order)', async () => {
    flags(true, true); server({ order: () => json({ error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 403) });
    fireEvent.click(await renderPresenter());
    await screen.findByRole('dialog', { name: 'PortOne' });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' })); });
    expect(await screen.findByText(/지금은 이 결제 수단을 사용할 수 없습니다/)).toBeTruthy();
    expect(sessionStorage.length).toBe(0);
    expect(screen.getByRole('button', { name: 'confirm_payment' })).toBeTruthy();
  });
  it('shows the same recoverable message when hosted checkout is not open yet, and keeps the order to retry', async () => {
    flags(true, true); server({ checkout: () => json({ state: 'UNAVAILABLE', orderId: ORDER }, 503) });
    fireEvent.click(await renderPresenter());
    await screen.findByRole('dialog', { name: 'PortOne' });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' })); });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '결제창 열기' })); });
    expect(await screen.findByText(/지금은 이 결제 수단을 사용할 수 없습니다/)).toBeTruthy();
    expect((window as any).PortOne.requestPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '결제창 열기' })).toBeTruthy();
  });
  it('keeps the login check for a signed-out visitor and the withdrawal check for members', async () => {
    flags(true, true); server(); mocks.auth.user = null; mocks.auth.userProfile = null;
    const button = await renderPresenter();
    await waitFor(() => expect(button.disabled).toBe(false));
    await act(async () => { fireEvent.click(button); });
    expect(mocks.showLoginRequired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('blocks a withdrawing member before any order', async () => {
    flags(true, true); const calls = server(); mocks.withdrawn.mockResolvedValue(true);
    const button = await renderPresenter();
    await waitFor(() => expect(button.disabled).toBe(false));
    await act(async () => { fireEvent.click(button); });
    expect(screen.queryByRole('dialog')).toBeNull(); expect(calls).toHaveLength(0);
  });
  it('resumes a mobile return by lookup only and shows pending without storing anything', async () => {
    flags(true, true); const calls = server();
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    expect(await screen.findByText('label_payment_pending')).toBeTruthy();
    expect(window.location.search).toBe('');
    expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
  });
  it('ends a cancelled attempt and lets the customer start a new purchase with a new order request', async () => {
    flags(true, true); const calls = server({ confirm: () => json({ state: 'CANCELLED', orderId: ORDER }) });
    const button = await renderPresenter();
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByRole('dialog', { name: 'PortOne' });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' })); });
    (window as any).PortOne.requestPayment.mockResolvedValue({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token' });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '결제창 열기' })); });
    expect(await screen.findByText(/결제가 취소되었습니다/)).toBeTruthy();
    expect(screen.queryByText('payment_success')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' })); });
    const orders = calls.filter(call => call.url === '/api/payment/orders');
    expect(orders).toHaveLength(2);
    expect(orders[0].body.requestId).not.toBe(orders[1].body.requestId);
  });
  it('shows the refund result without a new checkout form after refreshing a pending payment', async () => {
    flags(true, true);
    const calls = server({ lookup: () => json({ state: 'REFUNDED', orderId: ORDER }) });
    const buy = await renderPresenter();
    await waitFor(() => expect(buy.disabled).toBe(false));
    fireEvent.click(buy);
    fireEvent.click(await screen.findByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' })); });
    (window as any).PortOne.requestPayment.mockResolvedValue({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token' });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '결제창 열기' })); });
    expect(await screen.findByText('label_payment_pending')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'label_payment_status' }));
    expect(await screen.findByText(/환불이 완료되었습니다/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'confirm_payment' })).toBeNull();
    expect(calls.filter(call => call.url === '/api/payment/orders')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'dismiss-dialog' }));
    fireEvent.click(buy);
    expect(await screen.findByRole('checkbox')).toHaveProperty('checked', false);
  });
  it.each([
    ['REFUNDED', /환불이 완료되었습니다/, 200], ['REFUND_PENDING', /환불을 처리하고/, 200], ['BLOCKED', /확인이 필요합니다/, 409],
    ['AWAITING_DEPOSIT', /가상계좌 입금을 기다리고/, 200], ['FAILED', /결제가 완료되지 않았습니다/, 200],
  ] as const)('resumes a return to the owned %s status, never GRANTED and never a new launch', async (state, text, status) => {
    flags(true, true); const calls = server({ lookup: () => json({ state, orderId: ORDER }, status) });
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByText('payment_success')).toBeNull();
    expect(screen.queryByRole('button', { name: '결제창 열기' })).toBeNull();
    expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
  });
  it('a duplicate mobile return only looks the order up again and never confirms or launches', async () => {
    flags(true, true); const calls = server({ lookup: () => json({ state: 'AWAITING_DEPOSIT', orderId: ORDER }) });
    for (let i = 0; i < 2; i++) {
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      expect(await screen.findByText(/가상계좌 입금을 기다리고/)).toBeTruthy();
      cleanup();
    }
    expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`,
      `/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
    expect((window as any).PortOne.requestPayment).not.toHaveBeenCalled();
  });
  it('keeps a signed-out return through login and looks up the original order after the same user signs in', async () => {
    flags(true, true); const calls = server({ lookup: () => json({ state: 'PENDING', orderId: ORDER }) });
    mocks.auth.user = null; mocks.auth.userProfile = null;
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    await waitFor(() => expect(mocks.showLoginRequired).toHaveBeenCalledTimes(1));
    expect(mocks.showLoginRequired).toHaveBeenCalledWith(expect.objectContaining({ redirectUrl: `/ko/star-candy?portone_order=${ORDER}` }));
    expect(window.location.search).toBe(''); expect(calls).toHaveLength(0); expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toContain(ORDER);
    expect(JSON.stringify(sessionStorage)).not.toMatch(/token|continuation|amount/i);
    cleanup();
    mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' }; mocks.auth.userProfile = { is_admin: false };
    await renderPresenter();
    expect(await screen.findByText('label_payment_pending')).toBeTruthy();
    expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
    expect(screen.queryByRole('button', { name: '같은 주문으로 결제창 다시 열기' })).toBeNull();
  });
  it('shows only a neutral closed result when another account signs in for the stored order', async () => {
    flags(true, true); const calls = server({ lookup: () => json({ state: 'BLOCKED', orderId: ORDER }, 409) });
    mocks.auth.user = null;
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter(); cleanup();
    mocks.auth.user = { id: '99999999-9999-4999-8999-999999999999' };
    await renderPresenter();
    expect(await screen.findByText(/이 계정에서 이어갈 수 없거나 확인이 필요합니다/)).toBeTruthy();
    expect(screen.queryByText('Star 100')).toBeNull(); expect(screen.queryByRole('button', { name: '같은 주문으로 결제창 다시 열기' })).toBeNull();
    expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
  });
  it('after a pre-intent 401 return, lets the owner explicitly reopen the same order once, without a new order or stored token', async () => {
    flags(true, true);
    const calls = server({ lookup: () => json({ state: 'NOT_SUBMITTED', orderId: ORDER }) });
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    const reopen = await screen.findByRole('button', { name: '같은 주문으로 결제창 다시 열기' });
    let resolve!: (value: unknown) => void;
    (window as any).PortOne.requestPayment.mockImplementation(() => new Promise(r => { resolve = r; }));
    await act(async () => { fireEvent.click(reopen); fireEvent.click(reopen); });
    await waitFor(() => expect((window as any).PortOne.requestPayment).toHaveBeenCalledTimes(1));
    await act(async () => { resolve({ paymentId: PAYMENT, txId: 'tx-again', paymentToken: 'new-token' }); });
    expect(await screen.findByText('label_payment_pending')).toBeTruthy();
    expect(calls.filter(call => call.url === '/api/payment/orders')).toHaveLength(0);
    expect(calls.filter(call => call.url.endsWith('/checkout'))).toHaveLength(1);
    expect((window as any).PortOne.requestPayment.mock.calls[0][0]).toMatchObject({ paymentId: PAYMENT, orderName: 'Star 100', totalAmount: 1000 });
    expect(calls.find(call => call.url.endsWith('/confirm'))?.body).toEqual({ paymentId: PAYMENT, txId: 'tx-again',
      paymentToken: 'new-token', continuation: `v1.9999999999.${'A'.repeat(43)}` });
    expect(JSON.stringify(sessionStorage)).not.toMatch(/new-token|v1\.9999/);
  });
  it.each([['PENDING', 'label_payment_pending'], ['EXPIRED', /주문 유효 시간이 지나/]] as const)(
    'offers no reopen and no confirmation for a %s return', async (state, text) => {
      flags(true, true); const calls = server({ lookup: () => json({ state, orderId: ORDER }) });
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.queryByRole('button', { name: '같은 주문으로 결제창 다시 열기' })).toBeNull();
      expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
    });
  it('carries the validated order on the internal login returnTo when storage is denied, then resumes after remount', async () => {
    flags(true, true); const calls = server();
    const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      mocks.auth.user = null;
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      await waitFor(() => expect(mocks.showLoginRequired).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUrl: `/ko/star-candy?portone_order=${ORDER}` })));
      expect(window.location.search).toBe(''); expect(calls).toHaveLength(0);
      cleanup();
      mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' };
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      expect(await screen.findByText('label_payment_pending')).toBeTruthy();
      expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
      expect(window.location.search).toBe('');
    } finally { denied.mockRestore(); }
  });
  it('waits for auth to load, and ignores a corrupt stored handle or a tampered link', async () => {
    flags(true, true); const calls = server();
    mocks.auth.isInitialized = false; mocks.auth.user = null;
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    expect(mocks.showLoginRequired).not.toHaveBeenCalled(); expect(calls).toHaveLength(0);
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toContain(ORDER);
    cleanup(); mocks.auth.isInitialized = true; mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' };
    sessionStorage.setItem('picnic.portone-hosted.resume.v1', '{"version":1,"orderId":"not-a-uuid","savedAt":1}');
    await renderPresenter();
    expect(calls).toHaveLength(0); expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
    cleanup();
    window.history.replaceState(null, '', '/ko/star-candy?portone_order=../../api/x');
    await renderPresenter();
    expect(calls).toHaveLength(0); expect(window.location.search).toBe('');
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
  });
  it('a UI-launched attempt that returns through login reopens the same order once from the server checkout', async () => {
    flags(true, true);
    const calls = server({ lookup: () => json({ state: 'NOT_SUBMITTED', orderId: ORDER }) });
    const USER_ID = '11111111-1111-4111-8111-111111111111';
    // 1. A real UI purchase launches the PG window; a mobile redirect leaves the page before the SDK settles.
    const button = await renderPresenter();
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await screen.findByRole('dialog', { name: 'PortOne' });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm_payment' })); });
    (window as any).PortOne.requestPayment.mockImplementation(() => new Promise(() => undefined));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '결제창 열기' })); });
    await waitFor(() => expect((window as any).PortOne.requestPayment).toHaveBeenCalledTimes(1));
    expect(JSON.parse(sessionStorage.getItem(`picnic.portone-hosted.v1:${USER_ID}`)!)).toMatchObject({ launched: true, quote: { orderId: ORDER } });
    cleanup();
    // 2. The return arrives signed out (pre-intent 401 discarded the token), then the same user signs in.
    mocks.auth.user = null;
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    await waitFor(() => expect(mocks.showLoginRequired).toHaveBeenCalled());
    cleanup();
    mocks.auth.user = { id: USER_ID };
    await renderPresenter();
    // 3. The owned NOT_SUBMITTED result allows one explicit same-order reopen even with the saved quote.
    const reopen = await screen.findByRole('button', { name: '같은 주문으로 결제창 다시 열기' });
    expect(screen.queryByRole('button', { name: '결제창 열기' })).toBeNull();
    let resolve!: (value: unknown) => void;
    (window as any).PortOne.requestPayment.mockReset().mockImplementation(() => new Promise(r => { resolve = r; }));
    await act(async () => { fireEvent.click(reopen); fireEvent.click(reopen); });
    await waitFor(() => expect((window as any).PortOne.requestPayment).toHaveBeenCalledTimes(1));
    await act(async () => { resolve({ paymentId: PAYMENT, txId: 'tx-reopen', paymentToken: 'reopen-token' }); });
    expect(await screen.findByText('label_payment_pending')).toBeTruthy();
    expect(calls.filter(call => call.url === '/api/payment/orders')).toHaveLength(1);
    expect(calls.filter(call => call.url.endsWith('/checkout'))).toHaveLength(2);
    expect((window as any).PortOne.requestPayment.mock.calls[0][0]).toMatchObject({ paymentId: PAYMENT, totalAmount: 1000 });
    expect(calls.filter(call => call.url.endsWith('/confirm'))).toHaveLength(1);
    expect(JSON.stringify(sessionStorage)).not.toMatch(/reopen-token|v1\.9999/);
  });
  it('ignores an unrelated saved attempt on a return: never shows, uses, erases or launches it', async () => {
    flags(true, true);
    const OTHER = '44444444-4444-4444-8444-444444444444';
    const USER_ID = '11111111-1111-4111-8111-111111111111';
    const unrelated = JSON.stringify({ input: { productId: 'STAR_100', provider: 'portone', billingCountry: 'KR',
      requestId: '55555555-5555-4555-8555-555555555555', acceptedPolicyVersion: 'policy-1' }, launched: true,
      quote: { orderId: OTHER, name: 'Unrelated Order', amount: 5000, expiresAt: future(), environment: 'LIVE' } });
    for (const [state, reopenable] of [['NOT_SUBMITTED', true], ['EXPIRED', false], ['CANCELLED', false]] as const) {
      sessionStorage.setItem(`picnic.portone-hosted.v1:${USER_ID}`, unrelated);
      const calls = server({ lookup: () => json({ state, orderId: ORDER }) });
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      await waitFor(() => expect(calls.some(call => call.url.endsWith('/lookup'))).toBe(true));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'label_payment_status' })).not.toBeNull());
      expect(screen.queryByText('Unrelated Order')).toBeNull(); expect(screen.queryByText(/5,000/)).toBeNull();
      expect(calls.every(call => !call.url.includes(OTHER))).toBe(true);
      const reopen = screen.queryByRole('button', { name: '같은 주문으로 결제창 다시 열기' });
      expect(Boolean(reopen)).toBe(reopenable);
      if (reopen) {
        (window as any).PortOne.requestPayment.mockReset().mockResolvedValue({ paymentId: PAYMENT, code: 'PAY_PROCESS_CANCELED' });
        await act(async () => { fireEvent.click(reopen); });
        expect(calls.filter(call => call.url.endsWith('/checkout')).map(call => call.url))
          .toEqual([`/api/payment/orders/${ORDER}/portone/hosted/checkout`]);
      }
      expect(sessionStorage.getItem(`picnic.portone-hosted.v1:${USER_ID}`)).toBe(unrelated);
      cleanup();
    }
  });
  it('refuses any relaunch for a pending, unknown or protected return even with the same saved order', async () => {
    flags(true, true);
    const USER_ID = '11111111-1111-4111-8111-111111111111';
    const same = JSON.stringify({ input: { productId: 'STAR_100', provider: 'portone', billingCountry: 'KR',
      requestId: '55555555-5555-4555-8555-555555555555', acceptedPolicyVersion: 'policy-1' }, launched: true,
      quote: { orderId: ORDER, name: 'Star 100', amount: 1000, expiresAt: future(), environment: 'LIVE' } });
    for (const [state, status] of [['PENDING', 200], ['UNAVAILABLE', 503], ['BLOCKED', 409], ['AWAITING_DEPOSIT', 200]] as const) {
      sessionStorage.setItem(`picnic.portone-hosted.v1:${USER_ID}`, same);
      const calls = server({ lookup: () => json({ state, orderId: ORDER }, status) });
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      await waitFor(() => expect(calls.some(call => call.url.endsWith('/lookup'))).toBe(true));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'label_payment_status' })).not.toBeNull());
      expect(screen.queryByRole('button', { name: '같은 주문으로 결제창 다시 열기' })).toBeNull();
      expect(screen.queryByRole('button', { name: '결제창 열기' })).toBeNull();
      expect(calls.every(call => !call.url.endsWith('/checkout') && !call.url.endsWith('/confirm') && call.url !== '/api/payment/orders')).toBe(true);
      expect((window as any).PortOne.requestPayment).not.toHaveBeenCalled();
      cleanup(); sessionStorage.clear();
    }
  });
  it('resumes an ended return when session storage cannot be read, without a storage error', async () => {
    flags(true, true); const calls = server({ lookup: () => json({ state: 'CANCELLED', orderId: ORDER }) });
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    const denied = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const deniedRemove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      await renderPresenter();
      expect(await screen.findByText(/결제가 취소되었습니다/)).toBeTruthy();
      expect(screen.queryByText('payment_error_occurred')).toBeNull();
      expect(calls.map(call => call.url)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
    } finally { denied.mockRestore(); deniedRemove.mockRestore(); }
  });
  describe('a current callback always wins over an older stored handle', () => {
    const A = '44444444-4444-4444-8444-444444444444';
    const RESUME = 'picnic.portone-hosted.resume.v1';
    const storeA = () => sessionStorage.setItem(RESUME, JSON.stringify({ version: 1, orderId: A, savedAt: Date.now() }));
    const lookups = (calls: { url: string }[]) => calls.filter(call => call.url.endsWith('/lookup')).map(call => call.url);
    it.each([false, true])('signed in, write of B denied, StrictMode=%s: only B is looked up and A is dropped', async strict => {
      flags(true, true); const calls = server(); storeA();
      const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
      try {
        window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
        await renderPresenter(strict);
        expect(await screen.findByText('label_payment_pending')).toBeTruthy();
        expect(new Set(lookups(calls))).toEqual(new Set([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]));
        expect(calls.some(call => call.url.includes(A))).toBe(false);
        expect(sessionStorage.getItem(RESUME)).toBeNull();
      } finally { denied.mockRestore(); }
    });
    it.each([false, true])('signed out, write of B denied, StrictMode=%s: login carries exactly B, then B resumes after login', async strict => {
      flags(true, true); const calls = server(); storeA(); mocks.auth.user = null;
      const denied = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
      try {
        window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
        await renderPresenter(strict);
        await waitFor(() => expect(mocks.showLoginRequired).toHaveBeenCalled());
        expect(mocks.showLoginRequired).toHaveBeenCalledTimes(1);
        expect(mocks.showLoginRequired).toHaveBeenCalledWith(expect.objectContaining({ redirectUrl: `/ko/star-candy?portone_order=${ORDER}` }));
        expect(calls).toHaveLength(0); expect(sessionStorage.getItem(RESUME)).toBeNull();
        cleanup();
        // The login returns to the carried URL in a fresh mount, as the browser would.
        mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' };
        window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
        await renderPresenter(strict);
        expect(await screen.findByText('label_payment_pending')).toBeTruthy();
        expect(new Set(lookups(calls))).toEqual(new Set([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]));
        expect(calls.some(call => call.url.includes(A))).toBe(false);
      } finally { denied.mockRestore(); }
    });
    it('with working storage, B replaces A before any action, through a normal signed-out login and remount', async () => {
      flags(true, true); const calls = server(); storeA(); mocks.auth.user = null;
      window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
      await renderPresenter();
      await waitFor(() => expect(mocks.showLoginRequired).toHaveBeenCalledWith(
        expect.objectContaining({ redirectUrl: `/ko/star-candy?portone_order=${ORDER}` })));
      expect(JSON.parse(sessionStorage.getItem(RESUME)!).orderId).toBe(ORDER);
      cleanup();
      mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' };
      await renderPresenter();
      expect(await screen.findByText('label_payment_pending')).toBeTruthy();
      expect(lookups(calls)).toEqual([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]);
      expect(calls.some(call => call.url.includes(A))).toBe(false);
    });
    function denyWritesAndRemoves() {
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
      const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
      return () => { set.mockRestore(); remove.mockRestore(); };
    }
    it.each([false, true])('B stays authoritative when A stays readable and writes and removes fail (signed in, dismissal, StrictMode=%s)', async strict => {
      flags(true, true); const calls = server(); storeA();
      const restore = denyWritesAndRemoves();
      try {
        window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
        await renderPresenter(strict);
        expect(await screen.findByText('label_payment_pending')).toBeTruthy();
        expect(sessionStorage.getItem(RESUME)).toContain(A);
        const first = lookups(calls).length;
        expect(new Set(lookups(calls))).toEqual(new Set([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]));
        // Dismiss, then force rerenders and an auth identity change: never a second lookup, reopen or A.
        fireEvent.click(screen.getByRole('button', { name: 'dismiss-dialog' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        for (let i = 0; i < 3; i++) {
          // A new auth identity reruns the resume effect on the same mounted presenter.
          mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' };
          await act(async () => { rerenderPresenter(); await Promise.resolve(); });
        }
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(lookups(calls)).toHaveLength(first);
        expect(calls.some(call => call.url.includes(A))).toBe(false);
      } finally { restore(); }
    });
    it.each([false, true])('B stays authoritative through a signed-out login remount when A stays readable (StrictMode=%s)', async strict => {
      flags(true, true); const calls = server(); storeA(); mocks.auth.user = null;
      const restore = denyWritesAndRemoves();
      try {
        window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
        await renderPresenter(strict);
        await waitFor(() => expect(mocks.showLoginRequired).toHaveBeenCalled());
        expect(mocks.showLoginRequired).toHaveBeenCalledTimes(1);
        expect(mocks.showLoginRequired).toHaveBeenCalledWith(expect.objectContaining({ redirectUrl: `/ko/star-candy?portone_order=${ORDER}` }));
        expect(calls).toHaveLength(0); expect(sessionStorage.getItem(RESUME)).toContain(A);
        cleanup();
        mocks.auth.user = { id: '11111111-1111-4111-8111-111111111111' };
        window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
        await renderPresenter(strict);
        expect(await screen.findByText('label_payment_pending')).toBeTruthy();
        expect(new Set(lookups(calls))).toEqual(new Set([`/api/payment/orders/${ORDER}/portone/hosted/lookup`]));
        expect(calls.some(call => call.url.includes(A))).toBe(false);
        expect(mocks.showLoginRequired).toHaveBeenCalledTimes(1);
      } finally { restore(); }
    });
    it('without a current callback, a valid stored handle still resumes once, and a corrupt or absent one does nothing', async () => {
      flags(true, true); let calls = server(); storeA();
      await renderPresenter();
      await waitFor(() => expect(lookups(calls)).toEqual([`/api/payment/orders/${A}/portone/hosted/lookup`]));
      expect(sessionStorage.getItem(RESUME)).toBeNull();
      cleanup(); calls = server();
      sessionStorage.setItem(RESUME, 'corrupt');
      await renderPresenter();
      expect(calls).toHaveLength(0); expect(sessionStorage.getItem(RESUME)).toBeNull();
      cleanup(); calls = server();
      await renderPresenter(true);
      expect(calls).toHaveLength(0); expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
  it('does not open the dialog for a regular customer without the opt-in on a return URL', async () => {
    flags(true, false); const calls = server();
    window.history.replaceState(null, '', `/ko/star-candy?portone_order=${ORDER}`);
    await renderPresenter();
    expect(screen.queryByRole('dialog')).toBeNull(); expect(calls).toHaveLength(0);
    expect(window.location.search).toBe('');
  });
});
