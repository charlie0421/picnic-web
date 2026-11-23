'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loadScript, type PayPalButtonsComponent } from '@paypal/paypal-js';

import { Dialog } from '@/components/ui/Dialog';
import type { PayPalChargeBrowserDto } from '@/lib/payment/paypal-charge/orchestrator';
import { createPayPalOrderActions, createQuotedPayPalOrder, payPalOrderApi,
  PayPalQuoteRefused, type PayPalQuote, type PayPalQuoteInput } from '@/lib/payment/paypal-order-browser';
import { isServerOrderUuid, parseServerOrderRequest } from '@/lib/payment/server-order';

type Attempt = { input: PayPalQuoteInput; quote?: PayPalQuote; captureAttempted?: boolean };
type Props = { userId: string; productId: string; language: string; t: (key: string) => string; onClose: () => void };
const countryPattern = /^[A-Z]{2}$/;

function recover(key: string): Attempt | null {
  const stored = sessionStorage.getItem(key);
  if (!stored) return null;
  const attempt = JSON.parse(stored);
  if (!parseServerOrderRequest({ ...attempt?.input, provider: 'paypal' })) throw new Error('INVALID_PAYPAL_ATTEMPT');
  if (attempt.quote && (!isServerOrderUuid(attempt.quote.orderId)
    || !['LIVE', 'SANDBOX'].includes(attempt.quote.environment)
    || typeof attempt.quote.productName !== 'string'
    || typeof attempt.quote.amountMinor !== 'string' || !/^[1-9][0-9]{0,18}$/.test(attempt.quote.amountMinor)
    || typeof attempt.quote.expiresAt !== 'string' || !Number.isFinite(Date.parse(attempt.quote.expiresAt)))) {
    throw new Error('INVALID_PAYPAL_QUOTE');
  }
  return attempt;
}

function formatUsd(minor: string): string {
  return 'USD ' + minor.padStart(3, '0').replace(/(..)$/, '.$1');
}

function notSubmitted(value: PayPalChargeBrowserDto | null): boolean {
  return value?.state === 'STATUS' && value.reviewRequired === false && value.paymentState === 'NOT_SUBMITTED'
    && value.settlementState === 'NOT_INTAKE';
}

function paymentPending(value: PayPalChargeBrowserDto | null): boolean {
  if (!value) return false;
  if (value.state === 'STATUS') {
    return value.reviewRequired === false
      && (value.settlementState === 'INTAKE_PENDING' || value.paymentState === 'SUBMISSION_UNKNOWN');
  }
  return value.state === 'INTAKE_PENDING' || value.state === 'CAPTURE_PENDING' || value.state === 'IN_PROGRESS'
    || value.state === 'SUBMISSION_UNKNOWN';
}

