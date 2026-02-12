import { NextRequest, NextResponse } from 'next/server';

function isValidInternalRedirect(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  try {
    const url = new URL(path, 'http://localhost');
    if (url.origin !== 'http://localhost') return false;
  } catch { return false; }
  return true;
}

/**
 * 토스페이먼트 결제 완료 후 리다이렉트 콜백
 * 토스페이먼트가 결제 완료 후 이 URL로 리다이렉트합니다.
 *
 * 토스페이먼트는 PortOne을 통해 결제가 진행될 때,
 * 결제 완료 후 토스페이먼트 도메인으로 리다이렉트하는 경우가 있습니다.
 * 이 경우 token과 pg_token을 받아서 PortOne 결제 ID를 찾아야 합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    console.log('[Toss Result] Full URL:', url.toString());
    console.log('[Toss Result] Search params:', Object.fromEntries(url.searchParams.entries()));

    const token = url.searchParams.get('token');
    const pgToken = url.searchParams.get('pg_token');
    const paymentMethodType = url.searchParams.get('payment_method_type');

    console.log('[Toss Result] Extracted params:', {
      token,
      pgToken,
      paymentMethodType,
    });

    // 토스페이먼트에서 받은 token을 사용하여 PortOne 결제 ID를 찾아야 합니다.
    // 하지만 현재 구조상 token만으로는 paymentId를 직접 찾을 수 없으므로,
    // sessionStorage나 다른 방법을 통해 paymentId를 전달받아야 합니다.

    // 일단 PortOne 콜백으로 리다이렉트하되, token 정보를 전달
    const rawReturnTo = url.searchParams.get('returnTo') || '/ko/star-candy';
    const returnTo = isValidInternalRedirect(rawReturnTo) ? rawReturnTo : '/ko/star-candy';
    const redirectUrl = new URL(returnTo, request.url);
    
    // token이 있으면 쿼리 파라미터로 전달 (나중에 paymentId로 변환 가능)
    if (token) {
      redirectUrl.searchParams.set('toss_token', token);
      redirectUrl.searchParams.set('status', 'processing');
      console.log('[Toss Result] Redirecting to:', redirectUrl.toString());
    } else {
      console.warn('[Toss Result] No token found in callback URL');
    }
    
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Toss Result] Toss callback error:', error);
    return NextResponse.redirect(new URL('/ko/star-candy', request.url));
  }
}

