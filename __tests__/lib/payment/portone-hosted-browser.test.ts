// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHostedResume, HOSTED_RESUME_MAX_AGE_MS, peekHostedResume, saveHostedResume } from '@/lib/payment/portone-hosted-resume';
import { buildHostedPaymentRequest, confirmHosted, HostedUnavailable, lookupHosted, readHostedCheckout, readHostedCheckoutForOrder,
  readHostedQuote, readHostedResponse,
  restoreHostedAttempt, saveHostedAttempt, type HostedCheckout, type HostedQuote } from '@/lib/payment/portone-hosted-browser';

const ORDER = '22222222-2222-4222-8222-222222222222';
const REQUEST = '88888888-8888-4888-8888-888888888888';
const PAYMENT = 'web_33333333-3333-4333-8333-333333333333';
const FUTURE = new Date(Date.now() + 600_000).toISOString();
const quote: HostedQuote = { orderId: ORDER, name: '별사탕 100', amount: 1000, expiresAt: FUTURE, environment: 'LIVE' };
const sdk = { storeId: 'store-live', channelKey: 'channel-key-live', paymentId: PAYMENT, totalAmount: 1000, currency: 'KRW',
  payMethod: 'CARD', easyPayProvider: null, buyer: 'NAME_EMAIL_PHONE', productType: 'DIGITAL', virtualAccountValidHours: null,
  giftCertificateType: null, isTestChannel: false };
