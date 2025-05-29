import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { SocialAuthError, SocialAuthErrorCode } from '@/lib/supabase/social/types';
import { normalizeWeChatProfile } from '@/lib/supabase/social/wechat';
import jwt from 'jsonwebtoken';

// 레이트 리미팅을 위한 간단한 메모리 저장소
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15분
const RATE_LIMIT_MAX_REQUESTS = 10; // 15분당 최대 10회 요청

/**
 * 레이트 리미팅 검사
 * 
 * @param clientId 클라이언트 식별자 (IP 주소 등)
 * @returns 요청 허용 여부
 */
function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const clientData = requestCounts.get(clientId);
  
  // 기존 데이터가 없거나 윈도우가 만료된 경우
  if (!clientData || now > clientData.resetTime) {
    const resetTime = now + RATE_LIMIT_WINDOW;
    requestCounts.set(clientId, { count: 1, resetTime });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetTime };
  }
  
  // 요청 횟수 증가
  clientData.count++;
  
  if (clientData.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: clientData.resetTime };
  }
  
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_MAX_REQUESTS - clientData.count, 
    resetTime: clientData.resetTime 
  };
}

/**
 * 입력 검증 함수
 * 
 * @param code OAuth 코드
 * @param state 상태 토큰
 * @returns 검증 결과
 */
function validateInput(code: string, state?: string): { valid: boolean; error?: string } {
  // 코드 검증
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'OAuth 코드가 필요합니다.' };
  }
  
  if (code.length < 10 || code.length > 512) {
    return { valid: false, error: '유효하지 않은 OAuth 코드 형식입니다.' };
  }
  
  // 코드에 허용되지 않는 문자가 있는지 확인
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
    return { valid: false, error: 'OAuth 코드에 유효하지 않은 문자가 포함되어 있습니다.' };
  }
  
  // 상태 토큰 검증 (선택사항)
  if (state && typeof state === 'string') {
    if (state.length > 256) {
      return { valid: false, error: '상태 토큰이 너무 깁니다.' };
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(state)) {
      return { valid: false, error: '상태 토큰에 유효하지 않은 문자가 포함되어 있습니다.' };
    }
  }
  
  return { valid: true };
}

/**
 * WeChat API 오류 코드 처리
 * 
 * @param errcode WeChat API 오류 코드
 * @param errmsg WeChat API 오류 메시지
 * @returns 사용자 친화적인 오류 메시지
 */
function handleWeChatApiError(errcode: string | number, errmsg: string): string {
  const errorCode = errcode.toString();
  
  const errorMessages: Record<string, string> = {
    // 토큰 관련 오류
    '40001': '액세스 토큰이 유효하지 않습니다.',
    '40002': '잘못된 자격 증명 타입입니다.',
    '40003': 'OpenID가 유효하지 않습니다.',
    '40013': '잘못된 앱 ID입니다.',
    '40125': '잘못된 앱 시크릿입니다.',
    
    // 코드 관련 오류
    '40029': '잘못된 OAuth 코드입니다.',
    '40163': '코드가 이미 사용되었습니다.',
    
    // 토큰 만료 오류
    '42001': '액세스 토큰이 만료되었습니다.',
    '42002': '리프레시 토큰이 만료되었습니다.',
    '42003': '액세스 토큰이 갱신되어야 합니다.',
    
    // 권한 관련 오류
    '48001': '앱이 승인되지 않았습니다.',
    '48002': '앱이 차단되었습니다.',
    '48003': '앱이 삭제되었습니다.',
    '48004': '앱이 일시 중단되었습니다.',
    
    // 사용자 관련 오류
    '50001': '사용자가 인증을 취소했습니다.',
    '50002': '사용자가 앱 사용을 거부했습니다.',
    
    // 시스템 오류
    '-1': 'WeChat 시스템 오류가 발생했습니다.',
    '40164': '요청이 너무 자주 발생했습니다. 잠시 후 다시 시도해주세요.',
    '89503': 'WeChat 서비스가 일시적으로 사용할 수 없습니다.',
  };
  
  return errorMessages[errorCode] || `WeChat API 오류: ${errmsg} (코드: ${errcode})`;
}

