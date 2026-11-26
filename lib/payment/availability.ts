/**
 * PortOne 웹 결제 스위치.
 *
 * PORTONE_WEB_PAYMENT_ENABLED 는 예전 브라우저 결제(/api/payment/portone/verify) 경로다. 계속 끈다(#77).
 * PORTONE_HOSTED_CHECKOUT_ENABLED 는 주문에 묶인 포트원 결제창 경로다. 기본값은 꺼짐이다.
 * 켜져 있으면 PortOne 선택은 결제창 경로로만 간다. 예전 경로나 PayPal 로 바꾸지 않는다.
 */
export const PORTONE_WEB_PAYMENT_ENABLED = false;
export const PORTONE_HOSTED_CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_PORTONE_HOSTED_CHECKOUT_ENABLED === 'true';
export const PORTONE_SELECTABLE = PORTONE_HOSTED_CHECKOUT_ENABLED;
/**
 * 일반 회원에게 PortOne 결제창 구매 버튼을 연다. 결제창 스위치와 함께 켜야 하며 기본값은 꺼짐이다.
 * 화면만 연다: 환경·채널·가격·자격(TEST 관리자, LIVE 대상 회원)과 복구 가능 여부는 서버와 DB 가 정한다.
 */
export const PORTONE_HOSTED_CUSTOMER_CHECKOUT_ENABLED = PORTONE_HOSTED_CHECKOUT_ENABLED
  && process.env.NEXT_PUBLIC_PORTONE_HOSTED_CUSTOMER_CHECKOUT_ENABLED === 'true';

export function resolvePaymentMethod(method: 'portone' | 'paypal'): 'portone' | 'paypal' {
  return method === 'portone' && !PORTONE_SELECTABLE ? 'paypal' : method;
}
