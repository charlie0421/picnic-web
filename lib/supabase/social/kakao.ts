/**
 * Kakao 소셜 로그인 구현
 * 
 * 이 파일은 Kakao OAuth를 통한 인증 구현을 담당합니다.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { 
  SocialAuthOptions, 
  AuthResult,
  OAuthProviderConfig,
  SocialAuthError,
  SocialAuthErrorCode
} from './types';

/**
 * Kakao OAuth 설정
 */
export function getKakaoConfig(): OAuthProviderConfig {
  return {
    clientId: process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID || '',
    clientSecretEnvKey: 'KAKAO_CLIENT_SECRET',
    defaultScopes: [
      'account_email',
      'profile_image', 
      'profile_nickname'
    ],
    additionalConfig: {
      // Kakao 특화 설정
      prompt: 'login consent',
      // Kakao JavaScript SDK 앱 키 (웹용)
      jsAppKey: process.env.NEXT_PUBLIC_KAKAO_JS_APP_KEY || process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID || '',
      // Kakao REST API 키 (서버용)
      restApiKey: process.env.KAKAO_REST_API_KEY || '',
      // 로그인 성공 시 자동 연결 여부
      autoConnect: true
    }
  };
}

/**
 * 로컬 개발 환경 감지
 */
function isLocalDevelopment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
}

/**
 * Kakao 로그인 구현
 * 
 * @param supabase Supabase 클라이언트
 * @param options 인증 옵션
 * @returns 인증 결과
 */
