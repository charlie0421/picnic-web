import { NextRequest, NextResponse } from 'next/server';

// PortOne 결제 완료 후 리다이렉트 콜백
// 사용자가 결제 창에서 돌아오면 구매 페이지로 안내합니다.
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const returnTo = url.searchParams.get('returnTo') || '/star-candy';
    return NextResponse.redirect(new URL(returnTo, request.url));
  } catch {
    return NextResponse.redirect(new URL('/star-candy', request.url));
  }
}


