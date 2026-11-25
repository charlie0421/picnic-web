'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { portOneService } from '@/lib/payment/portone';
import { buildHostedPaymentRequest, confirmHosted, HostedQuoteRefused, HostedUnavailable, lookupHosted, readHostedCheckout,
  readHostedCheckoutForOrder, readHostedQuote, readHostedResponse, readHostedStatus, restoreHostedAttempt, saveHostedAttempt,
  type HostedAttempt, type HostedCheckout, type HostedQuote, type HostedState } from '@/lib/payment/portone-hosted-browser';

type Props = { userId: string; productId: string | null; resumeOrderId: string | null; language: string;
  t: (key: string) => string; onClose: () => void; productName?: (productId: string) => string | null };

const LABELS: Partial<Record<HostedState, [string, string]>> = {
  AWAITING_DEPOSIT: ['가상계좌 입금을 기다리고 있습니다. 입금이 확인되면 별사탕이 지급됩니다.',
    'Waiting for your bank deposit. Star candy is added after the deposit is confirmed.'],
  CANCELLED: ['결제가 취소되었습니다. 별사탕은 지급되지 않았습니다. 새로 구매할 수 있습니다.',
    'The payment was cancelled. No star candy was added. You can make a new purchase.'],
  REFUND_PENDING: ['환불을 처리하고 있습니다.', 'Your refund is being processed.'],
  REFUNDED: ['환불이 완료되었습니다. 새로 구매할 수 있습니다.', 'Your refund is complete. You can make a new purchase.'],
  FAILED: ['결제가 완료되지 않았습니다. 새로 구매할 수 있습니다.', 'The payment did not complete. You can make a new purchase.'],
  // Neutral on purpose: a review and another account's order look the same, so nothing about the order is disclosed.
  BLOCKED: ['이 주문은 이 계정에서 이어갈 수 없거나 확인이 필요합니다. 주문한 계정으로 로그인했는지 확인하고, 계속되면 고객센터에 문의해 주세요.',
    'This order cannot continue in this account or needs a manual check. Check that you signed in with the ordering account, '
      + 'and contact support if this continues.'],
  EXPIRED: ['주문 유효 시간이 지나 결제가 진행되지 않았습니다. 새로 구매해 주세요.',
    'This order expired before payment, so it was not charged. Please make a new purchase.'],
};
function statusLabel(state: HostedState, ko: boolean): string | null {
  const pair = LABELS[state];
  return pair ? pair[ko ? 0 : 1] : null;
}

// Device-dependent request fields only (for example the KG mobile gift certificate kind). The SDK picks the window.
function mobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * One PortOne choice: the merchant PG window shows the methods its channel offers. PICNIC adds no method picker.
 * The server binds order, environment, channel and price; this dialog never sees credentials or decides payment results.
 */
