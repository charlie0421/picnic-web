// 개발자 디버깅 함수 및 브라우저 콘솔 등록

import { decodeJWTPayload, extractUserFromJWT, debugLog } from './jwt-parser-core';
import { getSupabaseTokenFromCookies, getSupabaseTokenFromStorage } from './jwt-parser-source';

/**
 * 개발자 디버깅 함수 - 브라우저 콘솔용 (로컬 환경 특화)
 */
export function debugJWTInfo() {
  if (typeof window === 'undefined') return;

  debugLog('🔍 [JWT Debug] 환경 정보:', {
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    port: window.location.port,
    isLocal: window.location.hostname === 'localhost',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
  });

  // 모든 쿠키 출력
  const allCookies = document.cookie.split(';');
  debugLog('🍪 [JWT Debug] 모든 쿠키:', allCookies.map(c => c.trim().split('=')[0]));

  // localStorage 정보 출력
  debugLog('💾 [JWT Debug] localStorage 정보:');
  const localStorageKeys: string[] = [];
  const supabaseKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      localStorageKeys.push(key);
      if (key.startsWith('sb-') && key.includes('auth')) {
        supabaseKeys.push(key);
      }
    }
  }
  debugLog(`💾 [JWT Debug] 총 localStorage 키: ${localStorageKeys.length}개, Supabase 인증 키: ${supabaseKeys.length}개`);

  // 쿠키에서 토큰 시도
  const cookieToken = getSupabaseTokenFromCookies();
  debugLog('🍪 [JWT Debug] 쿠키 토큰:', cookieToken ? '✅ 발견' : '❌ 없음');

  // localStorage에서 토큰 시도
  const storageToken = getSupabaseTokenFromStorage();
  debugLog('💾 [JWT Debug] localStorage 토큰:', storageToken ? '✅ 발견' : '❌ 없음');

  // 최종 토큰 결정
  const token = cookieToken || storageToken;
  if (!token) {
    debugLog('❌ [JWT Debug] 토큰 없음 (쿠키와 localStorage 모두)');
    return { success: false, message: '토큰 없음' };
  }

  debugLog('🎯 [JWT Debug] 최종 선택된 토큰 소스:', cookieToken ? '쿠키' : 'localStorage');

  const payload = decodeJWTPayload(token);
  const user = extractUserFromJWT(token);

  // getTokenExpiry 로직 인라인 (순환 의존성 방지)
  let expiry: Date | null = null;
  {
    const expiryToken = getSupabaseTokenFromCookies();
    if (expiryToken) {
      const expiryPayload = decodeJWTPayload(expiryToken);
      if (expiryPayload?.exp) {
        expiry = new Date(expiryPayload.exp * 1000);
      }
    }
  }

  // isTokenExpiringSoon 로직 인라인 (순환 의존성 방지)
  let expiringSoon = false;
  if (expiry) {
    const now = new Date();
    const thresholdMs = 5 * 60 * 1000; // 5분
    expiringSoon = (expiry.getTime() - now.getTime()) < thresholdMs;
  }

  const result = {
    success: true,
    tokenSource: cookieToken ? 'cookie' : 'localStorage',
    token: {
      length: token.length,
      prefix: token.substring(0, 20) + '...',
      isJWT: token.startsWith('eyJ')
    },
    payload: payload ? {
      sub: payload.sub?.substring(0, 8) + '...',
      email: payload.email,
      exp: payload.exp,
      iat: payload.iat,
      provider: payload.app_metadata?.provider,
      isExpired: payload.exp ? (Math.floor(Date.now() / 1000) > payload.exp) : null
    } : null,
    user: user ? {
      id: user.id?.substring(0, 8) + '...',
      email: user.email,
      provider: user.app_metadata?.provider
    } : null,
    expiry: expiry?.toISOString(),
    expiringSoon,
    isValid: !!user
  };

  debugLog('🔍 [JWT Debug] 완전한 토큰 정보:', result);
  return result;
}

/**
 * 로컬 환경 전용 쿠키 리스트 함수
 */
export function debugLocalCookies() {
  if (typeof window === 'undefined') return;

  debugLog('🏠 [Local Debug] 로컬 환경 쿠키 분석');

  const cookies = document.cookie.split(';');
  const analysis = {
    total: cookies.length,
    supabaseCookies: [],
    authCookies: [],
    otherCookies: []
  } as any;

  cookies.forEach(cookie => {
    const [name, value] = cookie.trim().split('=');

    if (name.includes('sb-')) {
      analysis.supabaseCookies.push({
        name,
        valueLength: value?.length || 0,
        hasValue: !!value,
        isJWT: value?.startsWith('eyJ') || false
      });
    } else if (name.includes('auth')) {
      analysis.authCookies.push({ name, valueLength: value?.length || 0 });
    } else {
      analysis.otherCookies.push(name);
    }
  });

  debugLog('🏠 [Local Debug] 쿠키 분석 결과:', analysis);
  return analysis;
}

// 브라우저 환경에서 디버깅 함수 등록
if (typeof window !== 'undefined') {
  (window as any).debugJWT = debugJWTInfo;
  (window as any).debugLocalCookies = debugLocalCookies;
  debugLog('🛠️ [JWT Parser] 디버깅 함수 등록:');
  debugLog('  - debugJWT() : JWT 토큰 정보 확인');
  debugLog('  - debugLocalCookies() : 로컬 환경 쿠키 분석');
}