const checkoutBody = { state: 'READY', orderId: ORDER, environment: 'LIVE', productId: 'STAR_100', expiresAt: FUTURE, continuation: 'v1.123.abc_-', sdk };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); sessionStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('hosted quote and checkout readers', () => {
  it('creates a PortOne order quote and accepts TEST or LIVE from the server only', async () => {
    fetchMock.mockResolvedValue(json({ contractVersion: 'web-payment-order.v1', orderId: ORDER, quoteId: ORDER, replayed: false,
      quote: { productId: 'STAR_100', productName: '별사탕 100', provider: 'portone', environment: 'LIVE', billingCountry: 'KR',
        amountMinor: '1000', currency: 'KRW', acceptedPolicyVersion: 'p1', expiresAt: FUTURE } }));
    const input = { productId: 'STAR_100', provider: 'portone' as const, billingCountry: 'KR', requestId: REQUEST, acceptedPolicyVersion: 'p1' };
    expect(await readHostedQuote(input)).toEqual(quote);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/payment/orders');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
  });
  it('accepts only exact public SDK settings for the quoted order', async () => {
    fetchMock.mockResolvedValue(json(checkoutBody));
    const entry = await readHostedCheckout(quote, 'STAR_100');
    expect(entry).toEqual({ orderId: ORDER, environment: 'LIVE', expiresAt: FUTURE, continuation: 'v1.123.abc_-', sdk });
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/payment/orders/${ORDER}/portone/hosted/checkout`);
    for (const changed of [{ environment: 'TEST' }, { orderId: REQUEST }, { productId: 'OTHER' }, { sdk: { ...sdk, totalAmount: 999 } },
      { sdk: { ...sdk, payMethod: 'ALL' } }, { sdk: { ...sdk, apiSecret: 'x' } }, { continuation: 'bad token' }]) {
      fetchMock.mockResolvedValue(json({ ...checkoutBody, ...changed }));
      await expect(readHostedCheckout(quote, 'STAR_100')).rejects.toThrow();
    }
  });
});

describe('hosted SDK request', () => {
  const entry = { orderId: ORDER, environment: 'LIVE', expiresAt: FUTURE, continuation: 'v1.123.abc_-', sdk } as HostedCheckout;
  const buyer = { fullName: '홍길동', email: 'buyer@example.com', phoneNumber: '010-1234-5678' };
  it('uses the server route, PC iframe and mobile redirect with a bounded continuation and no client price authority', () => {
    const request = buildHostedPaymentRequest(entry, quote, { origin: 'https://picnic.example', language: 'ko', buyer });
    expect(request).toEqual({ storeId: 'store-live', channelKey: 'channel-key-live', paymentId: PAYMENT, orderName: '별사탕 100',
      totalAmount: 1000, currency: 'KRW', payMethod: 'CARD', productType: 'PRODUCT_TYPE_DIGITAL',
      windowType: { pc: 'IFRAME', mobile: 'REDIRECTION' }, customData: { version: 'v2', order_id: ORDER },
      redirectUrl: `https://picnic.example/portone-return.html?order=${ORDER}&c=v1.123.abc_-&lang=ko`, customer: buyer });
  });
  it('maps the dedicated KakaoPay route and virtual account validity without buyer fields', () => {
    const kakao = buildHostedPaymentRequest({ ...entry, sdk: { ...sdk, payMethod: 'EASY_PAY', easyPayProvider: 'KAKAOPAY', buyer: 'NONE' } },
      quote, { origin: 'https://picnic.example', language: 'en' });
    expect(kakao).toMatchObject({ payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'KAKAOPAY' } });
    expect(kakao).not.toHaveProperty('customer');
    const account = buildHostedPaymentRequest({ ...entry, sdk: { ...sdk, payMethod: 'VIRTUAL_ACCOUNT', virtualAccountValidHours: 24 } },
      quote, { origin: 'https://picnic.example', language: 'ko', buyer });
    expect(account).toMatchObject({ payMethod: 'VIRTUAL_ACCOUNT', virtualAccount: { accountExpiry: { validHours: 24 } } });
  });
  it('sends the configured KG gift certificate kind on mobile and leaves the PC window its own choice', () => {
    const gift = { ...entry, sdk: { ...sdk, payMethod: 'GIFT_CERTIFICATE', giftCertificateType: 'BOOKNLIFE' } } as HostedCheckout;
    const mobile = buildHostedPaymentRequest(gift, quote, { origin: 'https://picnic.example', language: 'ko', buyer, mobile: true });
    expect(mobile).toMatchObject({ payMethod: 'GIFT_CERTIFICATE', giftCertificate: { giftCertificateType: 'BOOKNLIFE' } });
    const pc = buildHostedPaymentRequest(gift, quote, { origin: 'https://picnic.example', language: 'ko', buyer, mobile: false });
    expect(pc).toMatchObject({ payMethod: 'GIFT_CERTIFICATE' }); expect(pc).not.toHaveProperty('giftCertificate');
    const unconfigured = { ...gift, sdk: { ...gift.sdk, giftCertificateType: null } } as HostedCheckout;
    expect(buildHostedPaymentRequest(unconfigured, quote, { origin: 'https://picnic.example', language: 'ko', buyer, mobile: false }))
      .not.toHaveProperty('giftCertificate');
    expect(() => buildHostedPaymentRequest(unconfigured, quote, { origin: 'https://picnic.example', language: 'ko', buyer, mobile: true }))
      .toThrow(HostedUnavailable);
  });
  it('keeps every optional wallet in the CARD window and names a wallet only on a configured EASY_PAY route', () => {
    const card = buildHostedPaymentRequest(entry, quote, { origin: 'https://picnic.example', language: 'ko', buyer, mobile: true });
    expect(card).not.toHaveProperty('easyPay'); expect(card).not.toHaveProperty('bypass'); expect(card).not.toHaveProperty('card');
    const wallet = buildHostedPaymentRequest({ ...entry, sdk: { ...sdk, payMethod: 'EASY_PAY', easyPayProvider: 'NAVERPAY' } } as HostedCheckout,
      quote, { origin: 'https://picnic.example', language: 'ko', buyer });
    expect(wallet).toMatchObject({ payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'NAVERPAY' } });
  });
  it('rejects a gift certificate kind or wallet on the wrong route from the server', async () => {
    for (const changed of [{ giftCertificateType: 'BOOKNLIFE' }, { payMethod: 'GIFT_CERTIFICATE', giftCertificateType: 'UNKNOWN' },
      { easyPayProvider: 'NAVERPAY' }, { payMethod: 'EASY_PAY', easyPayProvider: 'naver pay' }]) {
      fetchMock.mockResolvedValue(json({ ...checkoutBody, sdk: { ...sdk, ...changed } }));
      await expect(readHostedCheckout(quote, 'STAR_100')).rejects.toThrow();
    }
  });
  it('requires valid buyer fields when the channel needs them', () => {
    expect(() => buildHostedPaymentRequest(entry, quote, { origin: 'https://picnic.example', language: 'ko' })).toThrow();
    expect(() => buildHostedPaymentRequest(entry, quote, { origin: 'https://picnic.example', language: 'ko',
      buyer: { ...buyer, email: 'nope' } })).toThrow();
  });
  it('reads a PC manual-confirmation result and treats provider codes as not paid', () => {
    expect(readHostedResponse({ paymentId: PAYMENT, txId: 'tx-hosted', paymentToken: 'private-token', transactionType: 'PAYMENT' }, PAYMENT))
      .toEqual({ kind: 'CONFIRM', txId: 'tx-hosted', paymentToken: 'private-token' });
    expect(readHostedResponse({ paymentId: PAYMENT, code: 'FAILURE_TYPE_PG', message: 'x' }, PAYMENT)).toEqual({ kind: 'NOT_PAID' });
    expect(readHostedResponse(undefined, PAYMENT)).toEqual({ kind: 'UNKNOWN' });
    expect(readHostedResponse({ paymentId: PAYMENT, txId: 'tx-hosted' }, PAYMENT)).toEqual({ kind: 'UNKNOWN' });
    expect(() => readHostedResponse({ paymentId: 'web_other', txId: 'tx', paymentToken: 't' }, PAYMENT)).toThrow();
  });
});

