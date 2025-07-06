// JWT 토큰을 쿠키에서 직접 파싱하여 즉시 사용자 정보 추출

import type { User } from '@supabase/supabase-js';

/**
 * JWT 토큰을 디코딩하여 payload 추출
 */
function decodeJWTPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64 URL 디코딩
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // 패딩 추가
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    
    return JSON.parse(atob(padded));
  } catch (error) {
    console.warn('🔍 [JWT Parser] JWT 디코딩 실패:', error);
    return null;
  }
}

/**
 * 쿠키에서 Supabase 인증 토큰 찾기 (로컬 환경 대응 강화)
 */
function getSupabaseTokenFromCookies(): string | null {
  if (typeof document === 'undefined') return null;

  try {
    console.log('🔍 [JWT Parser] 쿠키 검색 시작 (로컬 환경 대응)');
    
    // 환경 정보 확인
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    console.log('🌐 [JWT Parser] 환경 정보:', {
      hostname,
      protocol,
      isLocal,
      port: window.location.port
    });

    // Supabase 프로젝트 ID 추출 (여러 방법 시도)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.warn('🔍 [JWT Parser] NEXT_PUBLIC_SUPABASE_URL 없음');
      return null;
    }
    
    console.log('🔗 [JWT Parser] Supabase URL:', supabaseUrl.substring(0, 30) + '...');
    
    const urlParts = supabaseUrl.split('.');
    const projectId = urlParts[0]?.split('://')[1];
    if (!projectId) {
      console.warn('🔍 [JWT Parser] 프로젝트 ID 추출 실패');
      return null;
    }

    console.log('🏷️ [JWT Parser] 프로젝트 ID:', projectId);

    // 모든 쿠키 로깅 (디버깅용)
    const allCookies = document.cookie.split(';');
    console.log('🍪 [JWT Parser] 전체 쿠키 목록:');
    allCookies.forEach((cookie, index) => {
      const [name] = cookie.trim().split('=');
      console.log(`  ${index + 1}. ${name}`);
    });

    // 🎯 분할된 쿠키 우선 처리 (.0, .1, .2 등)
    const chunkPattern = `sb-${projectId}-auth-token`;
    const chunks: { [key: string]: string } = {};
    
    console.log('🧩 [JWT Parser] 분할된 쿠키 검색:', chunkPattern);
    
    for (const cookie of allCookies) {
      const [name, value] = cookie.trim().split('=');
      
      if (name && name.startsWith(chunkPattern) && value) {
        // 분할된 쿠키 패턴 확인 (.0, .1, .2 등)
        const chunkMatch = name.match(/\.(\d+)$/);
        if (chunkMatch) {
          const chunkIndex = chunkMatch[1];
          chunks[chunkIndex] = decodeURIComponent(value);
          console.log(`🧩 [JWT Parser] 쿠키 조각 발견: ${name} (${value.length}자)`);
        }
      }
    }

    // 분할된 쿠키 조합
    if (Object.keys(chunks).length > 0) {
      console.log('🔧 [JWT Parser] 분할된 쿠키 조합 시작:', Object.keys(chunks).sort());
      
      // 순서대로 정렬하여 조합
      const sortedChunkKeys = Object.keys(chunks).sort((a, b) => parseInt(a) - parseInt(b));
      let combinedValue = '';
      
      for (const key of sortedChunkKeys) {
        combinedValue += chunks[key];
        console.log(`🔧 [JWT Parser] 조각 ${key} 추가: ${chunks[key].substring(0, 20)}... (총 길이: ${combinedValue.length})`);
      }
      
      console.log('✅ [JWT Parser] 분할된 쿠키 조합 완료:', {
        totalChunks: sortedChunkKeys.length,
        totalLength: combinedValue.length,
        preview: combinedValue.substring(0, 50) + '...'
      });

      // base64- 접두사 제거 및 디코딩 시도
      let processedValue = combinedValue;
      
      if (processedValue.startsWith('base64-')) {
        console.log('🔍 [JWT Parser] base64- 접두사 발견, 제거 후 디코딩 시도');
        const base64Data = processedValue.substring(7); // 'base64-' 제거
        
        try {
          processedValue = atob(base64Data);
          console.log('✅ [JWT Parser] base64 디코딩 성공:', {
            원본길이: base64Data.length,
            디코딩후길이: processedValue.length,
            preview: processedValue.substring(0, 50) + '...'
          });
        } catch (base64Error) {
          console.warn('⚠️ [JWT Parser] base64 디코딩 실패, 원본 사용:', base64Error);
        }
      }

      // JWT 패턴 확인
      if (processedValue.startsWith('eyJ')) {
        console.log('🎯 [JWT Parser] 분할된 쿠키에서 JWT 발견!');
        return processedValue;
      }

      // JSON 파싱 시도
      try {
        const parsed = JSON.parse(processedValue);
        console.log('✅ [JWT Parser] 분할된 쿠키 JSON 파싱 성공:', {
          hasAccessToken: !!parsed.access_token,
          hasRefreshToken: !!parsed.refresh_token,
          tokenType: parsed.token_type
        });
        
        if (parsed.access_token) {
          console.log('🎯 [JWT Parser] 분할된 쿠키에서 access_token 추출 성공!');
          return parsed.access_token;
        }
      } catch (jsonError) {
        console.warn('⚠️ [JWT Parser] 분할된 쿠키 JSON 파싱 실패:', jsonError);
      }
    }

    // 다양한 패턴으로 토큰 검색 (기존 로직)
    const tokenPatterns = [
      `sb-${projectId}-auth-token`, // 기본 패턴
      `supabase-auth-token`, // 대안 패턴
      `sb-auth-token` // 단순 패턴
    ];

    console.log('🔍 [JWT Parser] 검색할 토큰 패턴들:', tokenPatterns);
    
    for (const pattern of tokenPatterns) {
      console.log(`🔎 [JWT Parser] "${pattern}" 패턴으로 검색 중...`);
      
      for (const cookie of allCookies) {
        const [name, value] = cookie.trim().split('=');
        
        if (name && (name === pattern || name.startsWith(pattern)) && value) {
          // 분할된 쿠키는 이미 처리했으므로 건너뛰기
          if (name.includes('.')) continue;
          
          console.log(`✅ [JWT Parser] 쿠키 매칭: ${name}`);
          
          try {
            // URL 디코딩 후 JSON 파싱
            const decoded = decodeURIComponent(value);
            console.log('🔍 [JWT Parser] 디코딩된 쿠키 길이:', decoded.length);
            
            let parsed: any;
            
            // JSON 파싱 시도
            try {
              parsed = JSON.parse(decoded);
              console.log('✅ [JWT Parser] JSON 파싱 성공:', {
                hasAccessToken: !!parsed.access_token,
                hasRefreshToken: !!parsed.refresh_token,
                tokenType: parsed.token_type,
                expiresAt: parsed.expires_at
              });
            } catch (jsonError) {
              // JSON이 아닌 경우 직접 토큰일 수 있음
              console.log('🔍 [JWT Parser] JSON 파싱 실패, 직접 토큰으로 시도');
              
              // JWT 패턴 확인 (eyJ로 시작하는지)
              if (decoded.startsWith('eyJ')) {
                console.log('✅ [JWT Parser] 직접 JWT 토큰 발견');
                return decoded;
              }
              
              console.warn('🔍 [JWT Parser] JSON 파싱 실패:', jsonError);
              continue;
            }
            
            // access_token 추출
            if (parsed.access_token) {
              console.log('🍪 [JWT Parser] 쿠키에서 토큰 추출 성공');
              return parsed.access_token;
            } else {
              console.warn('🔍 [JWT Parser] access_token 필드 없음:', Object.keys(parsed));
            }
          } catch (parseError) {
            console.warn('🔍 [JWT Parser] 쿠키 파싱 실패:', parseError);
          }
        }
      }
    }

    // 로컬 환경 특별 처리: 모든 sb- 쿠키 검색 (분할 쿠키 제외)
    if (isLocal) {
      console.log('🏠 [JWT Parser] 로컬 환경 - 모든 sb- 쿠키 검색');
      
      for (const cookie of allCookies) {
        const [name, value] = cookie.trim().split('=');
        
        if (name && name.includes('sb-') && name.includes('auth') && !name.includes('.') && value) {
          console.log(`🔍 [JWT Parser] 로컬 환경에서 발견된 sb- 쿠키: ${name}`);
          
          try {
            const decoded = decodeURIComponent(value);
            
            // JWT 패턴 확인
            if (decoded.startsWith('eyJ')) {
              console.log('✅ [JWT Parser] 로컬 환경에서 직접 JWT 발견');
              return decoded;
            }
            
            // JSON 파싱 시도
            try {
              const parsed = JSON.parse(decoded);
              if (parsed.access_token) {
                console.log('✅ [JWT Parser] 로컬 환경에서 토큰 추출 성공');
                return parsed.access_token;
              }
            } catch {
              // JSON이 아니면 무시
            }
          } catch (error) {
            console.warn('🔍 [JWT Parser] 로컬 쿠키 파싱 오류:', error);
          }
        }
      }
    }

    console.log('❌ [JWT Parser] 유효한 토큰을 찾을 수 없음');
    return null;
  } catch (error) {
    console.warn('🔍 [JWT Parser] 쿠키 검색 중 오류:', error);
    return null;
  }
}

