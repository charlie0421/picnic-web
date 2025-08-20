/**
 * WeChat OAuth 인증 및 프로필 관련 기능
 * 
 * 이 파일은 WeChat 소셜 로그인을 구현하는 함수들을 제공합니다.
 */

import { Provider, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { 
  SocialAuthOptions, 
  AuthResult, 
  NormalizedProfile,
  SocialAuthError,
  SocialAuthErrorCode,
  LogFunction,
  OAuthProviderConfig
} from './types';

/**
 * WeChat OAuth 구성 정보 반환
 * 
 * @returns WeChat 인증에 필요한 설정 값
 */
export function getWeChatConfig(): OAuthProviderConfig {
  return {
    clientId: process.env.NEXT_PUBLIC_WECHAT_APP_ID || "",
    clientSecretEnvKey: "WECHAT_APP_SECRET",
    defaultScopes: [
      "snsapi_login", // 웹사이트 애플리케이션 로그인 권한
    ],
    additionalConfig: {
      // WeChat 특화 설정
      responseType: "code",
      state: generateStateToken(), // 동적으로 생성되는 CSRF 보호 토큰
      // WeChat은 중국 본토와 해외 버전이 다름
      isOverseas: process.env.WECHAT_OVERSEAS === "true", // 해외 버전 사용 여부
    },
  };
}

/**
 * WeChat 환경 확인 헬퍼 함수
 * 
 * @returns 현재 브라우저가 WeChat 내부 브라우저인지 여부
 */
export function isWeChatBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /micromessenger/.test(userAgent);
}

/**
 * WeChat 지원 여부 확인
 * 
 * @returns WeChat 로그인이 현재 환경에서 지원되는지 여부
 */
export function isWeChatSupported(): boolean {
  // 클라이언트와 서버에서의 환경변수 가시성이 다름
  // - 클라이언트: NEXT_PUBLIC_* 만 접근 가능 → 앱ID만 체크
  // - 서버: 시크릿까지 체크 가능

  console.log("🔍 isWeChatSupported 함수 시작");
  console.log("🔍 process.env.NEXT_PUBLIC_WECHAT_APP_ID:", process.env.NEXT_PUBLIC_WECHAT_APP_ID);
  console.log("🔍 process.env.WECHAT_APP_SECRET:", process.env.WECHAT_APP_SECRET);
  console.log("🔍 process.env.WECHAT_OVERSEAS:", process.env.WECHAT_OVERSEAS);
  console.log("🔍 process.env.NODE_ENV:", process.env.NODE_ENV);
  console.log("🔍 process.env.NEXT_PUBLIC_SITE_URL:", process.env.NEXT_PUBLIC_SITE_URL);
  console.log("🔍 process.env.NEXT_PUBLIC_WECHAT_APP_ID:", process.env.NEXT_PUBLIC_WECHAT_APP_ID);

  if (typeof window !== 'undefined') {
    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    return !!appId;
  }
  const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  return !!(appId && appSecret);
}

/**
 * 암호학적으로 안전한 상태 토큰 생성
 * CSRF 공격 방지를 위한 고유한 상태 토큰 생성
 * 
 * @returns 고유한 상태 토큰
 */
