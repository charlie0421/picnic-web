import { NextRequest, NextResponse } from 'next/server';

/**
 * Apple OAuth form_post 콜백 처리 (이전 경로 호환성)
 * Apple Developer Console에서 아직 이전 URL로 요청을 보내는 경우 처리
 */
export async function POST(request: NextRequest) {
  console.log('🍎 Apple OAuth form_post 요청 수신 (호환성 경로: /auth/callback/apple)');
  
  try {
    // form data 파싱
    const formData = await request.formData();
    const code = formData.get('code') as string;
    const state = formData.get('state') as string;
    const user = formData.get('user') as string;
    const error = formData.get('error') as string;
    
    console.log('Apple form_post 데이터 (호환성):', {
      code: code ? 'present' : 'missing',
      state: state || 'missing',
      user: user ? 'present' : 'missing',
      error: error || 'none'
    });

    // 에러가 있는 경우
    if (error) {
      console.error('Apple OAuth 에러:', error);
      const errorUrl = new URL('/auth/callback/apple', request.url);
      errorUrl.searchParams.set('error', error);
      return NextResponse.redirect(errorUrl);
    }

    // code가 없는 경우
    if (!code) {
      console.error('Apple OAuth code 누락');
      const errorUrl = new URL('/auth/callback/apple', request.url);
      errorUrl.searchParams.set('error', 'missing_code');
      return NextResponse.redirect(errorUrl);
    }

    // 성공: 콜백 페이지로 query parameter로 전달 (무한 루프 방지: 페이지로 이동)
    const callbackUrl = new URL('/auth/callback/apple', request.url);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('from_api', 'true'); // API에서 온 요청임을 표시
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    if (user) {
      callbackUrl.searchParams.set('user', user);
    }
    
    console.log('Apple OAuth 성공, 리다이렉트:', callbackUrl.toString());
    return NextResponse.redirect(callbackUrl);
    
  } catch (error) {
    console.error('Apple form_post 처리 오류:', error);
    const errorUrl = new URL('/auth/callback/apple', request.url);
    errorUrl.searchParams.set('error', 'processing_failed');
    return NextResponse.redirect(errorUrl);
  }
}

/**
 * GET 요청 처리 (테스트용)
 */
export async function GET() {
  return NextResponse.json({
    message: 'Apple OAuth 콜백 엔드포인트 (호환성)',
    path: '/auth/callback/apple',
    note: 'POST 요청만 처리됩니다'
  });
} 