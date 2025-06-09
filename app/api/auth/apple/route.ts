import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withApiErrorHandler, safeApiOperation } from '@/utils/api-error-handler';
import { AppError, ErrorCategory } from '@/utils/error';

interface AppleAuthRequest {
  code: string;
  user?: any;
  state?: string;
}

async function appleAuthHandler(request: NextRequest) {
  const { data: body, error: parseError } = await safeApiOperation(
    () => request.json() as Promise<AppleAuthRequest>,
    request
  );

  if (parseError) {
    return parseError;
  }

  const { code, user, state } = body!;

  if (!code) {
    throw new AppError(
      'Authorization code가 필요합니다',
      ErrorCategory.VALIDATION,
      'medium',
      400
    );
  }

  const { data: authResult, error: authError } = await safeApiOperation(async () => {
    // Supabase 클라이언트 생성
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Apple OAuth 콜백 처리
    const { data, error } = await supabase.auth.exchangeCodeForSession(`apple_${code}`);
    
    if (error) {
      throw new AppError(
        `Apple OAuth 처리 실패: ${error.message}`,
        ErrorCategory.EXTERNAL_SERVICE,
        'high',
        400,
        { 
          originalError: error,
          additionalData: {
            code: code ? 'present' : 'missing',
            hasUser: !!user,
            hasState: !!state
          }
        }
      );
    }

    if (!data?.session) {
      throw new AppError(
        'Apple OAuth 세션 생성 실패',
        ErrorCategory.EXTERNAL_SERVICE,
        'high',
        500
      );
    }

    return {
      isAppleVerified: true,
      user: data.session.user,
      session: data.session
    };
  }, request);

  if (authError) {
    return authError;
  }

  return NextResponse.json({
    success: true,
    message: 'Apple OAuth 성공',
    authData: authResult!
  });
}

export const POST = withApiErrorHandler(appleAuthHandler);