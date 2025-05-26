import { NextRequest, NextResponse } from 'next/server';

/**
 * Supabase Apple OAuth 콜백 프록시
 * 
 * Supabase가 기대하는 /api/auth/v1/callback URL을 
 * 실제 앱의 콜백 페이지로 리다이렉트합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    console.log('🍎 Apple OAuth 콜백 수신:', request.url);
    console.log('🍎 쿼리 파라미터:', Object.fromEntries(searchParams.entries()));
    
    // URL의 모든 쿼리 파라미터를 가져와서 그대로 전달
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      params.append(key, value);
    });
    
    // Apple 로그인 콜백 페이지로 리다이렉트
    const redirectUrl = `https://api.picnic.fan/auth/callback/apple?${params.toString()}`;
    
    console.log('🍎 Apple OAuth 콜백 프록시 리다이렉트:', redirectUrl);
    
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('🚨 Apple OAuth 콜백 프록시 오류:', error);
    
    // 오류 발생 시 홈페이지로 리다이렉트
    return NextResponse.redirect('https://api.picnic.fan/?error=auth_callback_failed');
  }
}

export async function POST(request: NextRequest) {
  // Apple은 때때로 POST로 콜백을 보낼 수 있음
  return GET(request);
} 