describe('same-order reopen and the login resume handle', () => {
  it('rebuilds a reopen only from the owned server checkout for that order', async () => {
    fetchMock.mockResolvedValue(json(checkoutBody));
    const reopened = await readHostedCheckoutForOrder(ORDER, id => (id === 'STAR_100' ? '별사탕 100' : null));
    expect(reopened.quote).toEqual({ orderId: ORDER, name: '별사탕 100', amount: 1000, expiresAt: FUTURE, environment: 'LIVE' });
    expect(reopened.entry.sdk.paymentId).toBe(PAYMENT);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/payment/orders/${ORDER}/portone/hosted/checkout`);
    for (const changed of [{ orderId: REQUEST }, { state: 'BLOCKED' }, { sdk: { ...sdk, apiSecret: 'x' } }, { expiresAt: '2000-01-01T00:00:00Z' }]) {
      fetchMock.mockResolvedValue(json({ ...checkoutBody, ...changed }));
      await expect(readHostedCheckoutForOrder(ORDER, () => null)).rejects.toThrow();
    }
    fetchMock.mockResolvedValue(json({ state: 'UNAVAILABLE', orderId: ORDER }, 503));
    await expect(readHostedCheckoutForOrder(ORDER, () => null)).rejects.toThrow(HostedUnavailable);
  });
  it('keeps only a bounded nonsecret order handle and drops stale, corrupt or tampered values', () => {
    const now = Date.parse('2026-11-25T00:00:00Z');
    expect(saveHostedResume(sessionStorage, ORDER.toUpperCase(), now)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('picnic.portone-hosted.resume.v1')!)).toEqual({ version: 1, orderId: ORDER, savedAt: now });
    expect(peekHostedResume(sessionStorage, now + 1000)).toBe(ORDER);
    expect(peekHostedResume(sessionStorage, now + HOSTED_RESUME_MAX_AGE_MS + 1)).toBeNull();
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
    for (const bad of ['not json', '{"version":1,"orderId":"x","savedAt":1}', JSON.stringify({ version: 1, orderId: ORDER, savedAt: now, token: 't' }),
      JSON.stringify({ version: 1, orderId: ORDER, savedAt: now + 3_600_000 })]) {
      sessionStorage.setItem('picnic.portone-hosted.resume.v1', bad);
      expect(peekHostedResume(sessionStorage, now)).toBeNull();
      expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
    }
    expect(saveHostedResume(sessionStorage, '../x', now)).toBe(false);
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => undefined };
    expect(saveHostedResume(denied, ORDER, now)).toBe(false); expect(peekHostedResume(denied, now)).toBeNull();
    expect(peekHostedResume(null, now)).toBeNull();
    saveHostedResume(sessionStorage, ORDER, now); clearHostedResume(sessionStorage);
    expect(sessionStorage.getItem('picnic.portone-hosted.resume.v1')).toBeNull();
  });
});

describe('hosted attempt storage and server calls', () => {
  const key = 'picnic.portone-hosted.v1:user';
  const input = { productId: 'STAR_100', provider: 'portone' as const, billingCountry: 'KR', requestId: REQUEST, acceptedPolicyVersion: 'p1' };
  it('stores the order attempt without tokens or continuation and rejects tampered entries', () => {
    saveHostedAttempt(sessionStorage, key, { input, quote, launched: true });
    expect(restoreHostedAttempt(sessionStorage, key)).toEqual({ input, quote, launched: true });
    expect(sessionStorage.getItem(key)).not.toMatch(/token|v1\.123/);
    sessionStorage.setItem(key, JSON.stringify({ input, quote, launched: true, paymentToken: 'x' }));
    expect(() => restoreHostedAttempt(sessionStorage, key)).toThrow();
    sessionStorage.setItem(key, JSON.stringify({ input: { ...input, provider: 'paypal' }, launched: false }));
    expect(() => restoreHostedAttempt(sessionStorage, key)).toThrow();
  });
  it('confirms with the token in the body, never the URL, and reads lookup states', async () => {
    fetchMock.mockResolvedValue(json({ state: 'PENDING', orderId: ORDER }));
    expect(await confirmHosted(ORDER, { paymentId: PAYMENT, txId: 'tx', paymentToken: 'private-token', continuation: 'v1.1.a' })).toBe('PENDING');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/payment/orders/${ORDER}/portone/hosted/confirm`);
    expect(url).not.toContain('private-token');
    expect(init).toMatchObject({ method: 'POST', referrerPolicy: 'no-referrer', credentials: 'same-origin', cache: 'no-store' });
    fetchMock.mockResolvedValue(json({ state: 'GRANTED', orderId: ORDER }));
    expect(await lookupHosted(ORDER)).toBe('GRANTED');
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/payment/orders/${ORDER}/portone/hosted/lookup`);
    fetchMock.mockResolvedValue(json({ state: 'GRANTED', orderId: REQUEST }));
    await expect(lookupHosted(ORDER)).rejects.toThrow();
  });
});