export async function signInWithKakaoImpl(
  supabase: SupabaseClient<Database>,
  options?: SocialAuthOptions
): Promise<AuthResult> {
  try {
    // 설정값 준비
    const config = getKakaoConfig();
    const scopes = options?.scopes || config.defaultScopes;
    
    // 로컬 스토리지에 리다이렉트 URL 저장 (콜백 후 되돌아올 위치)
    if (typeof localStorage !== 'undefined') {
      const returnUrl = options?.additionalParams?.return_url || window.location.pathname;
      localStorage.setItem('auth_return_url', returnUrl);
    }
    
    // Kakao 특화 파라미터
    const kakaoParams: Record<string, string> = {
      prompt: (config.additionalConfig as any)?.prompt || 'login consent',
      ...options?.additionalParams
    };
    
    // service_terms가 존재하는 경우에만 추가
    if (options?.additionalParams?.service_terms) {
      kakaoParams.service_terms = options.additionalParams.service_terms;
    }
    
    // 중복 제거된 고유 scope 생성 및 디버깅
    const uniqueScopes = Array.from(new Set(scopes));
    const finalScopeString = uniqueScopes.join(' ');
    
    // 로컬/프로덕션 환경 감지
    const isLocal = isLocalDevelopment();
    const redirectUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/auth/callback/kakao`
      : options?.redirectUrl;
    
    // 디버깅: 환경 및 OAuth 설정 확인
    console.log('🔍 Kakao OAuth Debug:', {
      isLocal,
      redirectUrl,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      originalScopes: scopes,
      uniqueScopes: uniqueScopes,
      finalScopeString: finalScopeString
    });
    
    if (isLocal) {
      // 🚫 로컬 환경: 카카오 로그인 비활성화
      console.warn('⚠️ 로컬 개발 환경에서는 카카오 로그인을 지원하지 않습니다.');
      
      throw new SocialAuthError(
        SocialAuthErrorCode.AUTH_PROCESS_FAILED,
        '로컬 개발 환경에서는 카카오 로그인을 사용할 수 없습니다. 프로덕션 환경에서 테스트해주세요.',
        'kakao'
      );
      
    } else {
      // 🌐 프로덕션 환경: www.picnic.fan을 사용한 직접 OAuth
      const clientId = config.clientId;
      if (!clientId) {
        throw new Error('Kakao Client ID가 설정되지 않았습니다.');
      }
      
      // 프로덕션에서는 www.picnic.fan 콜백 사용
      const prodRedirectUrl = 'https://www.picnic.fan/auth/callback/kakao';
      
      const kakaoOAuthUrl = new URL('https://kauth.kakao.com/oauth/authorize');
      kakaoOAuthUrl.searchParams.set('client_id', clientId);
      kakaoOAuthUrl.searchParams.set('redirect_uri', prodRedirectUrl);
      kakaoOAuthUrl.searchParams.set('response_type', 'code');
      kakaoOAuthUrl.searchParams.set('scope', finalScopeString);
      
      // Kakao 특화 파라미터 추가
      Object.entries(kakaoParams).forEach(([key, value]) => {
        kakaoOAuthUrl.searchParams.set(key, value);
      });
      
      console.log('🚀 프로덕션 환경: www.picnic.fan으로 직접 Kakao OAuth 리디렉션', {
        url: kakaoOAuthUrl.toString(),
        redirectUri: prodRedirectUrl
      });
      
      // 직접 리디렉션 (Supabase 우회하여 api.picnic.fan 콜백 제거)
      window.location.href = kakaoOAuthUrl.toString();
      
      return {
        success: true,
        provider: 'kakao',
        message: 'Kakao 로그인 리디렉션 중... (프로덕션 모드)'
      };
    }
    
  } catch (error) {
    if (error instanceof SocialAuthError) {
      throw error;
    }
    
    throw new SocialAuthError(
      SocialAuthErrorCode.AUTH_PROCESS_FAILED,
      error instanceof Error ? error.message : '알 수 없는 Kakao 로그인 오류',
      'kakao',
      error
    );
  }
}

/**
 * Kakao 프로필 정보 정규화
 * 
 * @param profile Kakao API에서 반환된 프로필 정보
 * @returns 표준화된 사용자 프로필 정보
 */
export function normalizeKakaoProfile(profile: any): Record<string, any> {
  // Kakao 프로필 정보는 주로 properties와 kakao_account 객체에 포함되어 있음
  const kakaoAccount = profile.kakao_account || {};
  const properties = profile.properties || {};
  
  return {
    id: profile.id?.toString() || '',
    name: properties.nickname || '',
    email: kakaoAccount.email || '',
    emailVerified: kakaoAccount.is_email_verified || false,
    avatar: properties.profile_image || properties.thumbnail_image || '',
    gender: kakaoAccount.gender || null,
    birthday: kakaoAccount.birthday || null,
    ageRange: kakaoAccount.age_range || null,
    provider: 'kakao',
    rawProfile: {
      nickname: properties.nickname,
      profileImage: properties.profile_image,
      thumbnailImage: properties.thumbnail_image
    }
  };
}

/**
 * 액세스 토큰으로 Kakao 사용자 정보 가져오기
 * (서버 측에서 사용하는 함수)
 * 
 * @param accessToken Kakao 액세스 토큰
 * @returns Kakao 사용자 프로필 정보
 */
export async function getKakaoUserInfo(accessToken: string): Promise<Record<string, any>> {
  try {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Kakao API 요청 실패: ${response.status} ${response.statusText}`);
    }
    
    const userData = await response.json();
    return userData;
  } catch (error) {
    console.error('Kakao 사용자 정보 가져오기 실패:', error);
    throw new SocialAuthError(
      SocialAuthErrorCode.PROFILE_FETCH_FAILED,
      '카카오 사용자 정보를 가져오는데 실패했습니다.',
      'kakao',
      error
    );
  }
}

/**
 * Kakao 액세스 토큰 갱신
 * (서버 측에서 사용하는 함수)
 * 
 * @param refreshToken Kakao 리프레시 토큰
 * @returns 새로운 토큰 정보
 */
export async function refreshKakaoToken(refreshToken: string): Promise<Record<string, any>> {
  try {
    const config = getKakaoConfig();
    const clientId = config.clientId;
    
    if (!clientId) {
      throw new Error('Kakao Client ID가 설정되지 않았습니다.');
    }
    
    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken
      })
    });
    
    if (!response.ok) {
      throw new Error(`토큰 갱신 실패: ${response.status} ${response.statusText}`);
    }
    
    const tokenData = await response.json();
    return tokenData;
  } catch (error) {
    console.error('Kakao 토큰 갱신 실패:', error);
    throw new SocialAuthError(
      SocialAuthErrorCode.TOKEN_REFRESH_FAILED, 
      '카카오 토큰 갱신에 실패했습니다.',
      'kakao',
      error
    );
  }
} 