export function PortOneHostedCheckout({ userId, productId, resumeOrderId, language, t, onClose, productName }: Props) {
  const storageKey = 'picnic.portone-hosted.v1:' + userId;
  const policy = process.env.NEXT_PUBLIC_WEB_PORTONE_POLICY_VERSION;
  const ko = language === 'ko';
  const [restored] = useState(() => {
    try { return { attempt: restoreHostedAttempt(sessionStorage, storageKey), failed: false }; }
    // A return is resumed from the server by order id, so unreadable tab storage is not an error there.
    catch { return { attempt: null, failed: !resumeOrderId }; }
  });
  const [attempt, setAttempt] = useState<HostedAttempt | null>(restored.attempt);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(restored.failed);
  const [unavailable, setUnavailable] = useState(false);
  const [outcome, setOutcome] = useState<HostedState | null>(null);
  const [buyerNeeded, setBuyerNeeded] = useState(false);
  const [buyer, setBuyer] = useState({ fullName: '', email: '', phoneNumber: '' });
  const inFlight = useRef(false);
  const mounted = useRef(false);
  // On a return the owned order decides. A saved attempt counts only when it is that same order; an unrelated saved
  // attempt is never shown, used, launched or erased here.
  const related = !resumeOrderId || attempt?.quote?.orderId === resumeOrderId;
  const quote = related ? attempt?.quote : undefined;
  const orderId = resumeOrderId ?? quote?.orderId ?? null;
  const sameProduct = !productId || !attempt || attempt.input.productId === productId.toUpperCase();
  const granted = outcome === 'GRANTED';
  const pending = outcome === 'PENDING';
  // Launch only while nothing is recorded for this order. Any recorded outcome is reported, never relaunched.
  const canPay = Boolean(quote && productId && sameProduct && (outcome === null || outcome === 'NOT_SUBMITTED' || outcome === 'UNAVAILABLE')
    && Date.parse(quote.expiresAt) > Date.now() && attempt?.input.acceptedPolicyVersion === policy);
  // On a return, with or without a saved quote, an owned positive NOT_SUBMITTED allows one explicit same-order reopen.
  // It always comes from the canonical server checkout. Never a new order, a saved price or a stored token.
  const canReopen = Boolean(resumeOrderId && outcome === 'NOT_SUBMITTED');
  const label = outcome ? statusLabel(outcome, ko) : null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function save(next: HostedAttempt) { saveHostedAttempt(sessionStorage, storageKey, next); setAttempt(next); }
  // Clears only this order's saved attempt. Storage failures are ignored: the server status stays authoritative.
  function clear() {
    if (related) {
      try { sessionStorage.removeItem(storageKey); } catch { /* Unavailable storage holds nothing to clear. */ }
      setAttempt(null);
    }
    setConsent(false);
  }

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailed(false); setUnavailable(false);
    try { await action(); }
    catch (error) { if (mounted.current) { if (error instanceof HostedUnavailable) setUnavailable(true); else setFailed(true); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  function settle(state: HostedState) {
    if (!mounted.current) return;
    setOutcome(state);
    // An ended attempt is done; the customer can start a new purchase. Deposit waits and refunds keep the order to recheck.
    if (state === 'GRANTED' || state === 'CANCELLED' || state === 'REFUNDED' || state === 'FAILED' || state === 'EXPIRED') clear();
  }

  // Lookup-only recovery: after reload, app switch or a mobile return, the server re-reads the provider if intent exists.
  async function refresh() {
    if (!orderId) return;
    const state = await lookupHosted(orderId);
    settle(state);
    if (state === 'NOT_SUBMITTED' && quote && Date.parse(quote.expiresAt) <= Date.now()) clear();
  }

  useEffect(() => {
    if (resumeOrderId) void run(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeOrderId]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productId || !policy || !consent || attempt?.quote) return;
    await run(async () => {
      // A new purchase after an ended attempt starts without the old outcome.
      setOutcome(null);
      const input = attempt?.input ?? { productId: productId.toUpperCase(), provider: 'portone' as const, billingCountry: 'KR',
        requestId: crypto.randomUUID(), acceptedPolicyVersion: policy };
      save({ input, launched: false });
      try {
        const next = await readHostedQuote(input);
        save({ input, launched: false, quote: next });
      } catch (error) {
        // A refused or closed order leaves nothing to resume. The visitor can retry later or pick another method.
        if (error instanceof HostedQuoteRefused || error instanceof HostedUnavailable) clear();
        throw error;
      }
    });
  }

  async function startPayment() {
    const savedQuote = quote; const savedProduct = productId; const savedAttempt = attempt; const reopenOrder = resumeOrderId;
    const fromQuote = Boolean(canPay && savedQuote && savedProduct && savedAttempt);
    if (!fromQuote && !(canReopen && reopenOrder)) return;
    await run(async () => {
      // Every launch re-reads the owned server checkout, which re-runs entry authorization and releases settings only
      // while the order is not submitted. A reopen rebuilds the launch from that response alone.
      let entry: HostedCheckout; let launchQuote: HostedQuote;
      if (fromQuote && savedQuote && savedProduct) {
        entry = await readHostedCheckout(savedQuote, savedProduct.toUpperCase()); launchQuote = savedQuote;
      } else if (reopenOrder) {
        const reopened = await readHostedCheckoutForOrder(reopenOrder, productName ?? (() => null));
        entry = reopened.entry; launchQuote = reopened.quote;
      } else return;
      if (entry.sdk.buyer === 'NAME_EMAIL_PHONE' && !buyerNeeded) {
        // Ask only when the server channel needs PG buyer fields. The values are never stored.
        if (mounted.current) setBuyerNeeded(true);
        return;
      }
      const request = buildHostedPaymentRequest(entry, launchQuote, { origin: window.location.origin, language, mobile: mobileBrowser(),
        buyer: entry.sdk.buyer === 'NAME_EMAIL_PHONE' ? buyer : undefined });
      if (typeof window.PortOne?.requestPayment !== 'function' && !await portOneService.initialize()) throw new Error('SDK_UNAVAILABLE');
      // Saved before launch: a mobile REDIRECTION leaves this page, and the return resumes by order.
      if (fromQuote && savedAttempt) save({ ...savedAttempt, launched: true });
      const response: unknown = await window.PortOne.requestPayment(request);
      const result = readHostedResponse(response, entry.sdk.paymentId);
      // The token stays in memory and goes only to the server in a POST body.
      const state = result.kind === 'CONFIRM'
        ? await confirmHosted(launchQuote.orderId, { paymentId: entry.sdk.paymentId, txId: result.txId, paymentToken: result.paymentToken,
          continuation: entry.continuation })
        : result.kind === 'NOT_PAID' ? await readHostedStatus(launchQuote.orderId) : await lookupHosted(launchQuote.orderId);
      settle(state);
    });
  }

  return (
    <Dialog isOpen onClose={() => { if (!inFlight.current) onClose(); }} title="PortOne" size="md">
      <Dialog.Content className="space-y-4">
        {!quote && !resumeOrderId && productId && (
          <form onSubmit={start} className="space-y-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} className="mt-1" />
              {t('payment_terms_notice')}
            </label>
            <button type="submit" disabled={!policy || !consent || busy || restored.failed}
              className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50">{t('confirm_payment')}</button>
          </form>
        )}
        {quote && sameProduct && <>
          <p className="text-sm">{quote.name}</p>
          <p className="text-lg font-semibold">{quote.amount.toLocaleString('ko-KR')}{ko ? '원' : ' KRW'}</p>
        </>}
        {(canPay || canReopen) && buyerNeeded && (
          <fieldset className="space-y-2 text-sm">
            <legend>{ko ? '결제사 요청 구매자 정보' : 'Buyer details requested by the payment provider'}</legend>
            {(['fullName', 'email', 'phoneNumber'] as const).map(field => (
              <label key={field} className="block">
                {field === 'fullName' ? (ko ? '이름' : 'Name') : field === 'email' ? (ko ? '이메일' : 'Email') : (ko ? '휴대폰 번호' : 'Phone')}
                <input value={buyer[field]} autoComplete="off" maxLength={field === 'email' ? 254 : 80}
                  type={field === 'email' ? 'email' : field === 'phoneNumber' ? 'tel' : 'text'}
                  onChange={event => setBuyer(current => ({ ...current, [field]: event.target.value }))}
                  className="mt-1 block w-full rounded-md border px-3 py-2" />
              </label>
            ))}
          </fieldset>
        )}
        {canPay && (
          <button type="button" disabled={busy} onClick={() => { void startPayment(); }}
            className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50">
            {ko ? '결제창 열기' : 'Open payment window'}
          </button>
        )}
        {canReopen && <>
          <p className="text-sm">{ko ? '이 주문은 아직 결제 승인 전입니다. 같은 주문으로 결제창을 다시 열 수 있습니다.'
            : 'This order is not yet confirmed. You can reopen the payment window for the same order.'}</p>
          <button type="button" disabled={busy} onClick={() => { void startPayment(); }}
            className="rounded-md bg-primary px-4 py-2 text-white disabled:opacity-50">
            {ko ? '같은 주문으로 결제창 다시 열기' : 'Reopen the payment window for this order'}
          </button>
        </>}
        {orderId && (
          <button type="button" disabled={busy} onClick={() => { void run(refresh); }} className="ml-2 rounded-md border px-4 py-2 text-sm">
            {t('label_payment_status')}
          </button>
        )}
        {(granted || pending) && <p role="status">{granted ? t('payment_success') : t('label_payment_pending')}</p>}
        {label && <p role="status">{label}</p>}
        {(unavailable || outcome === 'UNAVAILABLE') && (
          <p role="alert" className="text-sm text-red-700">{ko
            ? '지금은 이 결제 수단을 사용할 수 없습니다. 잠시 후 다시 시도하거나 다른 결제 수단을 선택해 주세요.'
            : 'This payment option is not available right now. Try again later or choose another payment method.'}</p>
        )}
        {(failed || !policy) && (
          <p role="alert" className="text-sm text-red-700">{t('payment_error_occurred')}</p>
        )}
      </Dialog.Content>
    </Dialog>
  );
}
