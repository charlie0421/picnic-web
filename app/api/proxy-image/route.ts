import { NextRequest, NextResponse } from 'next/server';

/**
 * 이미지 프록시 API
 * Google 이미지 429 에러를 우회하기 위해 서버에서 이미지를 프록시합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    
    if (!imageUrl) {
      return NextResponse.json(
        { error: '이미지 URL이 필요합니다.' },
        { status: 400 }
      );
    }
    
    // URL 검증
    try {
      const url = new URL(imageUrl);
      
      // 허용된 도메인만 프록시
      const allowedDomains = [
        'googleusercontent.com',
        'lh3.googleusercontent.com',
        'graph.facebook.com',
        'pbs.twimg.com',
        'cdn.discordapp.com',
        'avatars.githubusercontent.com',
      ];

      try {
        const supabaseUrl =
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
        if (supabaseUrl) {
          const supabaseHost = new URL(supabaseUrl).host;
          allowedDomains.push(supabaseHost);
        }
      } catch (error) {
        console.warn('🖼️ [ImageProxy] Supabase 도메인 파싱 실패:', error);
      }
      
      const supabaseWildcardDomains = [
        '.supabase.co',
        '.supabase.in',
      ];
      
      const isAllowed =
        allowedDomains.some((domain) => url.hostname.includes(domain)) ||
        supabaseWildcardDomains.some((suffix) =>
          url.hostname.endsWith(suffix),
        );
      
      if (!isAllowed) {
        return NextResponse.json(
          { error: '허용되지 않은 도메인입니다.' },
          { status: 403 }
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: '유효하지 않은 URL입니다.' },
        { status: 400 }
      );
    }
    
    // 이미지 가져오기
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PicnicBot/1.0)',
        'Accept': 'image/*',
        'Cache-Control': 'no-cache'
      },
      // 타임아웃 설정
      signal: AbortSignal.timeout(10000) // 10초
    });
    
    if (!response.ok) {
      console.warn(`🖼️ [ImageProxy] 이미지 로딩 실패: ${response.status} ${response.statusText} for ${imageUrl}`);
      
      // 429 에러인 경우 특별 처리
      if (response.status === 429) {
        return NextResponse.json(
          { 
            error: 'Too Many Requests', 
            message: '이미지 서버에서 요청 제한이 발생했습니다.',
            retryAfter: response.headers.get('Retry-After') || '300'
          },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: `이미지 로딩 실패: ${response.status}` },
        { status: response.status }
      );
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();
    
    // 이미지 응답 반환
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, s-maxage=86400', // 1시간 브라우저 캐시, 1일 CDN 캐시
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
    
  } catch (error) {
    console.error('🖼️ [ImageProxy] 프록시 에러:', error);
    
    // 타임아웃 에러
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: '이미지 로딩 시간 초과' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: '이미지 프록시 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// OPTIONS 요청 처리 (CORS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

