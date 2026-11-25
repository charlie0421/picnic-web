import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PortOneTestCheckout } from '@/components/client/star-candy/PortOneTestCheckout';

const orderId = '99000000-0000-4000-8000-000000000001';
const paymentId = 'web_99000000-0000-4000-8000-000000000002';
const expiresAt = new Date(Date.now() + 900000).toISOString();
const key = 'picnic.portone-test.v1:admin';
const quote = { provider: 'portone', environment: 'TEST', productId: 'STAR_100', productName: '별사탕 100',
  billingCountry: 'KR', currency: 'KRW', amountMinor: '1500', acceptedPolicyVersion: 'test-1', expiresAt };
const ready = { state: 'READY', orderId, productId: 'STAR_100', paymentId, storeId: 'store-test',
  channelKey: 'channel-key-test', method: 'CARD', totalAmount: 1500, currency: 'KRW', expiresAt };
let reply: Record<string, unknown>;
const provider = vi.fn();
const http = vi.fn();
const show = () => render(<PortOneTestCheckout userId="admin" productId="STAR_100" onClose={() => {}} />);
const click = (name: string) => fireEvent.click(screen.getByRole('button', {name}));
async function getQuote() {
  fireEvent.click(screen.getByRole('checkbox'));
  click('견적 확인');
  await screen.findByRole('button', {name: '결제창 열기'});
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WEB_PORTONE_POLICY_VERSION', 'test-1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  sessionStorage.clear();
  window.PortOne = {requestPayment: provider.mockReset().mockResolvedValue({paymentId, txId:'transaction-test', paymentToken:'private-fixture-token'})};
  reply = ready;
  http.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
    if (url === '/api/payment/orders') {
      const stored = JSON.parse(sessionStorage.getItem(key)!);
      expect(JSON.parse(String(init.body))).toEqual(stored.input);
      return Response.json({contractVersion:'web-payment-order.v1', orderId, quote});
    }
    if (url.endsWith('/checkout')) return Response.json(reply);
    if (url.endsWith('/confirm')) {
      expect(JSON.parse(sessionStorage.getItem(key)!).submitted).toBe(true);
      expect(JSON.parse(String(init.body))).toEqual({txId:'transaction-test', paymentToken:'private-fixture-token'});
      return Response.json({state:'PENDING', orderId});
    }
    return Response.json({state:'GRANTED', orderId});
  });
  vi.stubGlobal('fetch',http);
});
afterEach(() => { cleanup(); delete window.PortOne; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('원격 DB로 설정한 경우에는 새 주문을 보내지 않는다', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://remote-example.supabase.co');
  show(); fireEvent.click(screen.getByRole('checkbox')); click('견적 확인');
  await screen.findByRole('alert');
  expect(http).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
});
it('승인 시도를 저장할 수 없으면 수동 승인 요청을 보내지 않는다', async () => {
  show(); await getQuote();
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('STORAGE_FULL'); });
  try {
    click('결제창 열기'); await screen.findByRole('alert');
    expect(provider).toHaveBeenCalledOnce();
    expect(http.mock.calls.some(([url]) => url.endsWith('/confirm'))).toBe(false);
  } finally { save.mockRestore(); }
});
it.each(['CARD','KAKAOPAY'])('서버가 승인한 %s 채널로 열고 한 번 승인한 주문은 상태만 조회한다', async method => {
  reply = {...ready, method};
  show(); await getQuote();
  expect(provider).not.toHaveBeenCalled();
  click('결제창 열기');
  await screen.findByText('결제 결과 확인 중');
  expect(provider).toHaveBeenCalledTimes(1);
  const args = provider.mock.calls[0][0];
  expect(args).toMatchObject({paymentId, storeId:ready.storeId, channelKey:ready.channelKey,
    payMethod:method === 'CARD' ? 'CARD':'EASY_PAY', totalAmount:1500, currency:'KRW', customData:{version:'v2',order_id:orderId}});
  expect(args.redirectUrl).toBeUndefined();
  expect(sessionStorage.getItem(key)).not.toContain('private-fixture-token');
  cleanup(); show();
  expect(screen.queryByRole('button',{name:'결제창 열기'})).toBeNull();
  click('상태 조회'); await screen.findByText('별사탕 지급 완료');
  expect(http.mock.calls.filter(([url]) => url.endsWith('/confirm'))).toHaveLength(1);
});
it.each([{state:'BLOCKED'}, {...ready, totalAmount:1600}, {...ready, orderId:paymentId.slice(4)}])('거절되거나 다른 견적이면 SDK를 열지 않는다', async response => {
  reply = response;
  show(); await getQuote(); click('결제창 열기');
  await screen.findByRole('alert');
  expect(provider).not.toHaveBeenCalled();
});
it('재진입 때마다 새 진입 검사를 받고 취소 응답은 승인 요청을 만들지 않는다', async () => {
  provider.mockResolvedValue({code:'USER_CANCEL'});
  show(); await getQuote(); click('결제창 열기');
  await screen.findByRole('alert'); reply = {state:'BLOCKED'}; click('결제창 열기');
  await waitFor(() => expect(http.mock.calls.filter(([url]) => url.endsWith('/checkout'))).toHaveLength(2));
  expect(provider).toHaveBeenCalledTimes(1);
  expect(http.mock.calls.some(([url]) => url.endsWith('/confirm'))).toBe(false);
});
