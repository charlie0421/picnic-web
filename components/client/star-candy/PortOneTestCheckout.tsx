'use client';

import { useEffect, useRef, useState } from 'react';
import { portOneService } from '@/lib/payment/portone';
import { readTestEntry, readTestQuote, readTestState, readTestToken, restoreTestAttempt,
  TestQuoteRefused, type TestAttempt, type TestState } from '@/lib/payment/portone-test-browser';

const messages: Record<TestState, string> = {
  GRANTED: '별사탕 지급 완료', PENDING: '결제 결과 확인 중', NOT_SUBMITTED: '승인 요청 전',
  UNAVAILABLE: '결제 상태를 확인할 수 없습니다.', BLOCKED: '결제 진행이 차단되었습니다.',
};

function mobileBrowser() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function PortOneTestCheckout({ userId, productId, onClose }: {
  userId: string; productId: string; onClose: () => void;
}) {
  const key = 'picnic.portone-test.v1:' + userId;
  const policy = process.env.NEXT_PUBLIC_WEB_PORTONE_POLICY_VERSION;
  const active = useRef(false);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [attempt, setAttempt] = useState<TestAttempt | null>(null);
  const [state, setState] = useState<TestState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    active.current = true;
    try {
      setAttempt(restoreTestAttempt(key));
      setLoaded(true);
    } catch { setError('저장된 주문을 읽을 수 없습니다.'); }
    return () => { active.current = false; };
  }, [key]);

  function save(next: TestAttempt) {
    sessionStorage.setItem(key, JSON.stringify(next));
    setAttempt(next);
  }

  function current(requestId: string) {
    const saved = restoreTestAttempt(key);
    if (!active.current || saved?.input.requestId !== requestId) throw new Error('ATTEMPT_CHANGED');
    return saved;
  }

  async function run(action: () => Promise<void>) {
    if (locked.current || !active.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch { if (active.current) setError('결제를 진행할 수 없습니다. 주문 상태를 확인해 주세요.'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  }

  async function getQuote() {
    let saved = restoreTestAttempt(key);
    if (!saved) {
      if (!consent || !policy) throw new Error('CONSENT_REQUIRED');
      saved = {input:{requestId:crypto.randomUUID(), productId, provider:'portone', billingCountry:'KR', acceptedPolicyVersion:policy}, submitted:false};
      save(saved);
    }
    if (saved.quote) throw new Error('ALREADY_QUOTED');
    try {
      const quote = await readTestQuote(saved.input);
      const latest = current(saved.input.requestId);
      save({...latest, quote});
    } catch (cause) {
      if (cause instanceof TestQuoteRefused && !current(saved.input.requestId).submitted) {
        sessionStorage.removeItem(key);
        setAttempt(null);
        setConsent(false);
      }
      throw cause;
    }
  }

  async function showProvider() {
    if (!attempt || !policy || mobileBrowser()) throw new Error('UNAVAILABLE');
    const saved = current(attempt.input.requestId);
    const quote = saved.quote;
    if (!quote || saved.submitted || saved.input.productId !== productId ||
      saved.input.acceptedPolicyVersion !== policy || Date.parse(quote.expiresAt) <= Date.now()) throw new Error('STALE_QUOTE');
    let entry = await readTestEntry(quote, productId);
    if (!active.current) return;
    if (typeof window.PortOne?.requestPayment !== 'function') {
      if (!await portOneService.initialize()) throw new Error('SDK_UNAVAILABLE');
      if (!active.current) return;
      entry = await readTestEntry(quote, productId);
    }
    if (current(saved.input.requestId).submitted) throw new Error('SUBMITTED');
    const response: unknown = await window.PortOne.requestPayment({
      paymentId:entry.paymentId, storeId:entry.storeId, channelKey:entry.channelKey, orderName:quote.name,
      totalAmount:quote.amount, currency:'KRW', payMethod:entry.method === 'CARD' ? 'CARD':'EASY_PAY',
      windowType:{pc:'IFRAME', mobile:'IFRAME'}, forceRedirect:false,
      customData:{version:'v2', order_id:quote.orderId},
    });
    const confirmation = readTestToken(response, entry.paymentId);
    const latest = current(saved.input.requestId);
    if (latest.submitted) throw new Error('SUBMITTED');
    save({...latest, submitted:true});
    const outcome = await readTestState(quote.orderId, confirmation);
    if (active.current) setState(outcome);
  }

  async function refresh() {
    if (!attempt?.quote) return;
    const outcome = await readTestState(attempt.quote.orderId);
    const latest = current(attempt.input.requestId);
    setState(outcome);
    const changed = latest.input.productId !== productId || latest.input.acceptedPolicyVersion !== policy;
    if (outcome === 'GRANTED' || (outcome === 'NOT_SUBMITTED' && !latest.submitted &&
      (changed || Date.parse(attempt.quote.expiresAt) <= Date.now()))) {
      sessionStorage.removeItem(key);
      setAttempt(null);
      setConsent(false);
    } else if (outcome === 'PENDING' && !latest.submitted) {
      save({...latest, submitted:true});
    }
  }

  const q = attempt?.quote;
  const canOpen = q && attempt && !attempt.submitted && attempt.input.productId === productId &&
    attempt.input.acceptedPolicyVersion === policy && Date.parse(q.expiresAt) > Date.now() && state !== 'GRANTED' &&
    state !== 'BLOCKED' && state !== 'UNAVAILABLE' && !mobileBrowser();
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
    <section role="dialog" aria-modal="true" aria-label="포트원 관리자 테스트" className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 text-gray-900">
      <h2 className="text-lg font-semibold">포트원 관리자 테스트</h2>
      {loaded && !q && !attempt && state !== 'GRANTED' && <label className="block">
        <input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /> 대한민국 청구 및 결제 약관 동의
      </label>}
      {loaded && !q && state !== 'GRANTED' && <button type="button" disabled={busy || (!attempt && (!consent || !policy))}
        onClick={() => run(getQuote)}>{attempt ? '기존 견적 조회' : '견적 확인'}</button>}
      {q && <p>{q.name} · {q.amount.toLocaleString('ko-KR')}원</p>}
      {loaded && mobileBrowser() && <p>이 테스트 결제창은 PC에서 열 수 있습니다.</p>}
      {canOpen && <button type="button" disabled={busy} onClick={() => run(showProvider)}>결제창 열기</button>}
      {q && <button type="button" disabled={busy} onClick={() => run(refresh)}>상태 조회</button>}
      {state && <p role="status">{messages[state]}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="block" onClick={onClose}>닫기</button>
    </section>
  </div>;
}