function generateStateToken(): string {
  const randomBytes = new Uint8Array(32);
  
  // crypto.getRandomValues 사용 (브라우저 환경)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } 
  // Node.js 환경의 crypto 모듈 사용
  else if (typeof require !== 'undefined') {
    try {
      const crypto = require('crypto');
      const nodeRandomBytes = crypto.randomBytes(32);
      for (let i = 0; i < 32; i++) {
        randomBytes[i] = nodeRandomBytes[i];
      }
    } catch (e) {
      console.warn('⚠️ Node.js crypto 모듈을 사용할 수 없습니다. Math.random()을 사용합니다.');
      // 폴백: Math.random() 사용
      for (let i = 0; i < randomBytes.length; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
    }
  } else {
    // 폴백: Math.random() 사용 (덜 안전하지만 작동함)
    console.warn('⚠️ 암호학적으로 안전한 난수 생성기를 사용할 수 없습니다. Math.random()을 사용합니다.');
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  
  // 타임스탬프와 프로세스 정보 추가로 고유성 보장
  const timestamp = Date.now().toString(16);
  const processInfo = typeof process !== 'undefined' && process.pid 
    ? process.pid.toString(16) 
    : Math.floor(Math.random() * 65536).toString(16);
  const randomHex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // 더 긴 토큰으로 충돌 가능성 최소화
  const token = `wechat_${timestamp}_${processInfo}_${randomHex}`;
  
  console.log('🔐 새 WeChat 상태 토큰 생성됨:', token.substring(0, 30) + '...');
  
  return token;
}

/**
 * 상태 토큰 저장 (CSRF 보호용)
 * 
 * @param state 저장할 상태 토큰
 */
function saveStateToken(state: string): void {
  if (typeof sessionStorage !== 'undefined') {
    // 이전 상태 토큰 제거
    sessionStorage.removeItem('wechat_auth_state');
    sessionStorage.removeItem('wechat_auth_timestamp');
    
    // 새 상태 토큰과 타임스탬프 저장
    sessionStorage.setItem('wechat_auth_state', state);
    sessionStorage.setItem('wechat_auth_timestamp', Date.now().toString());
    
    console.log('🔐 WeChat 상태 토큰 저장됨');
  }
}

/**
 * 상태 토큰 검증 (CSRF 보호)
 * 
 * @param receivedState 받은 상태 토큰
 * @returns 검증 결과
 */
function validateStateToken(receivedState: string): { valid: boolean; error?: string } {
  console.log('🔍 WeChat 상태 토큰 검증 시작:', {
    received: receivedState ? receivedState.substring(0, 30) + '...' : 'null',
    hasSessionStorage: typeof sessionStorage !== 'undefined'
  });
  
  if (typeof sessionStorage === 'undefined') {
    console.warn('⚠️ sessionStorage를 사용할 수 없어 상태 토큰 검증을 건너뜁니다.');
    return { valid: true };
  }
  
  const savedState = sessionStorage.getItem('wechat_auth_state');
  const savedTimestamp = sessionStorage.getItem('wechat_auth_timestamp');
  
  console.log('🔍 저장된 상태 토큰 정보:', {
    saved: savedState ? savedState.substring(0, 30) + '...' : 'null',
    timestamp: savedTimestamp,
    timestampAge: savedTimestamp ? Date.now() - parseInt(savedTimestamp, 10) : 'N/A'
  });
  
  // 저장된 상태 토큰이 없는 경우
  if (!savedState) {
    console.error('❌ 저장된 WeChat 상태 토큰이 없습니다.');
    return { 
      valid: false, 
      error: '저장된 상태 토큰이 없습니다. 인증 프로세스를 다시 시작해주세요.' 
    };
  }
  
  // 상태 토큰이 일치하지 않는 경우
  if (receivedState !== savedState) {
    console.error('❌ WeChat 상태 토큰 불일치:', {
      received: receivedState ? receivedState.substring(0, 30) + '...' : 'null',
      saved: savedState.substring(0, 30) + '...'
    });
    return { 
      valid: false, 
      error: 'CSRF 보안 오류: 상태 토큰이 일치하지 않습니다.' 
    };
  }
  
  // 타임스탬프 검증 (15분 제한으로 연장)
  if (savedTimestamp) {
    const timestamp = parseInt(savedTimestamp, 10);
    const now = Date.now();
    const maxAge = 15 * 60 * 1000; // 15분으로 연장
    const age = now - timestamp;
    
    if (age > maxAge) {
      console.error('❌ WeChat 인증 세션 만료:', {
        age: Math.floor(age / 1000) + '초',
        maxAge: Math.floor(maxAge / 1000) + '초'
      });
      return { 
        valid: false, 
        error: '인증 세션이 만료되었습니다. 다시 로그인해주세요.' 
      };
    }
    
    console.log('✅ WeChat 상태 토큰 타임스탬프 검증 통과:', {
      age: Math.floor(age / 1000) + '초'
    });
  }
  
  console.log('✅ WeChat 상태 토큰 검증 성공');
  return { valid: true };
}

/**
 * 상태 토큰 정리
 */
function clearStateToken(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('wechat_auth_state');
    sessionStorage.removeItem('wechat_auth_timestamp');
    console.log('🧹 WeChat 상태 토큰 정리됨');
  }
}

/**
 * WeChat 프로필 정보 정규화
 * 
 * @param profile WeChat에서 반환한 사용자 정보
 * @returns 정규화된 프로필 객체
 */
export function normalizeWeChatProfile(profile: any): NormalizedProfile {
  if (!profile) {
    throw new SocialAuthError(
      SocialAuthErrorCode.PROFILE_FETCH_FAILED,
      'WeChat 프로필 정보가 없습니다.',
      'wechat'
    );
  }
  
  // 필수 필드 검증
  if (!profile.openid) {
    throw new SocialAuthError(
      SocialAuthErrorCode.PROFILE_FETCH_FAILED,
      'WeChat OpenID가 없습니다.',
      'wechat'
    );
  }
  
  // WeChat API 응답 구조:
  // {
  //   openid: string; (사용자의 WeChat 고유 ID)
  //   nickname: string; (표시 이름)
  //   sex: number; (1: 남성, 2: 여성, 0: 미설정)
  //   province: string; (지역/도)
  //   city: string; (도시)
  //   country: string; (국가)
  //   headimgurl: string; (프로필 이미지 URL, 132px 크기)
  //   privilege: string[]; (권한 목록)
  //   unionid: string; (옵션, 다중 앱 간 사용자 식별자)
  // }
  
  const normalizedProfile: NormalizedProfile = {
    id: profile.openid || profile.unionid || '',
    name: profile.nickname || '',
    email: '', // WeChat은 기본적으로 이메일을 제공하지 않음
    avatar: profile.headimgurl || '',
    raw: profile
  };
  
  // 데이터 검증 및 정제
  if (normalizedProfile.name) {
    // 닉네임 길이 제한 (데이터베이스 제약 고려)
    normalizedProfile.name = normalizedProfile.name.substring(0, 100);
  }
  
  if (normalizedProfile.avatar) {
    // 프로필 이미지 URL 검증
    try {
      new URL(normalizedProfile.avatar);
    } catch {
      console.warn('⚠️ 유효하지 않은 WeChat 프로필 이미지 URL:', normalizedProfile.avatar);
      normalizedProfile.avatar = '';
    }
  }
  
  // unionid가 있으면 추가 (다중 앱 환경에 유용)
  if (profile.unionid && profile.openid !== profile.unionid) {
    normalizedProfile.additionalInfo = {
      ...normalizedProfile.additionalInfo,
      unionId: profile.unionid,
      openId: profile.openid
    };
  }
  
  // 성별 정보 추가
  if (profile.sex !== undefined) {
    normalizedProfile.additionalInfo = {
      ...normalizedProfile.additionalInfo,
      gender: profile.sex === 1 ? 'male' : profile.sex === 2 ? 'female' : 'unknown'
    };
  }
  
  // 지역 정보 추가
  if (profile.country || profile.province || profile.city) {
    const location = [profile.country, profile.province, profile.city]
      .filter(Boolean)
      .join(', ');
    
    normalizedProfile.additionalInfo = {
      ...normalizedProfile.additionalInfo,
      location
    };
  }
  
  return normalizedProfile;
}

/**
 * WeChat 로그인 처리 구현
 * 
 * @param supabase Supabase 클라이언트
 * @param options 인증 옵션
 * @returns 인증 결과
 */
export async function signInWithWeChatImpl(
  supabase: SupabaseClient<Database>,
  options?: SocialAuthOptions
): Promise<AuthResult> {
  try {
    console.log("🔍 signInWithWeChatImpl 함수 시작");

    // WeChat 지원 여부 확인
    if (!isWeChatSupported()) {
      throw new SocialAuthError(
        SocialAuthErrorCode.PROVIDER_NOT_AVAILABLE,
        'WeChat 로그인이 설정되지 않았습니다. 관리자에게 문의하세요.',
        'wechat'
      );
    }

    // 설정값 준비
    const config = getWeChatConfig();
    console.log("🔍 WeChat 설정 로드 완료");

    // 상태 토큰 생성 및 저장
    const stateToken = generateStateToken();
    saveStateToken(stateToken);

    // 리다이렉트 URL 결정 (환경변수 우선 사용)
    let redirectUrl = options?.redirectUrl;
    if (!redirectUrl) {
      // 개발 환경에서는 환경변수 또는 localhost 사용
      if (process.env.NODE_ENV === "development") {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
        if (siteUrl) {
          redirectUrl = `${siteUrl}/auth/callback/wechat`;
        } else if (typeof window !== "undefined") {
          // 환경변수가 없으면 현재 origin 사용
          redirectUrl = `${window.location.origin}/auth/callback/wechat`;
        } else {
          redirectUrl = "http://localhost:3100/auth/callback/wechat";
        }
      } else {
        // 프로덕션 환경
        if (typeof window !== "undefined") {
          redirectUrl = `${window.location.origin}/auth/callback/wechat`;
        } else {
          redirectUrl = "https://www.picnic.fan/auth/callback/wechat";
        }
      }
    }

    const scopes = options?.scopes || config.defaultScopes;

    console.log("🔍 WeChat OAuth 시작:", {
      redirectUrl,
      nodeEnv: process.env.NODE_ENV,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      currentOrigin: typeof window !== "undefined"
        ? window.location.origin
        : "server",
      stateToken: stateToken.substring(0, 20) + '...' // 보안상 일부만 로그
    });

    // 로컬 스토리지에 리다이렉트 URL 저장 (콜백 후 되돌아올 위치)
    let chosenForReturn: string | undefined;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const queryReturnTo = urlParams.get('returnTo') || undefined;
      const suppliedReturn = options?.additionalParams?.return_url;
      chosenForReturn = suppliedReturn || queryReturnTo || window.location.pathname;
      try { localStorage.setItem("auth_return_url", chosenForReturn); } catch {}
      console.log("🔍 로컬 스토리지에 return_url 저장:", chosenForReturn);
    }

    // WeChat 특화 추가 파라미터
    const wechatParams = {
      response_type: (config.additionalConfig as any)?.responseType || "code",
      state: stateToken, // 동적으로 생성된 상태 토큰 사용
      ...options?.additionalParams,
    };

    console.log("🔍 WeChat OAuth 파라미터 준비 완료");

    // Supabase는 WeChat provider를 공식 지원하지 않으므로 항상 커스텀 플로우 사용
    console.log("🔄 WeChat 커스텀 OAuth 플로우 사용 (Supabase OAuth 우회)");
    return await signInWithWeChatCustom(config, redirectUrl, scopes, wechatParams, chosenForReturn);
  } catch (error) {
    console.error("🔍 signInWithWeChatImpl 오류:", error);

    // 오류 발생 시 상태 토큰 정리
    clearStateToken();

    if (error instanceof SocialAuthError) {
      throw error;
    }

    throw new SocialAuthError(
      SocialAuthErrorCode.AUTH_PROCESS_FAILED,
      error instanceof Error ? error.message : "알 수 없는 WeChat 로그인 오류",
      "wechat",
      error,
    );
  }
}