/**
 * 보안 헤더 설정
 * 
 * @param response NextResponse 객체
 * @returns 보안 헤더가 설정된 응답
 */
function setSecurityHeaders(response: NextResponse): NextResponse {
  // CORS 헤더
  response.headers.set('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_SITE_URL || '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 보안 헤더
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // 캐시 방지 (민감한 데이터)
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  
  return response;
}

/**
 * WeChat 토큰 및 사용자 정보 처리 API
 * 
 * 이 API는 WeChat OAuth 콜백으로부터 받은 코드를 사용하여
 * 액세스 토큰을 획득하고 사용자 정보를 가져오는 역할을 합니다.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 클라이언트 IP 주소 가져오기 (레이트 리미팅용)
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    console.log('🔍 WeChat API 요청 시작:', {
      ip: clientIp,
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString()
    });
    
    // 레이트 리미팅 검사
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      console.warn('⚠️ 레이트 리미트 초과:', {
        ip: clientIp,
        resetTime: new Date(rateLimitResult.resetTime).toISOString()
      });
      
      const response = NextResponse.json(
        { 
          error: '요청이 너무 자주 발생했습니다. 잠시 후 다시 시도해주세요.',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        { status: 429 }
      );
      
      response.headers.set('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString());
      response.headers.set('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());
      
      return setSecurityHeaders(response);
    }
    
    // 요청 본문 파싱
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error('❌ 요청 본문 파싱 오류:', parseError);
      const response = NextResponse.json(
        { error: '잘못된 JSON 형식입니다.' },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    const { code, state } = requestBody;
    
    // 입력 검증
    const validation = validateInput(code, state);
    if (!validation.valid) {
      console.warn('⚠️ 입력 검증 실패:', validation.error);
      const response = NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    // 환경 변수 검증
    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    
    if (!appId || !appSecret) {
      console.error('❌ WeChat 환경 변수 누락');
      const response = NextResponse.json(
        { error: 'WeChat 서비스가 올바르게 설정되지 않았습니다.' },
        { status: 500 }
      );
      return setSecurityHeaders(response);
    }
    
    // Supabase 클라이언트 생성
    let supabase;
    try {
      supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          }
        }
      );
    } catch (supabaseError) {
      console.error('❌ Supabase 클라이언트 생성 실패:', supabaseError);
      const response = NextResponse.json(
        { error: '데이터베이스 연결에 실패했습니다.' },
        { status: 500 }
      );
      return setSecurityHeaders(response);
    }
    
    console.log('🔍 WeChat 액세스 토큰 요청 시작');
    
    // 1. 코드로 액세스 토큰 획득
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    
    let tokenResponse;
    try {
      tokenResponse = await fetch(tokenUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WeChat-OAuth-Server/1.0'
        },
        // 타임아웃 설정 (10초)
        signal: AbortSignal.timeout(10000)
      });
    } catch (fetchError) {
      console.error('❌ WeChat 토큰 요청 네트워크 오류:', fetchError);
      const response = NextResponse.json(
        { error: 'WeChat 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' },
        { status: 503 }
      );
      return setSecurityHeaders(response);
    }
    
    if (!tokenResponse.ok) {
      console.error('❌ WeChat 토큰 요청 HTTP 오류:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText
      });
      
      const response = NextResponse.json(
        { 
          error: 'WeChat 토큰 요청에 실패했습니다.',
          details: `HTTP ${tokenResponse.status}: ${tokenResponse.statusText}`
        },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    let tokenData;
    try {
      tokenData = await tokenResponse.json();
    } catch (parseError) {
      console.error('❌ WeChat 토큰 응답 파싱 오류:', parseError);
      const response = NextResponse.json(
        { error: 'WeChat 서버 응답을 처리할 수 없습니다.' },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    // WeChat API 오류 처리
    if (tokenData.errcode) {
      const errorMessage = handleWeChatApiError(tokenData.errcode, tokenData.errmsg);
      console.error('❌ WeChat 토큰 API 오류:', {
        errcode: tokenData.errcode,
        errmsg: tokenData.errmsg,
        friendlyMessage: errorMessage
      });
      
      const response = NextResponse.json(
        { 
          error: errorMessage,
          code: tokenData.errcode 
        },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    const accessToken = tokenData.access_token;
    const openId = tokenData.openid;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;
    
    if (!accessToken || !openId) {
      console.error('❌ WeChat 토큰 응답에 필수 필드 누락:', {
        hasAccessToken: !!accessToken,
        hasOpenId: !!openId
      });
      
      const response = NextResponse.json(
        { error: 'WeChat에서 유효하지 않은 토큰 응답을 받았습니다.' },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    console.log('✅ WeChat 액세스 토큰 획득 완료');
    console.log('🔍 WeChat 사용자 정보 요청 시작');
    
    // 2. 액세스 토큰으로 사용자 정보 가져오기
    const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(accessToken)}&openid=${encodeURIComponent(openId)}&lang=zh_CN`;
    
    let userInfoResponse;
    try {
      userInfoResponse = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WeChat-OAuth-Server/1.0'
        },
        // 타임아웃 설정 (10초)
        signal: AbortSignal.timeout(10000)
      });
    } catch (fetchError) {
      console.error('❌ WeChat 사용자 정보 요청 네트워크 오류:', fetchError);
      const response = NextResponse.json(
        { error: 'WeChat 사용자 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.' },
        { status: 503 }
      );
      return setSecurityHeaders(response);
    }
    
    if (!userInfoResponse.ok) {
      console.error('❌ WeChat 사용자 정보 요청 HTTP 오류:', {
        status: userInfoResponse.status,
        statusText: userInfoResponse.statusText
      });
      
      const response = NextResponse.json(
        { 
          error: 'WeChat 사용자 정보 요청에 실패했습니다.',
          details: `HTTP ${userInfoResponse.status}: ${userInfoResponse.statusText}`
        },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    let userInfo;
    try {
      userInfo = await userInfoResponse.json();
    } catch (parseError) {
      console.error('❌ WeChat 사용자 정보 응답 파싱 오류:', parseError);
      const response = NextResponse.json(
        { error: 'WeChat 사용자 정보 응답을 처리할 수 없습니다.' },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    // WeChat API 오류 처리
    if (userInfo.errcode) {
      const errorMessage = handleWeChatApiError(userInfo.errcode, userInfo.errmsg);
      console.error('❌ WeChat 사용자 정보 API 오류:', {
        errcode: userInfo.errcode,
        errmsg: userInfo.errmsg,
        friendlyMessage: errorMessage
      });
      
      const response = NextResponse.json(
        { 
          error: errorMessage,
          code: userInfo.errcode 
        },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    console.log('✅ WeChat 사용자 정보 획득 완료');
    
    // 프로필 정보 정규화
    let normalizedProfile;
    try {
      normalizedProfile = normalizeWeChatProfile(userInfo);
    } catch (profileError) {
      console.error('❌ WeChat 프로필 정규화 오류:', profileError);
      const response = NextResponse.json(
        { error: 'WeChat 사용자 정보를 처리하는 중 오류가 발생했습니다.' },
        { status: 500 }
      );
      return setSecurityHeaders(response);
    }
    
    // 3. JWT 토큰 생성 (Supabase 인증용)
    let idToken;
    try {
      idToken = await generateJwtToken({
        sub: normalizedProfile.id,
        name: normalizedProfile.name,
        picture: normalizedProfile.avatar,
        provider: 'wechat',
        wechat_openid: normalizedProfile.id
      });
    } catch (jwtError) {
      console.error('❌ JWT 토큰 생성 오류:', jwtError);
      const response = NextResponse.json(
        { error: '인증 토큰 생성에 실패했습니다.' },
        { status: 500 }
      );
      return setSecurityHeaders(response);
    }
    
    // 4. Supabase에 사용자 데이터 저장 (선택 사항)
    try {
      // Supabase 사용자가 이미 존재하는지 확인 (openId 기준)
      const { data: existingUsers } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('provider', 'wechat')
        .eq('provider_id', normalizedProfile.id);
      
      if (existingUsers && existingUsers.length > 0) {
        // 기존 사용자가 있으면 프로필 업데이트
        const userId = existingUsers[0].id;
        
        await supabase.from('user_profiles').update({
          display_name: normalizedProfile.name,
          avatar_url: normalizedProfile.avatar,
          updated_at: new Date().toISOString()
        }).eq('id', userId);
        
        normalizedProfile.userId = userId;
        console.log('✅ 기존 WeChat 사용자 프로필 업데이트 완료');
      }
    } catch (error) {
      console.warn('⚠️ Supabase 사용자 업데이트 실패 (계속 진행):', error);
      // 사용자 업데이트 실패해도 계속 진행
    }
    
    const processingTime = Date.now() - startTime;
    console.log('✅ WeChat API 처리 완료:', {
      processingTime: `${processingTime}ms`,
      openId: normalizedProfile.id.substring(0, 8) + '...' // 보안상 일부만 로그
    });
    
    const response = NextResponse.json({
      success: true,
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
        id_token: idToken
      },
      profile: normalizedProfile,
      metadata: {
        processingTime,
        timestamp: new Date().toISOString()
      }
    });
    
    // 레이트 리미팅 헤더 추가
    response.headers.set('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());
    
    return setSecurityHeaders(response);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ WeChat API 요청 처리 중 예상치 못한 오류:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTime: `${processingTime}ms`
    });
    
    const response = NextResponse.json(
      { 
        error: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
    
    return setSecurityHeaders(response);
  }
}

/**
 * WeChat 토큰 갱신 API
 */
export async function PUT(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 클라이언트 IP 주소 가져오기 (레이트 리미팅용)
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    console.log('🔍 WeChat 토큰 갱신 요청 시작:', {
      ip: clientIp,
      timestamp: new Date().toISOString()
    });
    
    // 레이트 리미팅 검사
    const rateLimitResult = checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      console.warn('⚠️ 토큰 갱신 레이트 리미트 초과:', { ip: clientIp });
      
      const response = NextResponse.json(
        { 
          error: '요청이 너무 자주 발생했습니다. 잠시 후 다시 시도해주세요.',
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        },
        { status: 429 }
      );
      
      response.headers.set('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString());
      return setSecurityHeaders(response);
    }
    
    // 요청 본문 파싱
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error('❌ 토큰 갱신 요청 본문 파싱 오류:', parseError);
      const response = NextResponse.json(
        { error: '잘못된 JSON 형식입니다.' },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    const { refresh_token } = requestBody;
    
    // 입력 검증
    if (!refresh_token || typeof refresh_token !== 'string') {
      const response = NextResponse.json(
        { error: '리프레시 토큰이 필요합니다.' },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    if (refresh_token.length < 10 || refresh_token.length > 512) {
      const response = NextResponse.json(
        { error: '유효하지 않은 리프레시 토큰 형식입니다.' },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    // WeChat API 설정
    const appId = process.env.NEXT_PUBLIC_WECHAT_APP_ID;
    
    if (!appId) {
      console.error('❌ WeChat 앱 ID 환경 변수 누락');
      const response = NextResponse.json(
        { error: 'WeChat 서비스가 올바르게 설정되지 않았습니다.' },
        { status: 500 }
      );
      return setSecurityHeaders(response);
    }
    
    console.log('🔍 WeChat 토큰 갱신 API 호출');
    
    // 토큰 갱신 요청
    const refreshUrl = `https://api.weixin.qq.com/sns/oauth2/refresh_token?appid=${encodeURIComponent(appId)}&grant_type=refresh_token&refresh_token=${encodeURIComponent(refresh_token)}`;
    
    let refreshResponse;
    try {
      refreshResponse = await fetch(refreshUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WeChat-OAuth-Server/1.0'
        },
        // 타임아웃 설정 (10초)
        signal: AbortSignal.timeout(10000)
      });
    } catch (fetchError) {
      console.error('❌ WeChat 토큰 갱신 네트워크 오류:', fetchError);
      const response = NextResponse.json(
        { error: 'WeChat 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' },
        { status: 503 }
      );
      return setSecurityHeaders(response);
    }
    
    if (!refreshResponse.ok) {
      console.error('❌ WeChat 토큰 갱신 HTTP 오류:', {
        status: refreshResponse.status,
        statusText: refreshResponse.statusText
      });
      
      const response = NextResponse.json(
        { 
          error: 'WeChat 토큰 갱신 요청에 실패했습니다.',
          details: `HTTP ${refreshResponse.status}: ${refreshResponse.statusText}`
        },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    let refreshData;
    try {
      refreshData = await refreshResponse.json();
    } catch (parseError) {
      console.error('❌ WeChat 토큰 갱신 응답 파싱 오류:', parseError);
      const response = NextResponse.json(
        { error: 'WeChat 서버 응답을 처리할 수 없습니다.' },
        { status: 502 }
      );
      return setSecurityHeaders(response);
    }
    
    // WeChat API 오류 처리
    if (refreshData.errcode) {
      const errorMessage = handleWeChatApiError(refreshData.errcode, refreshData.errmsg);
      console.error('❌ WeChat 토큰 갱신 API 오류:', {
        errcode: refreshData.errcode,
        errmsg: refreshData.errmsg,
        friendlyMessage: errorMessage
      });
      
      const response = NextResponse.json(
        { 
          error: errorMessage,
          code: refreshData.errcode
        },
        { status: 400 }
      );
      return setSecurityHeaders(response);
    }
    
    const processingTime = Date.now() - startTime;
    console.log('✅ WeChat 토큰 갱신 완료:', {
      processingTime: `${processingTime}ms`,
      hasNewToken: !!refreshData.access_token
    });
    
    const response = NextResponse.json({
      success: true,
      tokens: {
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        expires_in: refreshData.expires_in,
        openid: refreshData.openid
      },
      metadata: {
        processingTime,
        timestamp: new Date().toISOString()
      }
    });
    
    return setSecurityHeaders(response);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ WeChat 토큰 갱신 중 예상치 못한 오류:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTime: `${processingTime}ms`
    });
    
    const response = NextResponse.json(
      { 
        error: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
    
    return setSecurityHeaders(response);
  }
}

/**
 * OPTIONS 요청 처리 (CORS preflight)
 */
export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return setSecurityHeaders(response);
}

/**
 * JWT 토큰 생성 함수
 * jsonwebtoken 라이브러리를 사용하여 안전한 토큰 생성
 */
async function generateJwtToken(payload: any): Promise<string> {
  // JWT 시크릿 키 (환경 변수에서 가져오거나 기본값 사용)
  const jwtSecret = process.env.JWT_SECRET || 
                   process.env.SUPABASE_JWT_SECRET || 
                   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                   'fallback-secret-key';
  
  if (jwtSecret === 'fallback-secret-key') {
    console.warn('⚠️ JWT 시크릿 키가 설정되지 않았습니다. 기본값을 사용합니다.');
  }
  
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600; // 1시간
  
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    iss: 'picnic-web-wechat',
    aud: 'picnic-web',
    jti: `wechat_${Date.now()}_${Math.random().toString(36).substring(2)}`
  };
  
  try {
    return jwt.sign(tokenPayload, jwtSecret, {
      algorithm: 'HS256'
    });
  } catch (jwtError) {
    console.error('❌ JWT 토큰 생성 실패:', jwtError);
    throw new Error('JWT 토큰 생성에 실패했습니다.');
  }
} 