/**
 * localStorage에서 Supabase 토큰 찾기
 */
function getSupabaseTokenFromStorage(): string | null {
  try {
    console.log('🔍 [JWT Parser] localStorage 검색 시작');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.warn('🔍 [JWT Parser] NEXT_PUBLIC_SUPABASE_URL 없음 (localStorage)');
      return null;
    }
    
    const urlParts = supabaseUrl.split('.');
    const projectId = urlParts[0]?.split('://')[1];
    
    if (projectId) {
      const key = `sb-${projectId}-auth-token`;
      const storedData = localStorage.getItem(key);
      
      if (storedData) {
        console.log(`✅ [JWT Parser] localStorage에서 토큰 발견: ${key}`);
        
        try {
          const parsed = JSON.parse(storedData);
          if (parsed?.access_token) {
            console.log('✅ [JWT Parser] localStorage에서 access_token 추출 성공');
            return parsed.access_token;
          } else {
            console.warn('🔍 [JWT Parser] localStorage 데이터에 access_token 없음:', Object.keys(parsed));
          }
        } catch (parseError) {
          console.warn('⚠️ [JWT Parser] localStorage 데이터 파싱 실패:', parseError);
          // 직접 JWT일 수 있음
          if (storedData.startsWith('eyJ')) {
            console.log('✅ [JWT Parser] localStorage에서 직접 JWT 발견');
            return storedData;
          }
        }
      }
    }

    // 모든 Supabase 키 확인
    console.log('🔍 [JWT Parser] 모든 localStorage sb- 키 검색');
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        allKeys.push(key);
        
        try {
          const storedData = localStorage.getItem(key);
          if (storedData) {
            console.log(`🔍 [JWT Parser] localStorage 키 확인: ${key}`);
            
            // JWT 직접 확인
            if (storedData.startsWith('eyJ')) {
              console.log(`✅ [JWT Parser] localStorage에서 직접 JWT 발견: ${key}`);
              return storedData;
            }
            
            // JSON 파싱 시도
            try {
              const parsed = JSON.parse(storedData);
              if (parsed?.access_token) {
                console.log(`✅ [JWT Parser] localStorage에서 토큰 추출 성공: ${key}`);
                return parsed.access_token;
              }
            } catch {
              // JSON이 아니면 무시
            }
          }
        } catch (error) {
          console.warn(`⚠️ [JWT Parser] localStorage 키 처리 실패: ${key}`, error);
        }
      }
    }

    console.log('🔍 [JWT Parser] localStorage 검색된 키:', allKeys);
    console.log('❌ [JWT Parser] localStorage에서 유효한 토큰을 찾을 수 없음');
    return null;
  } catch (error) {
    console.error('❌ [JWT Parser] localStorage 검색 중 오류:', error);
    return null;
  }
}