/**
 * WeChat 커스텀 OAuth 플로우 구현
 * Supabase에서 WeChat을 지원하지 않는 경우 사용
 *
 * @param config WeChat 설정
 * @param redirectUrl 리다이렉트 URL
 * @param scopes 권한 범위
 * @param params 추가 파라미터
 * @returns 인증 결과
 */
async function signInWithWeChatCustom(
  config: OAuthProviderConfig,
  redirectUrl: string,
  scopes: string[],
  params: Record<string, string>,
  returnTo?: string,
): Promise<AuthResult> {
  try {
    // Website App은 브라우저에서 QRConnect를 사용해야 하며,
    // oauth2/authorize는 WeChat 인앱 브라우저(Official Account)에서만 동작
    // "请在微信客户端打开链接" 메시지를 피하기 위해 항상 QRConnect 사용
    const baseUrl = "https://open.weixin.qq.com/connect/qrconnect";

    const authUrl = new URL(baseUrl);
    authUrl.searchParams.set("appid", config.clientId);
    // URLSearchParams가 자체 인코딩하므로 사전 인코딩 금지
    authUrl.searchParams.set("redirect_uri", redirectUrl);
    authUrl.searchParams.set("response_type", params.response_type || "code");
    // QRConnect에서는 scope로 snsapi_login 사용
    const finalScope = scopes && scopes.length > 0 ? scopes.join(",") : "snsapi_login";
    authUrl.searchParams.set("scope", finalScope);
    authUrl.searchParams.set("state", params.state || "wechat_oauth_state");

    // 콜백에서 파라미터 전파를 위해 returnTo 부착
    if (returnTo) {
      const sep = redirectUrl.includes('?') ? '&' : '?';
      // redirect_uri 자체에 returnTo 부착
      const redirectWithReturn = `${redirectUrl}${sep}returnTo=${encodeURIComponent(returnTo)}`;
      authUrl.searchParams.set("redirect_uri", redirectWithReturn);
    }

    // 선택: QR 스타일 커스터마이즈 파라미터
    authUrl.searchParams.set("style", "black");

    // 문서 요구사항에 따라 해시 추가
    const finalUrl = `${authUrl.toString()}#wechat_redirect`;
    console.log("🔍 WeChat 커스텀 OAuth URL:", finalUrl);

    // 브라우저에서 WeChat OAuth 페이지로 리다이렉트
    if (typeof window !== "undefined") {
      window.location.href = finalUrl;
    }

    return {
      success: true,
      provider: "wechat",
      message: "WeChat 커스텀 OAuth 리다이렉션 중...",
    };
  } catch (error) {
    // 오류 발생 시 상태 토큰 정리
    clearStateToken();
    
    throw new SocialAuthError(
      SocialAuthErrorCode.AUTH_PROCESS_FAILED,
      error instanceof Error ? error.message : "WeChat 커스텀 OAuth 오류",
      "wechat",
      error,
    );
  }
}

