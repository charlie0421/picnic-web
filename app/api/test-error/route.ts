import { NextRequest, NextResponse } from 'next/server';

/**
 * 500 에러 테스트용 API 엔드포인트
 * 
 * 사용법:
 * - GET /api/test-error → 일반적인 500 에러
 * - GET /api/test-error?type=database → 데이터베이스 에러 시뮬레이션
 * - GET /api/test-error?type=auth → 인증 에러 시뮬레이션
 * - GET /api/test-error?type=timeout → 타임아웃 에러 시뮬레이션
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const errorType = searchParams.get('type');

  console.log('🚨 [TEST ERROR] 의도적 에러 발생:', errorType || 'general');

  switch (errorType) {
    case 'database':
      // 데이터베이스 연결 에러 시뮬레이션
      throw new Error('Database connection failed: Connection timeout after 30s');

    case 'auth':
      // 인증 에러 시뮬레이션
      throw new Error('Authentication failed: Invalid JWT token signature');

    case 'timeout':
      // 타임아웃 에러 시뮬레이션
      throw new Error('Request timeout: Operation took longer than 10 seconds');

    case 'memory':
      // 메모리 에러 시뮬레이션
      throw new Error('Out of memory: Cannot allocate buffer of size 2GB');

    case 'network':
      // 네트워크 에러 시뮬레이션
      throw new Error('Network error: ECONNREFUSED 127.0.0.1:5432');

    default:
      // 일반적인 서버 에러
      throw new Error('Internal server error: Something went wrong on our end');
  }

  // 이 코드는 절대 실행되지 않음 (위에서 항상 에러가 발생)
  return NextResponse.json({ message: 'This should never be reached' });
}

export async function POST(request: NextRequest) {
  console.log('🚨 [TEST ERROR] POST 요청으로 에러 발생');
  
  try {
    const body = await request.json();
    console.log('Request body:', body);
  } catch (parseError) {
    throw new Error('Invalid JSON payload: Malformed request body');
  }

  // POST 요청에서는 항상 처리 중 에러 발생
  throw new Error('Failed to process POST request: Validation error');
} 