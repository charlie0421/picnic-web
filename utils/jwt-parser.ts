// JWT 토큰을 쿠키에서 직접 파싱하여 즉시 사용자 정보 추출
// Barrel — 공개 API를 단일 진입점으로 재노출

import type { User } from '@supabase/supabase-js';

import { debugLog, decodeJWTPayload, extractUserFromJWT } from './jwt-parser-core';
import { getSupabaseTokenFromCookies, getSupabaseTokenFromStorage } from './jwt-parser-source';

// 디버깅 모듈을 import하면 window 등록 부수 효과가 실행됨
export { debugJWTInfo, debugLocalCookies } from './jwt-parser-debug';

/**
 * 쿠키와 localStorage에서 즉시 사용자 정보 추출 (네트워크 요청 없음)
 */
export function getInstantUserFromCookies(): User | null {
  debugLog('🚀 [JWT Parser] 즉시 사용자 정보 추출 시작 (쿠키 + localStorage)');

  // 1순위: 쿠키에서 토큰 찾기
  let token = getSupabaseTokenFromCookies();

  // 2순위: localStorage에서 토큰 찾기
  if (!token) {
    debugLog('🔄 [JWT Parser] 쿠키에서 토큰 없음 → localStorage 확인');
    token = getSupabaseTokenFromStorage();
  }

  if (!token) {
    debugLog('❌ [JWT Parser] 쿠키와 localStorage 모두에서 토큰 없음');
    return null;
  }

  debugLog('🎯 [JWT Parser] 토큰 발견 - JWT 파싱 시작');
  return extractUserFromJWT(token);
}

/**
 * 토큰 만료 시간 확인
 */
export function getTokenExpiry(): Date | null {
  const token = getSupabaseTokenFromCookies();
  if (!token) return null;

  const payload = decodeJWTPayload(token);
  if (!payload?.exp) return null;

  return new Date(payload.exp * 1000);
}

/**
 * 토큰이 곧 만료되는지 확인 (기본: 5분 이내)
 */
export function isTokenExpiringSoon(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return false;

  const now = new Date();
  const thresholdMs = 5 * 60 * 1000; // 5분
  return (expiry.getTime() - now.getTime()) < thresholdMs;
}

/**
 * 토큰 남은 시간(ms). 없으면 null
 */
export function getTokenRemainingMs(): number | null {
  const expiry = getTokenExpiry();
  if (!expiry) return null;
  return Math.max(0, expiry.getTime() - Date.now());
}
