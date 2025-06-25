// =====================================================================================
// IP-BASED REGION DETECTION API ENDPOINT
// =====================================================================================
// 사용자 IP를 기반으로 korea/global 지역을 자동 감지하는 API
// Payment 컴포넌트에서 결제 제공업체 선택 시 사용됨
// =====================================================================================

import { NextRequest, NextResponse } from 'next/server';
import { 
  detectRegionFromIP, 
  detectRegionQuick, 
  detectRegionFromTestIP,
  getClientIP,
  validateDetectionResult,
  IPDetectionError
} from '@/lib/services/ip-detection';
import type { IPDetectionResponse } from '@/lib/services/ip-detection';

/**
 * API 응답 타입
 */
interface APIResponse {
  success: boolean;
  data?: IPDetectionResponse;
  error?: {
    code: string;
    message: string;
    source?: string;
  };
  meta?: {
    processingTime: number;
    endpoint: string;
    version: string;
  };
}

/**
 * 요청 파라미터 검증
 */
function validateQueryParams(searchParams: URLSearchParams) {
  const mode = searchParams.get('mode');
  const testIP = searchParams.get('testIP');
  
  // 허용된 모드 확인
  if (mode && !['quick', 'full', 'test'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Allowed values: quick, full, test`);
  }
  
  // 테스트 모드에서 IP 필수
  if (mode === 'test' && !testIP) {
    throw new Error('testIP parameter is required when mode=test');
  }
  
  return { mode: mode as 'quick' | 'full' | 'test' | null, testIP };
}

/**
 * IP 지역 감지 성공 응답 생성
 */
function createSuccessResponse(
  data: IPDetectionResponse,
  processingTime: number
): NextResponse<APIResponse> {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      processingTime,
      endpoint: '/api/payment/region-detect',
      version: '1.0.0'
    }
  }, { 
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300', // 5분 캐시
      'Content-Type': 'application/json'
    }
  });
}

/**
 * 에러 응답 생성
 */
function createErrorResponse(
  error: Error | IPDetectionError,
  status: number = 500,
  processingTime?: number
): NextResponse<APIResponse> {
  const isIPDetectionError = error instanceof IPDetectionError;
  
  return NextResponse.json({
    success: false,
    error: {
      code: isIPDetectionError ? error.code : 'INTERNAL_ERROR',
      message: error.message,
      source: isIPDetectionError ? error.source : undefined
    },
    meta: {
      processingTime: processingTime || 0,
      endpoint: '/api/payment/region-detect',
      version: '1.0.0'
    }
  }, { 
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * GET 요청 핸들러
 * 
 * Query Parameters:
 * - mode: 'quick' | 'full' | 'test' (기본값: 'full')
 * - testIP: 테스트할 IP 주소 (mode=test일 때 필수)
 * - skipCache: 캐시 건너뛰기 (true/false, 기본값: false)
 * - skipAPI: 외부 API 호출 건너뛰기 (true/false, 기본값: false)
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const { mode, testIP } = validateQueryParams(searchParams);
    const skipCache = searchParams.get('skipCache') === 'true';
    const skipAPI = searchParams.get('skipAPI') === 'true';
    
    let result: IPDetectionResponse;
    
    switch (mode) {
      case 'quick':
        // 빠른 감지 모드 (외부 API 호출 없음)
        const quickRegion = await detectRegionQuick(request);
        result = {
          region: quickRegion,
          country: quickRegion === 'korea' ? 'South Korea' : 'Unknown',
          countryCode: quickRegion === 'korea' ? 'KR' : 'XX',
          confidence: 0.8,
          source: 'fallback',
          cached: false,
          timestamp: new Date().toISOString()
        };
        break;
        
      case 'test':
        // 테스트 모드 (특정 IP로 테스트)
        if (!testIP) {
          throw new Error('testIP parameter is required for test mode');
        }
        result = await detectRegionFromTestIP(testIP);
        break;
        
      case 'full':
      default:
        // 전체 감지 모드 (모든 기능 사용)
        result = await detectRegionFromIP(request, {
          useCache: !skipCache,
          fallbackToHeaders: true,
          skipExternalAPI: skipAPI
        });
        break;
    }
    
    // 결과 유효성 검사
    if (!validateDetectionResult(result)) {
      throw new Error('Invalid detection result format');
    }
    
    const processingTime = Math.round(performance.now() - startTime);
    
    // 성공 응답 반환
    return createSuccessResponse(result, processingTime);
    
  } catch (error) {
    const processingTime = Math.round(performance.now() - startTime);
    
    console.error('Region detection API error:', error);
    
    if (error instanceof IPDetectionError) {
      // IP 감지 관련 에러
      const status = error.code === 'NO_CLIENT_IP' ? 400 : 
                    error.code === 'INVALID_IP' ? 400 : 
                    error.code === 'REQUEST_TIMEOUT' ? 408 :
                    error.code === 'API_REQUEST_FAILED' ? 502 :
                    500;
      
      return createErrorResponse(error, status, processingTime);
    }
    
    if (error instanceof Error) {
      // 일반적인 에러 (파라미터 검증 등)
      const status = error.message.includes('Invalid') || 
                    error.message.includes('required') ? 400 : 500;
      
      return createErrorResponse(error, status, processingTime);
    }
    
    // 알 수 없는 에러
    return createErrorResponse(
      new Error('An unexpected error occurred'),
      500,
      processingTime
    );
  }
}

/**
 * POST 요청 핸들러 (대량 IP 처리용)
 * 
 * Request Body:
 * {
 *   ips: string[], // 처리할 IP 목록 (최대 10개)
 *   mode?: 'quick' | 'full', // 감지 모드 (기본값: 'full')
 *   skipCache?: boolean, // 캐시 건너뛰기
 *   skipAPI?: boolean // 외부 API 호출 건너뛰기
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = performance.now();
  
  try {
    const body = await request.json();
    const { ips, mode = 'full', skipCache = false, skipAPI = false } = body;
    
    // 입력 검증
    if (!Array.isArray(ips)) {
      throw new Error('ips must be an array');
    }
    
    if (ips.length === 0) {
      throw new Error('ips array cannot be empty');
    }
    
    if (ips.length > 10) {
      throw new Error('Maximum 10 IPs allowed per request');
    }
    
    if (!ips.every(ip => typeof ip === 'string')) {
      throw new Error('All IPs must be strings');
    }
    
    // 각 IP에 대해 지역 감지 수행
    const results = await Promise.allSettled(
      ips.map(async (ip: string) => {
        try {
          const result = await detectRegionFromTestIP(ip);
          return { ip, ...result };
        } catch (error) {
          return {
            ip,
            region: 'global' as const,
            country: 'Unknown',
            countryCode: 'XX',
            confidence: 0.1,
            source: 'fallback' as const,
            cached: false,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );
    
    // 결과 정리
    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          ip: ips[index],
          region: 'global' as const,
          country: 'Unknown',
          countryCode: 'XX',
          confidence: 0.1,
          source: 'fallback' as const,
          cached: false,
          timestamp: new Date().toISOString(),
          error: result.reason?.message || 'Processing failed'
        };
      }
    });
    
    const processingTime = Math.round(performance.now() - startTime);
    
    return NextResponse.json({
      success: true,
      data: {
        results: processedResults,
        summary: {
          total: ips.length,
          successful: processedResults.filter(r => !r.error).length,
          failed: processedResults.filter(r => r.error).length,
          koreaCount: processedResults.filter(r => r.region === 'korea').length,
          globalCount: processedResults.filter(r => r.region === 'global').length
        }
      },
      meta: {
        processingTime,
        endpoint: '/api/payment/region-detect',
        version: '1.0.0'
      }
    }, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    const processingTime = Math.round(performance.now() - startTime);
    
    console.error('Bulk region detection API error:', error);
    
    return createErrorResponse(
      error instanceof Error ? error : new Error('Unknown error'),
      400,
      processingTime
    );
  }
}

/**
 * OPTIONS 요청 핸들러 (CORS 지원)
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24시간
    },
  });
}

/**
 * 지원되지 않는 HTTP 메서드에 대한 핸들러
 */
export async function PUT() {
  return NextResponse.json({
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'PUT method is not supported'
    }
  }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'DELETE method is not supported'
    }
  }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({
    success: false,
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'PATCH method is not supported'
    }
  }, { status: 405 });
}