/**
 * JWT 토큰에서 사용자 정보 추출
 */
function extractUserFromJWT(token: string): User | null {
  try {
    const payload = decodeJWTPayload(token);
    if (!payload) return null;

    console.log('🔍 [JWT Parser] JWT payload 확인:', {
      sub: payload.sub?.substring(0, 8) + '...',
      email: payload.email,
      exp: payload.exp,
      iat: payload.iat,
      provider: payload.app_metadata?.provider
    });

    // JWT payload에서 사용자 정보 추출
    const user: User = {
      id: payload.sub,
      email: payload.email,
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {},
      aud: payload.aud,
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: payload.updated_at || new Date().toISOString(),
      email_confirmed_at: payload.email_confirmed_at,
      phone_confirmed_at: payload.phone_confirmed_at,
      confirmation_sent_at: payload.confirmation_sent_at,
      recovery_sent_at: payload.recovery_sent_at,
      invited_at: payload.invited_at,
      action_link: payload.action_link,
      role: payload.role
    };

    // 토큰 만료 시간 확인
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.warn('🔍 [JWT Parser] 토큰이 만료됨:', {
        exp: payload.exp,
        now,
        expired: payload.exp < now,
        expiredSecondsAgo: now - payload.exp
      });
      return null;
    }

    console.log('✅ [JWT Parser] 사용자 정보 추출 성공:', {
      userId: user.id?.substring(0, 8) + '...',
      email: user.email,
      provider: user.app_metadata?.provider,
      exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A'
    });

    return user;
  } catch (error) {
    console.warn('🔍 [JWT Parser] 사용자 정보 추출 실패:', error);
    return null;
  }
}

