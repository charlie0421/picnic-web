import { NextRequest, NextResponse } from 'next/server';

// PortOne 결제 완료 후 리다이렉트 콜백
// 사용자가 결제 창에서 돌아오면 구매 페이지로 안내합니다.
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    console.log('[Callback] Full URL:', url.toString());
    console.log('[Callback] Search params:', Object.fromEntries(url.searchParams.entries()));
    
    const returnTo = url.searchParams.get('returnTo') || '/ko/star-candy';
    
    // 포트원 v2 브라우저 SDK는 redirectUrl에 paymentId를 쿼리 파라미터로 전달할 수 있습니다
    // 또는 URL 해시에 포함될 수 있습니다
    // 토스페이먼트를 통한 결제의 경우 token 파라미터가 올 수 있습니다
    const paymentId = url.searchParams.get('paymentId') || 
                      url.searchParams.get('imp_uid') ||
                      url.searchParams.get('merchant_uid') ||
                      url.searchParams.get('payment_id');
    
    // 토스페이먼트 토큰 처리 (토스페이먼트를 통한 결제인 경우)
    const tossToken = url.searchParams.get('token') || url.searchParams.get('toss_token');
    const pgToken = url.searchParams.get('pg_token');
    
    console.log('[Callback] Extracted paymentId:', paymentId);
    console.log('[Callback] Extracted tossToken:', tossToken);
    console.log('[Callback] Extracted pgToken:', pgToken);
    
    // 결제 ID가 있으면 쿼리 파라미터로 전달
    const redirectUrl = new URL(returnTo, request.url);
    if (paymentId) {
      redirectUrl.searchParams.set('paymentId', paymentId);
      redirectUrl.searchParams.set('status', 'success');
      console.log('[Callback] Redirecting to:', redirectUrl.toString());
    } else if (tossToken) {
      // 토스페이먼트 토큰이 있는 경우 (토스페이먼트를 통한 결제)
      // sessionStorage에서 paymentId를 찾을 수 있도록 토큰을 전달
      redirectUrl.searchParams.set('toss_token', tossToken);
      if (pgToken) {
        redirectUrl.searchParams.set('pg_token', pgToken);
      }
      redirectUrl.searchParams.set('status', 'processing');
      console.log('[Callback] Redirecting with Toss token:', redirectUrl.toString());
    } else {
      console.warn('[Callback] No paymentId or token found in callback URL');
    }
    
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('[Callback] PortOne callback error:', error);
    return NextResponse.redirect(new URL('/ko/star-candy', request.url));
  }
}