/**
 * WeChat 로그인 콜백 처리
 * 
 * @param supabase Supabase 클라이언트
 * @param params URL 쿼리 파라미터
 * @returns 인증 결과
 */
export async function handleWeChatCallback(
  supabase: SupabaseClient<Database>,
  params: Record<string, string>
): Promise<AuthResult> {
  const config = getWeChatConfig();
  
  try {
    const { code, state, error } = params;
    
    console.log('🔍 WeChat 콜백 처리 시작:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      state: state ? state.substring(0, 20) + '...' : 'none' // 보안상 일부만 로그
    });
    
    // 에러 처리
    if (error) {
      clearStateToken();
      
      // WeChat 특화 오류 코드 처리
      const errorMessages: Record<string, string> = {
        'access_denied': '사용자가 WeChat 로그인을 거부했습니다.',
        'invalid_request': 'WeChat 로그인 요청이 유효하지 않습니다.',
        'unauthorized_client': 'WeChat 앱이 승인되지 않았습니다.',
        'unsupported_response_type': '지원되지 않는 응답 타입입니다.',
        'invalid_scope': '요청한 권한이 유효하지 않습니다.',
        'server_error': 'WeChat 서버 오류가 발생했습니다.',
        'temporarily_unavailable': 'WeChat 서비스가 일시적으로 사용할 수 없습니다.'
      };
      
      const errorMessage = errorMessages[error] || `WeChat 인증 오류: ${error}`;
      
      throw new SocialAuthError(
        SocialAuthErrorCode.AUTH_PROCESS_FAILED,
        errorMessage,
        'wechat'
      );
    }
    
    // 필수 파라미터 검증
    if (!code) {
      clearStateToken();
      throw new SocialAuthError(
        SocialAuthErrorCode.CALLBACK_FAILED,
        'WeChat 인증 코드가 없습니다.',
        'wechat'
      );
    }
    
    // 상태 토큰 검증 (CSRF 방지)
    if (state) {
      const validation = validateStateToken(state);
      if (!validation.valid) {
        clearStateToken();
        throw new SocialAuthError(
          SocialAuthErrorCode.INVALID_STATE,
          validation.error || '상태 토큰 검증 실패',
          'wechat'
        );
      }
    } else {
      console.warn('⚠️ WeChat 콜백에 상태 토큰이 없습니다.');
    }
    
    // 상태 토큰 정리 (검증 완료 후)
    clearStateToken();
    
    // 코드를 토큰으로 교환 (서버 측 구현 필요)
    // WeChat API는 서버 측 비밀키가 필요하므로 API 라우트 사용
    console.log('🔍 WeChat API 호출 시작');
    
    const tokenResponse = await fetch('/api/auth/wechat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code, state })
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ WeChat API 응답 오류:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errorText
      });
      
      throw new SocialAuthError(
        SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED,
        `WeChat 토큰 교환 실패 (${tokenResponse.status}): ${errorText}`,
        'wechat'
      );
    }
    
    let tokenData;
    try {
      tokenData = await tokenResponse.json();
    } catch (parseError) {
      console.error('❌ WeChat API 응답 파싱 오류:', parseError);
      throw new SocialAuthError(
        SocialAuthErrorCode.INVALID_RESPONSE,
        'WeChat API 응답을 파싱할 수 없습니다.',
        'wechat',
        parseError
      );
    }
    
    if (!tokenData.success) {
      console.error('❌ WeChat API 오류:', tokenData);
      throw new SocialAuthError(
        SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED,
        tokenData.error || 'WeChat 토큰 교환 실패',
        'wechat'
      );
    }
    
    // 프로필 정보가 있으면 바로 사용
    if (tokenData.profile) {
      console.log('✅ WeChat 프로필 정보 수신 완료');
      
      // Supabase로 이 정보로 사용자 생성 또는 업데이트
      // 주의: WeChat은 신원 정보가 이메일이 아닌 openid를 사용
      // 커스텀 API 구현이 필요할 수 있음
      
      // Supabase OAuth 호출 - WeChat은 공식 지원되지 않으므로 이메일/비밀번호 방식으로 처리
      // 실제 구현에서는 커스텀 인증 로직 필요
      // 아래는 임시 예시 코드
      const tempEmail = `wechat_${tokenData.profile.id}@placeholder.com`;
      const tempPassword = tokenData.tokens.id_token;
      
      console.log('🔍 Supabase 인증 시도');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: tempEmail,
        password: tempPassword
      });
      
      if (error) {
        // 사용자가 존재하지 않으면 생성
        if (error.message.includes('Invalid login credentials')) {
          console.log('ℹ️ 신규 WeChat 사용자 생성');
          
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: tempEmail,
            password: tempPassword,
            options: {
              data: {
                provider: 'wechat',
                provider_id: tokenData.profile.id,
                name: tokenData.profile.name,
                wechat_openid: tokenData.profile.id,
                avatar_url: tokenData.profile.avatar,
                email_verified: true // WeChat 인증으로 간주
              }
            }
          });
          
          if (signUpError) {
            console.error('❌ WeChat 사용자 등록 실패:', signUpError);
            throw new SocialAuthError(
              SocialAuthErrorCode.SESSION_CREATION_FAILED,
              `WeChat 사용자 등록 실패: ${signUpError.message}`,
              'wechat',
              signUpError
            );
          }
          
          console.log('✅ WeChat 신규 사용자 생성 완료');
          
          return {
            success: true,
            provider: 'wechat',
            message: 'WeChat 로그인 성공 (신규 사용자)',
            user: signUpData.user,
            session: signUpData.session
          };
        }
        
        console.error('❌ Supabase WeChat 로그인 실패:', error);
        throw new SocialAuthError(
          SocialAuthErrorCode.SESSION_CREATION_FAILED,
          `Supabase WeChat 로그인 실패: ${error.message}`,
          'wechat',
          error
        );
      }
      
      console.log('✅ WeChat 기존 사용자 로그인 완료');
      
      return {
        success: true,
        provider: 'wechat',
        message: 'WeChat 로그인 성공',
        user: data.user,
        session: data.session
      };
    }
    
    // 프로필 정보가 없으면 별도로 가져옴 (일반적으로는 API 응답에 포함됨)
    throw new SocialAuthError(
      SocialAuthErrorCode.PROFILE_FETCH_FAILED,
      'WeChat 프로필 정보를 가져오는데 실패했습니다.',
      'wechat'
    );
    
  } catch (error) {
    console.error('🔍 WeChat 콜백 처리 오류:', error);
    
    // 오류 발생 시 상태 토큰 정리
    clearStateToken();
    
    if (error instanceof SocialAuthError) {
      return {
        success: false,
        error,
        provider: 'wechat',
        message: error.message
      };
    }
    
    return {
      success: false,
      error: new SocialAuthError(
        SocialAuthErrorCode.CALLBACK_FAILED,
        error instanceof Error ? error.message : '알 수 없는 WeChat 콜백 처리 오류',
        'wechat',
        error
      ),
      provider: 'wechat'
    };
  }
}

