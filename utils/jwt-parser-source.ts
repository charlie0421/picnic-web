// 쿠키 및 localStorage에서 Supabase 인증 토큰을 검색하는 유틸리티

import { debugLog, debugWarn, decodeJWTPayload } from './jwt-parser-core';

/**
 * 쿠키에서 Supabase 인증 토큰 찾기 (로컬 환경 대응 강화)
 */
export function getSupabaseTokenFromCookies(): string | null {
  if (typeof document === 'undefined') return null;

  try {
    debugLog('🔍 [JWT Parser] 쿠키 검색 시작 (로컬 환경 대응)');

    // 환경 정보 확인
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    debugLog('🌐 [JWT Parser] 환경 정보:', {
      hostname,
      protocol,
      isLocal,
      port: window.location.port
    });

    // Supabase 프로젝트 ID 추출 (여러 방법 시도)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      debugWarn('🔍 [JWT Parser] NEXT_PUBLIC_SUPABASE_URL 없음');
      return null;
    }

    debugLog('🔗 [JWT Parser] Supabase URL:', supabaseUrl.substring(0, 30) + '...');

    const urlParts = supabaseUrl.split('.');
    const projectId = urlParts[0]?.split('://')[1];
    if (!projectId) {
      debugWarn('🔍 [JWT Parser] 프로젝트 ID 추출 실패');
      return null;
    }

    debugLog('🏷️ [JWT Parser] 프로젝트 ID:', projectId);

    // 모든 쿠키 로깅 (디버깅용)
    const allCookies = document.cookie.split(';');
    debugLog('🍪 [JWT Parser] 전체 쿠키 목록:');
    allCookies.forEach((cookie, index) => {
      const [name] = cookie.trim().split('=');
      debugLog(`  ${index + 1}. ${name}`);
    });

    // 🎯 분할된 쿠키 우선 처리 (.0, .1, .2 등)
    const chunkPattern = `sb-${projectId}-auth-token`;
    const chunks: { [key: string]: string } = {};

    debugLog('🧩 [JWT Parser] 분할된 쿠키 검색:', chunkPattern);

    for (const cookie of allCookies) {
      const [name, value] = cookie.trim().split('=');

      if (name && name.startsWith(chunkPattern) && value) {
        // 분할된 쿠키 패턴 확인 (.0, .1, .2 등)
        const chunkMatch = name.match(/\.(\d+)$/);
        if (chunkMatch) {
          const chunkIndex = chunkMatch[1];
          chunks[chunkIndex] = decodeURIComponent(value);
          debugLog(`🧩 [JWT Parser] 쿠키 조각 발견: ${name} (${value.length}자)`);
        }
      }
    }

    // 분할된 쿠키 조합
    if (Object.keys(chunks).length > 0) {
      debugLog('🔧 [JWT Parser] 분할된 쿠키 조합 시작:', Object.keys(chunks).sort());

      // 순서대로 정렬하여 조합
      const sortedChunkKeys = Object.keys(chunks).sort((a, b) => parseInt(a) - parseInt(b));
      let combinedValue = '';

      for (const key of sortedChunkKeys) {
        combinedValue += chunks[key];
        debugLog(`🔧 [JWT Parser] 조각 ${key} 추가: ${chunks[key].substring(0, 20)}... (총 길이: ${combinedValue.length})`);
      }

      debugLog('✅ [JWT Parser] 분할된 쿠키 조합 완료:', {
        totalChunks: sortedChunkKeys.length,
        totalLength: combinedValue.length,
        preview: combinedValue.substring(0, 50) + '...'
      });

      // base64- 접두사 제거 및 디코딩 시도
      let processedValue = combinedValue;

      if (processedValue.startsWith('base64-')) {
        debugLog('🔍 [JWT Parser] base64- 접두사 발견, 제거 후 디코딩 시도');
        const base64Data = processedValue.substring(7); // 'base64-' 제거

        try {
          processedValue = atob(base64Data);
          debugLog('✅ [JWT Parser] base64 디코딩 성공:', {
            원본길이: base64Data.length,
            디코딩후길이: processedValue.length,
            preview: processedValue.substring(0, 50) + '...'
          });
        } catch (base64Error) {
          debugWarn('⚠️ [JWT Parser] base64 디코딩 실패, 원본 사용:', base64Error);
        }
      }

      // JWT 패턴 확인
      if (processedValue.startsWith('eyJ')) {
        debugLog('🎯 [JWT Parser] 분할된 쿠키에서 JWT 발견!');
        return processedValue;
      }

      // JSON 파싱 시도
      try {
        const parsed = JSON.parse(processedValue);
        debugLog('✅ [JWT Parser] 분할된 쿠키 JSON 파싱 성공:', {
          hasAccessToken: !!parsed.access_token,
          hasRefreshToken: !!parsed.refresh_token,
          tokenType: parsed.token_type
        });

        if (parsed.access_token) {
          debugLog('🎯 [JWT Parser] 분할된 쿠키에서 access_token 추출 성공!');
          return parsed.access_token;
        }
      } catch (jsonError) {
        debugWarn('⚠️ [JWT Parser] 분할된 쿠키 JSON 파싱 실패:', jsonError);
      }
    }

    // 다양한 패턴으로 토큰 검색 (기존 로직)
    const tokenPatterns = [
      `sb-${projectId}-auth-token`, // 기본 패턴
      `supabase-auth-token`, // 대안 패턴
      `sb-auth-token` // 단순 패턴
    ];

    debugLog('🔍 [JWT Parser] 검색할 토큰 패턴들:', tokenPatterns);

    for (const pattern of tokenPatterns) {
      debugLog(`🔎 [JWT Parser] "${pattern}" 패턴으로 검색 중...`);

      for (const cookie of allCookies) {
        const [name, value] = cookie.trim().split('=');

        if (name && (name === pattern || name.startsWith(pattern)) && value) {
          // 분할된 쿠키는 이미 처리했으므로 건너뛰기
          if (name.includes('.')) continue;

          debugLog(`✅ [JWT Parser] 쿠키 매칭: ${name}`);

          try {
            // URL 디코딩 후 JSON 파싱
            const decoded = decodeURIComponent(value);
            debugLog('🔍 [JWT Parser] 디코딩된 쿠키 길이:', decoded.length);

            let parsed: any;

            // JSON 파싱 시도
            try {
              parsed = JSON.parse(decoded);
              debugLog('✅ [JWT Parser] JSON 파싱 성공:', {
                hasAccessToken: !!parsed.access_token,
                hasRefreshToken: !!parsed.refresh_token,
                tokenType: parsed.token_type,
                expiresAt: parsed.expires_at
              });
            } catch (jsonError) {
              // JSON이 아닌 경우 직접 토큰일 수 있음
              debugLog('🔍 [JWT Parser] JSON 파싱 실패, 직접 토큰으로 시도');

              // JWT 패턴 확인 (eyJ로 시작하는지)
              if (decoded.startsWith('eyJ')) {
                debugLog('✅ [JWT Parser] 직접 JWT 토큰 발견');
                return decoded;
              }

              debugWarn('🔍 [JWT Parser] JSON 파싱 실패:', jsonError);
              continue;
            }

            // access_token 추출
            if (parsed.access_token) {
              debugLog('🍪 [JWT Parser] 쿠키에서 토큰 추출 성공');
              return parsed.access_token;
            } else {
              debugWarn('🔍 [JWT Parser] access_token 필드 없음:', Object.keys(parsed));
            }
          } catch (parseError) {
            debugWarn('🔍 [JWT Parser] 쿠키 파싱 실패:', parseError);
          }
        }
      }
    }

    // 로컬 환경 특별 처리: 모든 sb- 쿠키 검색 (분할 쿠키 제외)
    if (isLocal) {
      debugLog('🏠 [JWT Parser] 로컬 환경 - 모든 sb- 쿠키 검색');

      for (const cookie of allCookies) {
        const [name, value] = cookie.trim().split('=');

        if (name && name.includes('sb-') && name.includes('auth') && !name.includes('.') && value) {
          debugLog(`🔍 [JWT Parser] 로컬 환경에서 발견된 sb- 쿠키: ${name}`);

          try {
            const decoded = decodeURIComponent(value);

            // JWT 패턴 확인
            if (decoded.startsWith('eyJ')) {
              debugLog('✅ [JWT Parser] 로컬 환경에서 직접 JWT 발견');
              return decoded;
            }

            // JSON 파싱 시도
            try {
              const parsed = JSON.parse(decoded);
              if (parsed.access_token) {
                debugLog('✅ [JWT Parser] 로컬 환경에서 토큰 추출 성공');
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

    debugLog('❌ [JWT Parser] 유효한 토큰을 찾을 수 없음');
    return null;
  } catch (error) {
    debugWarn('🔍 [JWT Parser] 쿠키 검색 중 오류:', error);
    return null;
  }
}

/**
 * localStorage에서 Supabase 토큰 찾기
 */
export function getSupabaseTokenFromStorage(): string | null {
  try {
    debugLog('🔍 [JWT Parser] localStorage 검색 시작');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      debugWarn('🔍 [JWT Parser] NEXT_PUBLIC_SUPABASE_URL 없음 (localStorage)');
      return null;
    }

    const urlParts = supabaseUrl.split('.');
    const projectId = urlParts[0]?.split('://')[1];

    if (projectId) {
      const key = `sb-${projectId}-auth-token`;
      const storedData = localStorage.getItem(key);

      if (storedData) {
        debugLog(`✅ [JWT Parser] localStorage에서 토큰 발견: ${key}`);

        try {
          const parsed = JSON.parse(storedData);
          if (parsed?.access_token) {
            debugLog('✅ [JWT Parser] localStorage에서 access_token 추출 성공');
            return parsed.access_token;
          } else {
            debugWarn('🔍 [JWT Parser] localStorage 데이터에 access_token 없음:', Object.keys(parsed));
          }
        } catch (parseError) {
          debugWarn('⚠️ [JWT Parser] localStorage 데이터 파싱 실패:', parseError);
          // 직접 JWT일 수 있음
          if (storedData.startsWith('eyJ')) {
            debugLog('✅ [JWT Parser] localStorage에서 직접 JWT 발견');
            return storedData;
          }
        }
      }
    }

    // 모든 Supabase 키 확인
    debugLog('🔍 [JWT Parser] 모든 localStorage sb- 키 검색');
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        allKeys.push(key);

        try {
          const storedData = localStorage.getItem(key);
          if (storedData) {
            debugLog(`🔍 [JWT Parser] localStorage 키 확인: ${key}`);

            // JWT 직접 확인
            if (storedData.startsWith('eyJ')) {
              debugLog(`✅ [JWT Parser] localStorage에서 직접 JWT 발견: ${key}`);
              return storedData;
            }

            // JSON 파싱 시도
            try {
              const parsed = JSON.parse(storedData);
              if (parsed?.access_token) {
                debugLog(`✅ [JWT Parser] localStorage에서 토큰 추출 성공: ${key}`);
                return parsed.access_token;
              }
            } catch {
              // JSON이 아니면 무시
            }
          }
        } catch (error) {
          debugWarn(`⚠️ [JWT Parser] localStorage 키 처리 실패: ${key}`, error);
        }
      }
    }

    debugLog('🔍 [JWT Parser] localStorage 검색된 키:', allKeys);
    debugLog('❌ [JWT Parser] localStorage에서 유효한 토큰을 찾을 수 없음');
    return null;
  } catch (error) {
    console.error('❌ [JWT Parser] localStorage 검색 중 오류:', error);
    return null;
  }
}
