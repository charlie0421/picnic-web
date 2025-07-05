'use client';

// 통합된 AuthProvider에서 내보내는 useAuth 훅을 다시 내보냅니다.
export { useAuth } from '@/lib/supabase/auth-provider';

// 이 파일은 뒤 호환성을 위해 사용됩니다.
// VoteDetailContent.tsx와 같은 컴포넌트가 이 경로에서 useAuth를 가져오기 때문에 보존합니다.

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// 성능 진단을 위한 직접적인 getSession 테스트 함수
export async function testGetSessionPerformance() {
  console.log('🧪 [Performance Test] getSession 성능 테스트 시작');
  
  const supabase = createBrowserSupabaseClient();
  const testResults = {
    attempts: 3,
    results: [] as Array<{
      attempt: number;
      duration: number;
      success: boolean;
      error?: string;
    }>,
    average: 0,
    fastest: 0,
    slowest: 0
  };

  for (let i = 1; i <= testResults.attempts; i++) {
    const startTime = performance.now();
    
    try {
      console.log(`🏃 [Performance Test] 시도 ${i}/${testResults.attempts} 시작`);
      
      const result = await supabase.auth.getSession();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      testResults.results.push({
        attempt: i,
        duration,
        success: !result.error && !!result.data,
        error: result.error?.message
      });
      
      console.log(`✅ [Performance Test] 시도 ${i} 완료: ${duration.toFixed(2)}ms`);
      
      // 시도 간 간격
      if (i < testResults.attempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      testResults.results.push({
        attempt: i,
        duration,
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      });
      
      console.log(`❌ [Performance Test] 시도 ${i} 실패: ${duration.toFixed(2)}ms - ${error}`);
    }
  }

  // 결과 분석
  const durations = testResults.results.map(r => r.duration);
  testResults.average = durations.reduce((a, b) => a + b, 0) / durations.length;
  testResults.fastest = Math.min(...durations);
  testResults.slowest = Math.max(...durations);
  
  console.log('📊 [Performance Test] 최종 결과:');
  console.table(testResults.results);
  console.log(`⚡ 평균: ${testResults.average.toFixed(2)}ms`);
  console.log(`🏆 최고 속도: ${testResults.fastest.toFixed(2)}ms`);
  console.log(`🐌 최저 속도: ${testResults.slowest.toFixed(2)}ms`);
  
  return testResults;
}

// 브라우저 환경에서 전역 함수로 등록
if (typeof window !== 'undefined') {
  (window as any).testSupabasePerformance = testGetSessionPerformance;
  console.log('🛠️ [useAuth] testSupabasePerformance 함수가 전역으로 등록되었습니다. 브라우저 콘솔에서 testSupabasePerformance() 호출 가능');
}

// 🚨 무한대기 근본 원인 진단 전용 함수 🚨
export async function diagnoseSupabaseInfiniteWait() {
  console.log('🚨 [진단] Supabase 무한대기 근본 원인 종합 분석 시작');
  
  // 1. 기본 환경 검증
  const diagnostics = {
    environment: {
      nodeEnv: process.env.NODE_ENV,
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      windowDefined: typeof window !== 'undefined',
      navigatorOnline: typeof navigator !== 'undefined' ? navigator.onLine : null
    },
    network: {
      directFetchWorks: false,
      authApiWorks: false,
      sessionApiWorks: false
    },
    supabaseClient: {
      canCreate: false,
      canGetSession: false,
      canExchangeCode: false
    }
  };
  
  // 2. 직접 네트워크 테스트 (Supabase 클라이언트 없이)
  console.log('🌐 [진단] 1단계: 직접 네트워크 연결 테스트');
  
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (url && key) {
    try {
      // REST API 테스트
      console.log('🔗 [진단] REST API 직접 테스트...');
      const restResponse = await Promise.race([
        fetch(`${url}/rest/v1/`, {
          headers: { 'apikey': key }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('REST API timeout')), 3000))
      ]);
      
      diagnostics.network.directFetchWorks = (restResponse as Response).ok;
      console.log(`✅ [진단] REST API 응답:`, {
        status: (restResponse as Response).status,
        ok: (restResponse as Response).ok
      });
      
    } catch (e) {
      console.error('❌ [진단] REST API 실패:', e);
    }
    
    try {
      // Auth API 테스트
      console.log('🔐 [진단] Auth API 직접 테스트...');
      const authResponse = await Promise.race([
        fetch(`${url}/auth/v1/user`, {
          headers: { 'apikey': key }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Auth API timeout')), 3000))
      ]);
      
      diagnostics.network.authApiWorks = (authResponse as Response).status < 500;
      console.log(`✅ [진단] Auth API 응답:`, {
        status: (authResponse as Response).status,
        statusText: (authResponse as Response).statusText
      });
      
    } catch (e) {
      console.error('❌ [진단] Auth API 실패:', e);
    }
  }
  
  // 3. Supabase 클라이언트 생성 테스트
  console.log('🏗️ [진단] 2단계: Supabase 클라이언트 생성 테스트');
  
  try {
    const supabase = createBrowserSupabaseClient();
    diagnostics.supabaseClient.canCreate = true;
    console.log('✅ [진단] Supabase 클라이언트 생성 성공');
    
    // 4. getSession 상세 모니터링
    console.log('🔍 [진단] 3단계: getSession 내부 동작 모니터링');
    
    const sessionStartTime = performance.now();
    let sessionCompleted = false;
    
    // 진행 상황 모니터링
    const progressMonitor = setInterval(() => {
      if (!sessionCompleted) {
        const elapsed = performance.now() - sessionStartTime;
        console.log(`⏳ [진단] getSession 진행 중... ${elapsed.toFixed(0)}ms 경과`);
      }
    }, 1000);
    
    try {
      const sessionPromise = supabase.auth.getSession();
      
      // 상세 타임아웃으로 모니터링
      const sessionResult = await Promise.race([
        sessionPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession 5초 타임아웃')), 5000)
        )
      ]);
      
      sessionCompleted = true;
      clearInterval(progressMonitor);
      
      const sessionEndTime = performance.now();
      console.log('✅ [진단] getSession 완료:', {
        duration: `${(sessionEndTime - sessionStartTime).toFixed(2)}ms`,
        hasData: !!(sessionResult as any)?.data,
        hasSession: !!(sessionResult as any)?.data?.session,
        hasError: !!(sessionResult as any)?.error
      });
      
      diagnostics.supabaseClient.canGetSession = true;
      
    } catch (sessionError) {
      sessionCompleted = true;
      clearInterval(progressMonitor);
      
      const sessionEndTime = performance.now();
      console.error('❌ [진단] getSession 실패:', {
        duration: `${(sessionEndTime - sessionStartTime).toFixed(2)}ms`,
        error: (sessionError as Error).message
      });
    }
    
    // 5. exchangeCodeForSession 테스트 (더미 코드로)
    console.log('🔄 [진단] 4단계: exchangeCodeForSession 테스트');
    
    const exchangeStartTime = performance.now();
    let exchangeCompleted = false;
    
    const exchangeMonitor = setInterval(() => {
      if (!exchangeCompleted) {
        const elapsed = performance.now() - exchangeStartTime;
        console.log(`⏳ [진단] exchangeCodeForSession 진행 중... ${elapsed.toFixed(0)}ms 경과`);
      }
    }, 1000);
    
    try {
      // 더미 코드로 테스트 (실제로는 실패하겠지만 무한대기 여부 확인)
      const exchangePromise = supabase.auth.exchangeCodeForSession('dummy-code-for-testing');
      
      const exchangeResult = await Promise.race([
        exchangePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('exchangeCodeForSession 5초 타임아웃')), 5000)
        )
      ]);
      
      exchangeCompleted = true;
      clearInterval(exchangeMonitor);
      
      const exchangeEndTime = performance.now();
      console.log('✅ [진단] exchangeCodeForSession 응답 받음:', {
        duration: `${(exchangeEndTime - exchangeStartTime).toFixed(2)}ms`,
        hasData: !!(exchangeResult as any)?.data,
        hasError: !!(exchangeResult as any)?.error
      });
      
      diagnostics.supabaseClient.canExchangeCode = true;
      
    } catch (exchangeError) {
      exchangeCompleted = true;
      clearInterval(exchangeMonitor);
      
      const exchangeEndTime = performance.now();
      console.log('📊 [진단] exchangeCodeForSession 결과:', {
        duration: `${(exchangeEndTime - exchangeStartTime).toFixed(2)}ms`,
        error: (exchangeError as Error).message,
        isTimeout: (exchangeError as Error).message.includes('타임아웃')
      });
    }
    
  } catch (clientError) {
    console.error('❌ [진단] Supabase 클라이언트 생성 실패:', clientError);
  }
  
  // 6. 최종 진단 결과
  console.log('📋 [진단] 최종 분석 결과:', diagnostics);
  
  // 7. 추천 해결책
  console.log('💡 [진단] 추천 해결책:');
  
  if (!diagnostics.network.directFetchWorks) {
    console.log('🔴 네트워크 연결 문제: Supabase 서버에 연결할 수 없습니다.');
    console.log('   - 인터넷 연결 확인');
    console.log('   - VPN 또는 방화벽 설정 확인');
    console.log('   - Supabase 프로젝트 상태 확인');
  }
  
  if (!diagnostics.network.authApiWorks) {
    console.log('🔴 Auth API 문제: 인증 서버에 연결할 수 없습니다.');
    console.log('   - Supabase 프로젝트 설정 확인');
    console.log('   - API 키 유효성 확인');
  }
  
  if (!diagnostics.supabaseClient.canGetSession && diagnostics.network.authApiWorks) {
    console.log('🔴 getSession 내부 문제: Auth API는 작동하지만 getSession이 무응답');
    console.log('   - Supabase 클라이언트 설정 문제 가능성');
    console.log('   - 브라우저 호환성 문제 가능성');
  }
  
  return diagnostics;
}

// 전역 등록
if (typeof window !== 'undefined') {
  (window as any).testSupabasePerformance = testGetSessionPerformance;
  (window as any).diagnoseSupabaseInfiniteWait = diagnoseSupabaseInfiniteWait;
  console.log('🛠️ [useAuth] 진단 함수들이 전역으로 등록되었습니다:');
  console.log('  - testSupabasePerformance() : 성능 테스트');
  console.log('  - diagnoseSupabaseInfiniteWait() : 무한대기 근본 원인 분석');
}