/**
 * 쿠키와 localStorage에서 즉시 사용자 정보 추출 (네트워크 요청 없음)
 */
export function getInstantUserFromCookies(): User | null {
  console.log('🚀 [JWT Parser] 즉시 사용자 정보 추출 시작 (쿠키 + localStorage)');
  
  // 1순위: 쿠키에서 토큰 찾기
  let token = getSupabaseTokenFromCookies();
  
  // 2순위: localStorage에서 토큰 찾기
  if (!token) {
    console.log('🔄 [JWT Parser] 쿠키에서 토큰 없음 → localStorage 확인');
    token = getSupabaseTokenFromStorage();
  }
  
  if (!token) {
    console.log('❌ [JWT Parser] 쿠키와 localStorage 모두에서 토큰 없음');
    return null;
  }

  console.log('🎯 [JWT Parser] 토큰 발견 - JWT 파싱 시작');
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
 * 토큰이 곧 만료되는지 확인 (30분 이내)
 */
export function isTokenExpiringSoon(): boolean {
  const expiry = getTokenExpiry();
  if (!expiry) return false;

  const now = new Date();
  const thirtyMinutes = 30 * 60 * 1000; // 30분
  
  return (expiry.getTime() - now.getTime()) < thirtyMinutes;
}

/**
 * 개발자 디버깅 함수 - 브라우저 콘솔용 (로컬 환경 특화)
 */
export function debugJWTInfo() {
  if (typeof window === 'undefined') return;

  console.log('🔍 [JWT Debug] 환경 정보:', {
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    port: window.location.port,
    isLocal: window.location.hostname === 'localhost',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
  });

  // 모든 쿠키 출력
  const allCookies = document.cookie.split(';');
  console.log('🍪 [JWT Debug] 모든 쿠키:', allCookies.map(c => c.trim().split('=')[0]));

  // localStorage 정보 출력
  console.log('💾 [JWT Debug] localStorage 정보:');
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
  console.log(`💾 [JWT Debug] 총 localStorage 키: ${localStorageKeys.length}개, Supabase 인증 키: ${supabaseKeys.length}개`);

  // 쿠키에서 토큰 시도
  const cookieToken = getSupabaseTokenFromCookies();
  console.log('🍪 [JWT Debug] 쿠키 토큰:', cookieToken ? '✅ 발견' : '❌ 없음');
  
  // localStorage에서 토큰 시도
  const storageToken = getSupabaseTokenFromStorage();
  console.log('💾 [JWT Debug] localStorage 토큰:', storageToken ? '✅ 발견' : '❌ 없음');

  // 최종 토큰 결정
  const token = cookieToken || storageToken;
  if (!token) {
    console.log('❌ [JWT Debug] 토큰 없음 (쿠키와 localStorage 모두)');
    return { success: false, message: '토큰 없음' };
  }

  console.log('🎯 [JWT Debug] 최종 선택된 토큰 소스:', cookieToken ? '쿠키' : 'localStorage');

  const payload = decodeJWTPayload(token);
  const user = extractUserFromJWT(token);
  const expiry = getTokenExpiry();
  const expiringSoon = isTokenExpiringSoon();

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

  console.log('🔍 [JWT Debug] 완전한 토큰 정보:', result);
  return result;
}

/**
 * 로컬 환경 전용 쿠키 리스트 함수
 */
export function debugLocalCookies() {
  if (typeof window === 'undefined') return;

  console.log('🏠 [Local Debug] 로컬 환경 쿠키 분석');
  
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

  console.log('🏠 [Local Debug] 쿠키 분석 결과:', analysis);
  return analysis;
}

// 브라우저 환경에서 디버깅 함수 등록
if (typeof window !== 'undefined') {
  (window as any).debugJWT = debugJWTInfo;
  (window as any).debugLocalCookies = debugLocalCookies;
  console.log('🛠️ [JWT Parser] 디버깅 함수 등록:');
  console.log('  - debugJWT() : JWT 토큰 정보 확인');
  console.log('  - debugLocalCookies() : 로컬 환경 쿠키 분석');
} 