/**
 * WeChat 액세스 토큰으로 사용자 정보 가져오기
 *
 * @param accessToken WeChat 액세스 토큰
 * @param openid WeChat OpenID
 * @returns 사용자 프로필 정보
 */
export async function getWeChatUserInfo(
  accessToken: string,
  openid: string,
): Promise<Record<string, any>> {
  try {
    if (!accessToken || !openid) {
      throw new SocialAuthError(
        SocialAuthErrorCode.INVALID_RESPONSE,
        'WeChat 액세스 토큰 또는 OpenID가 없습니다.',
        'wechat'
      );
    }
    
    const userInfoUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
    userInfoUrl.searchParams.set("access_token", accessToken);
    userInfoUrl.searchParams.set("openid", openid);
    userInfoUrl.searchParams.set("lang", "zh_CN");

    console.log('🔍 WeChat 사용자 정보 요청');

    const response = await fetch(userInfoUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WeChat-OAuth-Client/1.0'
      }
    });
    
    if (!response.ok) {
      throw new SocialAuthError(
        SocialAuthErrorCode.PROFILE_FETCH_FAILED,
        `WeChat API 요청 실패: ${response.status} ${response.statusText}`,
        'wechat'
      );
    }

    const userInfo = await response.json();

    if (userInfo.errcode) {
      // WeChat API 오류 코드 처리
      const errorMessages: Record<string, string> = {
        '40001': '액세스 토큰이 유효하지 않습니다.',
        '40003': 'OpenID가 유효하지 않습니다.',
        '42001': '액세스 토큰이 만료되었습니다.',
        '42003': '액세스 토큰이 갱신되어야 합니다.',
        '50001': '사용자가 인증을 취소했습니다.'
      };
      
      const errorMessage = errorMessages[userInfo.errcode] || 
        `WeChat API 오류: ${userInfo.errmsg} (${userInfo.errcode})`;
      
      throw new SocialAuthError(
        SocialAuthErrorCode.PROFILE_FETCH_FAILED,
        errorMessage,
        'wechat'
      );
    }

    console.log('✅ WeChat 사용자 정보 수신 완료');

    return normalizeWeChatProfile(userInfo);
  } catch (error) {
    console.error('❌ WeChat 사용자 정보 가져오기 실패:', error);
    
    if (error instanceof SocialAuthError) {
      throw error;
    }
    
    throw new SocialAuthError(
      SocialAuthErrorCode.PROFILE_FETCH_FAILED,
      error instanceof Error ? error.message : "WeChat 사용자 정보 가져오기 실패",
      "wechat",
      error,
    );
  }
} 