export function PayPalCheckout({ userId, productId, language, t, onClose }: Props) {
  const storageKey = 'web-paypal-checkout-v1:' + userId;
  const [restored] = useState(() => {
    try { return { attempt: recover(storageKey), error: false }; }
    catch { return { attempt: null, error: true }; }
  });
  const [attempt, setAttempt] = useState<Attempt | null>(restored.attempt);
  const [country, setCountry] = useState(restored.attempt?.input.billingCountry ?? '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(restored.error);
  const [allowButtons, setAllowButtons] = useState(false);
  const [captureAttempted, setCaptureAttempted] = useState(restored.attempt?.captureAttempted === true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [outcome, setOutcome] = useState<PayPalChargeBrowserDto | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const environment = process.env.NEXT_PUBLIC_PAYPAL_ENV;
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const policy = process.env.NEXT_PUBLIC_WEB_PAYPAL_POLICY_VERSION;
  const configured = clientId && policy && (environment === 'production' || environment === 'sandbox');
  const quote = attempt?.quote;
  const currentProduct = !attempt || attempt.input.productId === productId.toUpperCase();
  const requestId = attempt?.input.requestId;
  const priorAttempt = !currentProduct || Boolean(quote && Date.parse(quote.expiresAt) <= Date.now());
  const quoteMatchesEnvironment = quote?.environment === (environment === 'sandbox' ? 'SANDBOX' : 'LIVE');
  const canReuse = !attempt || (attempt.input.billingCountry === country && attempt.input.acceptedPolicyVersion === policy);
  const granted = outcome?.state === 'STATUS' && outcome.settlementState === 'GRANTED';
  const pending = paymentPending(outcome);
  const readyToResume = quote && !allowButtons && !priorAttempt && !captureAttempted && configured && canReuse
    && quoteMatchesEnvironment && notSubmitted(outcome);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const container = host.current;
    if (!allowButtons || !quote || !container || !configured || !quoteMatchesEnvironment || !currentProduct) return;
    let active = true;
    let buttons: PayPalButtonsComponent | undefined;
    const api = payPalOrderApi(quote.orderId);
    const actions = createPayPalOrderActions(async (action, approved) => {
      if (action === 'capture') {
        const saved = recover(storageKey);
        if (saved?.quote?.orderId !== quote.orderId || saved.input.requestId !== requestId || saved.captureAttempted) {
          throw new Error('WEB_PAYPAL_ATTEMPT_UNAVAILABLE');
        }
        sessionStorage.setItem(storageKey, JSON.stringify({ ...saved, captureAttempted: true }));
        if (active) setCaptureAttempted(true);
      }
      return api(action, approved);
    }, value => {
      if (active) {
        setHasUpdate(true);
        setOutcome(value);
      }
    });
    function stopSdk(showError: boolean) {
      if (showError && active) setFailed(true);
      void actions.cancel().finally(() => { if (active) setAllowButtons(false); });
    }
    void loadScript({ clientId, environment, currency: 'USD', intent: 'capture', components: 'buttons',
      enableFunding: 'paypal', disableFunding: 'card,credit,paylater' }).then(async sdk => {
      if (!active) return;
      buttons = sdk?.Buttons?.({
        createOrder: async () => {
          if (Date.parse(quote.expiresAt) <= Date.now()) {
            if (active) setFailed(true);
            throw new Error('WEB_PAYPAL_QUOTE_EXPIRED');
          }
          return actions.createOrder();
        },
        onApprove: data => actions.approve(data.orderID),
        onCancel: () => stopSdk(false),
        onError: () => stopSdk(true),
      });
      if (!buttons?.isEligible()) throw new Error('WEB_PAYPAL_UNAVAILABLE');
      await buttons.render(container);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      void buttons?.close().catch(() => undefined);
      void actions.cancel();
    };
  }, [allowButtons, quote, configured, quoteMatchesEnvironment, currentProduct, storageKey, requestId, clientId, environment]);

  function discardAttempt(expected: string) {
    if (recover(storageKey)?.input.requestId !== expected) return;
    sessionStorage.removeItem(storageKey);
    if (!mounted.current) return;
    setAttempt(null);
    setOutcome(null);
    setCaptureAttempted(false);
    setHasUpdate(false);
    setAllowButtons(false);
    setConsent(false);
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !configured || !consent || !countryPattern.test(country) || !canReuse
      || restored.error || quote || !currentProduct) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    let savedRequest: string | undefined;
    try {
      const input = attempt?.input ?? {
        productId: productId.toUpperCase(), billingCountry: country,
        requestId: crypto.randomUUID(), acceptedPolicyVersion: policy,
      };
      const pending = { input };
      sessionStorage.setItem(storageKey, JSON.stringify(pending));
      savedRequest = input.requestId;
      setAttempt(pending);
      const verifiedQuote = await createQuotedPayPalOrder(input, environment === 'sandbox' ? 'SANDBOX' : 'LIVE');
      const next = { input, quote: verifiedQuote };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      if (mounted.current) {
        setAttempt(next);
        setAllowButtons(Date.parse(verifiedQuote.expiresAt) > Date.now());
      }
    } catch (error) {
      if (error instanceof PayPalQuoteRefused && savedRequest) {
        try { discardAttempt(savedRequest); } catch { /* Keep the saved attempt on storage failure. */ }
      }
      if (mounted.current) setFailed(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function refresh() {
    if (!attempt || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      let order = quote;
      if (!order) {
        if (!configured) throw new Error('WEB_PAYPAL_ORDER_UNAVAILABLE');
        order = await createQuotedPayPalOrder(attempt.input, environment === 'sandbox' ? 'SANDBOX' : 'LIVE');
        const next = { ...attempt, quote: order };
        sessionStorage.setItem(storageKey, JSON.stringify(next));
        if (mounted.current) setAttempt(next);
      }
      const status = await payPalOrderApi(order.orderId)('status');
      if (!mounted.current) return;
      if (notSubmitted(status) && (!currentProduct || Date.parse(order.expiresAt) <= Date.now())) {
        const saved = recover(storageKey);
        if (saved?.input.requestId === attempt.input.requestId && !saved.captureAttempted) {
          discardAttempt(saved.input.requestId);
          setFailed(false);
          return;
        }
      }
      setOutcome(status);
      setHasUpdate(true);
      setFailed(false);
    } catch (error) {
      if (error instanceof PayPalQuoteRefused && !quote) {
        try { discardAttempt(attempt.input.requestId); } catch { /* Keep the saved attempt on storage failure. */ }
      }
      if (mounted.current) setFailed(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function close() {
    if (inFlight.current) return;
    if (granted && requestId) {
      try { discardAttempt(requestId); } catch { /* A later status lookup can retry. */ }
    }
    onClose();
  }

  function resume() {
    if (!readyToResume || !quote || Date.parse(quote.expiresAt) <= Date.now()) return;
    setFailed(false);
    setHasUpdate(false);
    setAllowButtons(true);
  }

  return (
    <Dialog isOpen onClose={close} title="PayPal" size="md">
      <Dialog.Content className="space-y-4">
        {!quote && currentProduct && (
          <form onSubmit={start} className="space-y-4">
            <label className="block text-sm">
              {language === 'ko' ? '결제 국가 (영문 두 글자)' : 'Billing country (two letters)'}
              <input value={country} onChange={event => setCountry(event.target.value.toUpperCase())} maxLength={2}
                disabled={Boolean(attempt) || busy} autoComplete="country"
                className="mt-1 block w-full rounded-md border px-3 py-2" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}
                disabled={busy} className="mt-1" />
              {t('payment_terms_notice')}
            </label>
            <button type="submit" disabled={!configured || !consent || !countryPattern.test(country)
              || !canReuse || busy || restored.error} className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50">
              {t('confirm_payment')}
            </button>
          </form>
        )}
        {priorAttempt && <p className="text-sm">{language === 'ko'
          ? '이 탭의 이전 주문 상태를 확인하세요.' : 'Check the previous order in this tab.'}</p>}
        {(quote || !currentProduct) && <>
          {quote && currentProduct && <>
            <p className="text-sm">{quote.productName}</p>
            <p className="text-lg font-semibold">{formatUsd(quote.amountMinor)}</p>
            <div ref={host} hidden={!allowButtons || (hasUpdate && !notSubmitted(outcome)) || failed || priorAttempt} />
          </>}
          {hasUpdate && (granted || pending) && (
            <p role="status">{granted ? t('payment_success') : t('label_payment_pending')}</p>
          )}
          <button type="button" disabled={busy} onClick={() => { void refresh(); }}
            className="rounded-md border px-4 py-2 text-sm">
            {t('label_payment_status')}
          </button>
          {readyToResume && (
              <button type="button" onClick={resume} className="ml-2 rounded-md bg-primary px-4 py-2 text-white">
                {t('confirm_payment')}
              </button>
            )}
        </>}
        {(!configured || failed || !canReuse || (hasUpdate && !granted && !pending && !notSubmitted(outcome))) && <p role="alert" className="text-sm text-red-700">{t('payment_error_occurred')}</p>}
      </Dialog.Content>
    </Dialog>
  );
}
