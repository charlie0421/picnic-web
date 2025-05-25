import { NextRequest, NextResponse } from 'next/server';

/**
 * Apple OAuth form_post 콜백 처리 (호환성용)
 * Apple Developer Console에서 Return URL을 업데이트하기 전까지 임시로 사용
 */
export async function POST(request: NextRequest) {
  console.log('🍎 Apple OAuth form_post 요청 수신 (호환성 경로)');
  
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
      console.error('Apple OAuth 에러 (호환성):', error);
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('error', error);
      return NextResponse.redirect(errorUrl);
    }

    // authorization code가 없는 경우
    if (!code) {
      console.error('Apple OAuth: authorization code 누락 (호환성)');
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('error', 'no_authorization_code');
      return NextResponse.redirect(errorUrl);
    }

    // 성공: 콜백 페이지로 query parameter로 전달
    const callbackUrl = new URL('/auth/callback/apple', request.url);
    callbackUrl.searchParams.set('code', code);
    
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    
    if (user) {
      callbackUrl.searchParams.set('user', user);
    }

    console.log('Apple OAuth 성공 (호환성), 콜백 페이지로 리다이렉트:', callbackUrl.toString());
    
    return NextResponse.redirect(callbackUrl);

  } catch (error) {
    console.error('Apple OAuth API 처리 오류 (호환성):', error);
    
    const errorUrl = new URL('/', request.url);
    errorUrl.searchParams.set('error', 'api_processing_error');
    return NextResponse.redirect(errorUrl);
  }
}

/**
 * GET 요청은 처리하지 않음 (404 반환)
 */
export async function GET(request: NextRequest) {
  console.log('❌ Apple OAuth - GET 요청은 지원하지 않음 (호환성 경로)');
  return new NextResponse('Not Found', { status: 404 });
} 