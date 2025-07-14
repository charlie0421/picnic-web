import { NextRequest, NextResponse } from 'next/server';

/**
 * 서버 시간 API 엔드포인트
 * 클라이언트가 서버의 정확한 현재 시간을 가져올 수 있도록 합니다.
 * 시간 기반 기능(다이얼로그 노출, 투표 시간 등)에 사용됩니다.
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    
    // ISO 8601 형식으로 시간 반환
    const isoString = now.toISOString();
    
    // 추가적인 시간 정보도 함께 제공
    const timeData = {
      iso: isoString,
      timestamp: now.getTime(),
      utc: now.toUTCString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: now.getTimezoneOffset(), // 분 단위
    };

    return NextResponse.json({
      success: true,
      serverTime: timeData,
    });
  } catch (error) {
    console.error('❌ [Server Time API] 오류:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get server time',
        message: '서버 시간 조회에 실패했습니다.'
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS 메서드 지원 (CORS preflight)
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
} 