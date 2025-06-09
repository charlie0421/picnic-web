import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { normalizeKakaoProfile } from '@/lib/supabase/social/kakao';
import { SocialAuthError, SocialAuthErrorCode } from '@/lib/supabase/social/types';
import { 
  withApiErrorHandler, 
  apiHelpers,
  createValidationError,
  createExternalServiceError,
  createDatabaseError,
  safeApiOperation 
} from '@/utils/api-error-handler';
import { ErrorTransformer } from '@/utils/error';

/**
 * Kakao 토큰 및 사용자 정보 처리 API
 * 
 * 이 API는 Kakao OAuth 콜백으로부터 받은 코드를 사용하여
 * 액세스 토큰을 획득하고 사용자 정보를 가져오는 역할을 합니다.
 */
export const POST = withApiErrorHandler(async (request: NextRequest) => {
  const { data, error } = await safeApiOperation(async () => {
    const { code, accessToken } = await request.json();
    
    // 서버 측 Supabase 클라이언트 생성
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // 서비스 롤 키 사용 (주의: 서버 측에서만 사용)
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        }
      }
    );
    
    // Kakao API 설정
    const clientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    
    if (!clientId) {
      throw ErrorTransformer.fromLegacySocialAuthError(
        SocialAuthErrorCode.INITIALIZATION_FAILED,
        'Kakao 클라이언트 ID가 설정되지 않았습니다.',
        'kakao'
      );
    }
    
    let token = accessToken;
    
    // 코드가 있으면 액세스 토큰으로 교환
    if (code && !token) {
      const redirectUri = request.headers.get('referer')?.includes('callback')
        ? `${request.headers.get('origin')}/auth/callback/kakao`
        : `${request.headers.get('origin')}/api/auth/kakao`;
      
      const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          ...(clientSecret && { client_secret: clientSecret }),
          redirect_uri: redirectUri || '',
          code
        }).toString()
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw createExternalServiceError(
          '액세스 토큰 요청 실패',
          'kakao',
          errorText
        );
      }
      
      const tokenData = await tokenResponse.json();
      token = tokenData.access_token;
      
      if (!token) {
        throw ErrorTransformer.fromLegacySocialAuthError(
          SocialAuthErrorCode.TOKEN_EXCHANGE_FAILED,
          'Kakao 액세스 토큰을 획득하지 못했습니다.',
          'kakao'
        );
      }
    }
    
    if (!token) {
      throw createValidationError(
        'Kakao 액세스 토큰이 필요합니다.',
        'accessToken'
      );
    }
    
    // 사용자 정보 요청
    const userInfoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });
    
    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      throw ErrorTransformer.fromLegacySocialAuthError(
        SocialAuthErrorCode.PROFILE_FETCH_FAILED,
        'Kakao 사용자 정보 요청 실패',
        'kakao',
        errorText
      );
    }
    
    const userInfo = await userInfoResponse.json();
    
    // 프로필 정보 정규화
    const normalizedProfile = normalizeKakaoProfile(userInfo);
    
    // Supabase에 사용자가 이미 존재하는지 확인
    if (normalizedProfile.email) {
      try {
        // listUsers에서 filter 옵션이 지원되지 않으므로 결과에서 직접 필터링
        const { data: users, error: userError } = await supabase.auth.admin.listUsers();
        
        if (userError) {
          throw createDatabaseError(
            'Supabase 사용자 조회 실패',
            userError.message
          );
        }
        
        // 이메일로 필터링하여 일치하는 사용자 찾기
        const matchedUser = users?.users.find(u => u.email === normalizedProfile.email);
        const user = matchedUser ? { user: matchedUser } : null;
        
        if (user?.user) {
          // 사용자가 존재하면 반환
          return {
            success: true,
            profile: normalizedProfile,
            existingUser: true
          };
        }
      } catch (error: any) {
        // 이미 우리가 던진 에러라면 다시 던지기
        if (error.category) {
          throw error;
        }
        // 오류가 발생해도 계속 진행 (새 사용자 생성 시도)
        console.warn('Supabase 사용자 조회 오류 (계속 진행):', error);
      }
    }
    
    // 새 사용자 정보 반환
    return {
      success: true,
      profile: normalizedProfile,
      existingUser: false
    };
  }, request);

  if (error) {
    return error;
  }

  return apiHelpers.success(data!);
});

/**
 * Kakao 연결 해제 처리
 */
export const DELETE = withApiErrorHandler(async (request: NextRequest) => {
  const { data, error } = await safeApiOperation(async () => {
    const { accessToken } = await request.json();
    
    if (!accessToken) {
      throw createValidationError(
        'Kakao 액세스 토큰이 필요합니다.',
        'accessToken'
      );
    }
    
    // Kakao 연결 해제 요청
    const unlinkResponse = await fetch('https://kapi.kakao.com/v1/user/unlink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (!unlinkResponse.ok) {
      const errorText = await unlinkResponse.text();
      throw createExternalServiceError(
        'Kakao 연결 해제 요청 실패',
        'kakao',
        errorText
      );
    }
    
    const unlinkData = await unlinkResponse.json();
    
    return {
      success: true,
      id: unlinkData.id
    };
  }, request);

  if (error) {
    return error;
  }

  return apiHelpers.success(data!);
});