import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { SocialAuthError, SocialAuthErrorCode } from '@/lib/supabase/social/types';
import { parseAppleIdentityToken, normalizeAppleProfile } from '@/lib/supabase/social/apple';
import * as jose from 'jose'; // jose 라이브러리 필요 (npm install jose)

/**
 * Apple OAuth form_post 콜백 처리 API
 * Apple에서 email/name scope 요청 시 form_post로 데이터를 전송함
 */
export async function POST(request: NextRequest) {
  console.log('🍎 Apple OAuth form_post 요청 수신');
  
  try {
    // Content-Type 확인
    const contentType = request.headers.get('content-type');
    console.log('Content-Type:', contentType);
    
    // form data 파싱
    const formData = await request.formData();
    const code = formData.get('code') as string;
    const state = formData.get('state') as string;
    const user = formData.get('user') as string;
    const error = formData.get('error') as string;
    
    console.log('Apple form_post 데이터:', {
      code: code ? 'present' : 'missing',
      state: state || 'missing',
      user: user ? 'present' : 'missing',
      error: error || 'none'
    });

    // 에러가 있는 경우
    if (error) {
      console.error('Apple OAuth 에러:', error);
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('error', error);
      return NextResponse.redirect(errorUrl);
    }

    // authorization code가 없는 경우
    if (!code) {
      console.error('Apple OAuth: authorization code 누락');
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('error', 'no_authorization_code');
      return NextResponse.redirect(errorUrl);
    }

    // 성공: 콜백 페이지로 리다이렉트
    const callbackUrl = new URL('/auth/callback/apple', request.url);
    callbackUrl.searchParams.set('code', code);
    
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }
    
    if (user) {
      callbackUrl.searchParams.set('user', user);
    }

    console.log('Apple OAuth 성공, 콜백 페이지로 리다이렉트:', callbackUrl.toString());
    
    return NextResponse.redirect(callbackUrl);

  } catch (error) {
    console.error('Apple OAuth API 처리 오류:', error);
    
    const errorUrl = new URL('/', request.url);
    errorUrl.searchParams.set('error', 'api_processing_error');
    return NextResponse.redirect(errorUrl);
  }
}

/**
 * GET 요청 처리 (테스트용)
 */
export async function GET(request: NextRequest) {
  console.log('🍎 Apple OAuth API - GET 요청 수신 (테스트)');
  
  return NextResponse.json({
    message: 'Apple OAuth API 정상 작동',
    endpoint: '/api/auth/apple',
    method: 'POST',
    timestamp: new Date().toISOString()
  });
}

/**
 * JWT 형식의 Apple 클라이언트 시크릿 생성
 * 
 * @returns 생성된 클라이언트 시크릿
 */
async function generateAppleClientSecret(): Promise<string> {
  try {
    // Apple 클라이언트 시크릿 생성에 필요한 값
    const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID!;
    const teamId = process.env.APPLE_TEAM_ID!;
    const keyId = process.env.APPLE_KEY_ID!;
    const privateKey = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    
    if (!clientId || !teamId || !keyId || !privateKey) {
      throw new Error('Apple 인증에 필요한 환경 변수가 설정되지 않았습니다.');
    }
    
    // 현재 시간 기준으로 JWT 생성 (6개월 유효기간)
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 15777000; // 6개월 (초 단위)
    
    // JWT 서명에 사용할 프라이빗 키 가져오기
    const alg = 'ES256';
    const privateKeyImported = await jose.importPKCS8(privateKey, alg);
    
    // JWT 생성 및 서명
    const jwt = await new jose.SignJWT({
      iss: teamId,
      iat: now,
      exp: expiry,
      aud: 'https://appleid.apple.com',
      sub: clientId,
    })
      .setProtectedHeader({ alg, kid: keyId })
      .sign(privateKeyImported);
    
    return jwt;
  } catch (error) {
    console.error('Apple 클라이언트 시크릿 생성 오류:', error);
    throw error;
  }
} 