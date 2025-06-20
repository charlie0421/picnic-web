/**
 * 응급 인증 오류 해결 스크립트
 * 브라우저에서 리프레시 토큰 오류가 발생했을 때 실행하세요.
 */

(function() {
  console.log('🚨 [Emergency Fix] 리프레시 토큰 오류 응급 해결 시작');

  function clearAuthStorage() {
    if (typeof window === 'undefined') {
      console.error('브라우저 환경에서만 실행 가능합니다.');
      return false;
    }

    try {
      // 1. localStorage 정리
      console.log('🧹 localStorage 정리 중...');
      const authKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('sb-') ||
          key.includes('refresh') ||
          key.includes('token')
        )) {
          authKeys.push(key);
        }
      }
      
      authKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
          console.log(`✅ 제거됨: ${key}`);
        } catch (e) {
          console.warn(`⚠️ 제거 실패: ${key}`, e);
        }
      });

      // 2. sessionStorage 정리
      console.log('🧹 sessionStorage 정리 중...');
      const sessionKeys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (
          key.includes('auth') || 
          key.includes('redirect') || 
          key.includes('supabase')
        )) {
          sessionKeys.push(key);
        }
      }
      
      sessionKeys.forEach(key => {
        try {
          sessionStorage.removeItem(key);
          console.log(`✅ 세션 제거됨: ${key}`);
        } catch (e) {
          console.warn(`⚠️ 세션 제거 실패: ${key}`, e);
        }
      });

      // 3. 쿠키 정리
      console.log('🧹 쿠키 정리 중...');
      document.cookie.split(';').forEach(cookie => {
        const cookieName = cookie.trim().split('=')[0];
        if (cookieName && (
          cookieName.includes('auth') || 
          cookieName.includes('supabase') ||
          cookieName.includes('sb-') ||
          cookieName.includes('refresh') ||
          cookieName.includes('token')
        )) {
          try {
            // 여러 경로/도메인에서 제거
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`;
            console.log(`✅ 쿠키 제거됨: ${cookieName}`);
          } catch (e) {
            console.warn(`⚠️ 쿠키 제거 실패: ${cookieName}`, e);
          }
        }
      });

      console.log('✅ [Emergency Fix] 스토리지 정리 완료');
      return true;
    } catch (error) {
      console.error('❌ [Emergency Fix] 스토리지 정리 실패:', error);
      return false;
    }
  }

  function resetSupabaseClient() {
    try {
      // 전역 Supabase 클라이언트 변수 정리
      if (window.__supabase_client) {
        delete window.__supabase_client;
      }
      
      // 캐시된 클라이언트 정리
      if (window.browserSupabase) {
        delete window.browserSupabase;
      }
      
      console.log('✅ [Emergency Fix] Supabase 클라이언트 리셋 완료');
      return true;
    } catch (error) {
      console.warn('⚠️ [Emergency Fix] 클라이언트 리셋 실패:', error);
      return false;
    }
  }

  // 메인 실행 함수
  function emergencyFix() {
    console.log('🔧 [Emergency Fix] 응급 복구 시작');
    
    const storageCleared = clearAuthStorage();
    const clientReset = resetSupabaseClient();
    
    if (storageCleared || clientReset) {
      console.log('✅ [Emergency Fix] 복구 완료! 페이지를 새로고침합니다.');
      
      // 사용자에게 알림
      if (confirm('인증 상태가 리셋되었습니다. 페이지를 새로고침하시겠습니까?')) {
        window.location.reload();
      }
    } else {
      console.error('❌ [Emergency Fix] 복구 실패');
      alert('응급 복구에 실패했습니다. 브라우저를 완전히 재시작해주세요.');
    }
  }

  // 즉시 실행
  emergencyFix();

  // 전역 함수로도 등록
  window.emergencyAuthFix = emergencyFix;
  window.clearAuthStorage = clearAuthStorage;
  
  console.log('🔧 [Emergency Fix] 응급 함수들이 window.emergencyAuthFix, window.clearAuthStorage로 등록되었습니다.');
})(); 