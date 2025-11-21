import { createServerSupabaseClientWithCookies } from '@/lib/supabase/server';
import {
  extractAvatarFromProvider,
  extractSupabaseStorageReference,
  getSafeAvatarUrl,
  type AvatarTransformOptions,
} from '@/utils/image-utils';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Next.js 15의 기본 TypeScript 설정(moduleResolution: bundler)에서는
 * `@supabase/storage-js` 패키지의 루트 타입 선언을 탐지하지 못해
 * `Cannot find module '@supabase/storage-js'` 오류가 발생한다.
 * 필요한 TransformOptions 형태만 직접 정의해 타입 의존성을 끊어 빌드 오류를 방지한다.
 */
type StorageTransformOptions = {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill';
  quality?: number;
  format?: 'origin';
};

function toSupabaseTransformOptions(
  transform?: AvatarTransformOptions,
): StorageTransformOptions | undefined {
  if (!transform) {
    return undefined;
  }

  const normalized: StorageTransformOptions = {};

  if (typeof transform.width === 'number' && !Number.isNaN(transform.width)) {
    normalized.width = Math.max(1, Math.round(transform.width));
  }

  if (typeof transform.height === 'number' && !Number.isNaN(transform.height)) {
    normalized.height = Math.max(1, Math.round(transform.height));
  }

  if (
    typeof transform.quality === 'number' &&
    !Number.isNaN(transform.quality)
  ) {
    normalized.quality = Math.min(100, Math.max(20, Math.round(transform.quality)));
  }

  if (transform.resize) {
    const resizeMap: Record<
      NonNullable<AvatarTransformOptions['resize']>,
      StorageTransformOptions['resize']
    > = {
      cover: 'cover',
      contain: 'contain',
      fill: 'fill',
      inside: 'contain',
      outside: 'cover',
    };

    const mappedResize = resizeMap[transform.resize];
    if (mappedResize) {
      normalized.resize = mappedResize;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * 사용자 프로필 정보 API 엔드포인트
 * 캔디 개수를 포함한 사용자 프로필 정보를 반환합니다.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [User Profile API] 사용자 프로필 요청 받음');

    // URL에서 userId 파라미터 추출
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');

    // App Router에서 쿠키를 읽을 수 있는 서버사이드 Supabase 클라이언트 생성
    const supabase = await createServerSupabaseClientWithCookies();

    console.log('🔍 [User Profile API] Supabase 클라이언트 생성 완료');

    // 인증된 사용자 확인
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError || !userData?.user) {
      console.warn('⚠️ [User Profile API] 인증되지 않은 요청:', userError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Unauthorized',
          message: '인증이 필요합니다.'
        }, 
        { status: 401 }
      );
    }

    const currentUserId = userData.user.id;
    
    // 요청된 사용자 ID가 현재 인증된 사용자와 다른 경우 권한 체크
    if (requestedUserId && requestedUserId !== currentUserId) {
      console.warn('⚠️ [User Profile API] 다른 사용자의 프로필 요청 시도:', {
        currentUserId,
        requestedUserId
      });
      return NextResponse.json(
        { 
          success: false,
          error: 'Forbidden',
          message: '다른 사용자의 프로필에 접근할 수 없습니다.'
        }, 
        { status: 403 }
      );
    }

    // 사용자 프로필 정보 조회 (캔디 정보 + 관리자 권한 포함)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        nickname,
        avatar_url,
        star_candy,
        star_candy_bonus,
        is_admin,
        is_super_admin,
        created_at,
        updated_at
      `)
      .eq('id', currentUserId)
      .single();

    if (profileError) {
      console.error('❌ [User Profile API] 프로필 조회 오류:', profileError);
      return NextResponse.json(
        { 
          success: false,
          error: 'Profile not found',
          message: '사용자 프로필을 찾을 수 없습니다.'
        }, 
        { status: 404 }
      );
    }

    // Provider 정보 추출 (Supabase auth에서 가져오기)
    const user = userData.user;
    let provider = 'email'; // 기본값
    let providerDisplayName = '이메일';
    
    // user.identities에서 provider 정보 확인
    if (user.identities && user.identities.length > 0) {
      const identity = user.identities[0]; // 첫 번째 identity 사용
      provider = identity.provider || 'email';
      
      // Provider별 한국어 표시명 설정
      switch (provider) {
        case 'google':
          providerDisplayName = 'Google';
          break;
        case 'kakao':
          providerDisplayName = 'Kakao';
          break;
        case 'apple':
          providerDisplayName = 'Apple';
          break;
        case 'github':
          providerDisplayName = 'GitHub';
          break;
        case 'facebook':
          providerDisplayName = 'Facebook';
          break;
        case 'twitter':
          providerDisplayName = 'Twitter';
          break;
        case 'discord':
          providerDisplayName = 'Discord';
          break;
        case 'email':
        default:
          providerDisplayName = '이메일';
          break;
      }
    }

    // 아바타 URL 결정 로직 (DB 우선, 없으면 제공자 메타데이터에서 안전 추출)
    const providerAvatar = extractAvatarFromProvider(
      user?.user_metadata || {},
      provider,
    );

    const transformOptions: AvatarTransformOptions = {
      width: 256,
      height: 256,
      resize: 'cover',
      quality: 85,
    };

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let effectiveAvatarUrl: string | null = null;

    if (profile.avatar_url) {
      const storageRef = extractSupabaseStorageReference(profile.avatar_url);

      if (
        storageRef &&
        !storageRef.isSigned &&
        supabaseUrl &&
        supabaseServiceRoleKey
      ) {
        try {
          const normalizedSupabaseUrl = supabaseUrl.replace(/\/$/, '');
          const serviceClient = createClient(
            normalizedSupabaseUrl,
            supabaseServiceRoleKey,
            { auth: { persistSession: false } },
          );

          const supabaseTransformOptions =
            toSupabaseTransformOptions(transformOptions);

          const { data: signedData, error: signError } =
            await serviceClient.storage
              .from(storageRef.bucket)
              .createSignedUrl(
                storageRef.path,
                60 * 60,
                supabaseTransformOptions
                  ? { transform: supabaseTransformOptions }
                  : undefined,
              );

          if (!signError && signedData?.signedUrl) {
            effectiveAvatarUrl = signedData.signedUrl;
          }
        } catch (error) {
          console.warn('⚠️ [User Profile API] 아바타 서명 URL 생성 실패:', error);
        }
      }

      if (!effectiveAvatarUrl) {
        effectiveAvatarUrl = getSafeAvatarUrl(
          profile.avatar_url,
          '/images/default-avatar.svg',
          false,
          transformOptions,
        );
      }
    }

    if (!effectiveAvatarUrl && providerAvatar) {
      effectiveAvatarUrl = getSafeAvatarUrl(
        providerAvatar,
        '/images/default-avatar.svg',
        false,
        transformOptions,
      );
    }

    if (!effectiveAvatarUrl) {
      effectiveAvatarUrl = '/images/default-avatar.svg';
    }

    console.log('✅ [User Profile API] 프로필 조회 성공:', {
      userId: profile.id,
      nickname: profile.nickname,
      star_candy: profile.star_candy,
      star_candy_bonus: profile.star_candy_bonus,
      total: (profile.star_candy || 0) + (profile.star_candy_bonus || 0),
      is_admin: profile.is_admin,
      is_super_admin: profile.is_super_admin,
      provider: provider,
      providerDisplayName: providerDisplayName,
      hasDbAvatar: !!profile.avatar_url,
      hasProviderAvatar: !!providerAvatar
    });

    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.nickname,
        avatar_url: effectiveAvatarUrl,
        star_candy: profile.star_candy || 0,
        star_candy_bonus: profile.star_candy_bonus || 0,
        total_candy: (profile.star_candy || 0) + (profile.star_candy_bonus || 0),
        is_admin: profile.is_admin || false,
        is_super_admin: profile.is_super_admin || false,
        provider: provider,
        provider_display_name: providerDisplayName,
        created_at: profile.created_at,
        updated_at: profile.updated_at
      }
    });

  } catch (error) {
    console.error('💥 [User Profile API] 처리 중 오류:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        message: '서버 내부 오류가 발생했습니다.'
      }, 
      { status: 500 }
    );
  }
}

/**
 * OPTIONS 요청 처리 (CORS 지원)
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 