/**
 * PortOne 웹 결제 스위치.
 *
 * 웹훅 서명 검증이 PortOne V2 방식과 맞지 않아 결제가 적립되지 않는다(#77).
 * 고치기 전까지 끈다. 끄면 위치 자동 선택, 결제 수단 선택지, 결제 처리가 모두 PayPal 만 쓴다.
 */
export const PORTONE_WEB_PAYMENT_ENABLED = false;

export function resolvePaymentMethod(method: 'portone' | 'paypal'): 'portone' | 'paypal' {
  return method === 'portone' && !PORTONE_WEB_PAYMENT_ENABLED ? 'paypal' : method;
}
