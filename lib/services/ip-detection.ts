// =====================================================================================
// IP-BASED REGION DETECTION SERVICE
// =====================================================================================
// 사용자의 IP 주소를 기반으로 한국/글로벌 지역을 자동으로 감지하는 서비스
// Payment 컴포넌트에서 결제 제공업체(Port One vs PayPal) 선택에 사용됨
// =====================================================================================

import type { Region } from '@/components/client/vote/dialogs/payment/types';

/**
 * IP 지역 감지 응답 인터페이스
 */
interface IPDetectionResponse {
  region: Region;
  country: string;
  countryCode: string;
  confidence: number;
  source: 'ipapi' | 'cf-headers' | 'fallback';
  cached: boolean;
  timestamp: string;
}

/**
 * 외부 IP API 응답 인터페이스 (ip-api.com)
 */
interface IPApiResponse {
  status: 'success' | 'fail';
  country?: string;
  countryCode?: string;
  message?: string;
  query?: string;
}

/**
 * 에러 클래스
 */
export class IPDetectionError extends Error {
  constructor(
    message: string,
    public code: string,
    public source?: string
  ) {
    super(message);
    this.name = 'IPDetectionError';
  }
}

/**
 * 한국 IP 범위 확인을 위한 유틸리티
 * 주요 한국 IP 범위들을 체크
 */
const KOREA_IP_RANGES = [
  // 주요 한국 ISP IP 범위 (CIDR 표기법)
  '1.201.0.0/16',     // KT
  '1.214.0.0/16',     // KT
  '14.32.0.0/11',     // SK브로드밴드
  '27.96.0.0/11',     // KT
  '39.7.0.0/16',      // KT
  '49.142.0.0/15',    // SK브로드밴드
  '58.120.0.0/13',    // LG유플러스
  '61.72.0.0/13',     // KT
  '106.240.0.0/12',   // SK브로드밴드
  '110.70.0.0/15',    // KT
  '112.136.0.0/13',   // LG유플러스
  '114.192.0.0/10',   // KT
  '118.128.0.0/11',   // SK브로드밴드
  '121.128.0.0/10',   // KT
  '125.128.0.0/11',   // SK브로드밴드
  '175.192.0.0/10',   // KT
  '180.64.0.0/11',    // SK브로드밴드
  '182.208.0.0/12',   // SK브로드밴드
  '210.89.160.0/19',  // KT
  '211.104.0.0/13',   // KT
  '222.96.0.0/11',    // LG유플러스
];

/**
 * IP 주소가 CIDR 범위에 포함되는지 확인
 */
function isIPInRange(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);
    
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

/**
 * IP 주소를 숫자로 변환
 */
function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => acc * 256 + parseInt(octet), 0);
}

/**
 * 한국 IP인지 확인 (빠른 체크)
 */
function isKoreanIP(ip: string): boolean {
  return KOREA_IP_RANGES.some(range => isIPInRange(ip, range));
}

/**
 * IP 주소 유효성 검사
 */
function isValidIP(ip: string): boolean {
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(ip);
}

/**
 * 사설 IP 주소 체크
 */
function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.0/8',
    '169.254.0.0/16'
  ];
  
  return privateRanges.some(range => isIPInRange(ip, range));
}

/**
 * Request 객체에서 클라이언트 IP 추출
 */
export function getClientIP(request: Request): string | null {
  // Cloudflare Headers
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP && isValidIP(cfConnectingIP) && !isPrivateIP(cfConnectingIP)) {
    return cfConnectingIP;
  }

  // Standard proxy headers
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    for (const ip of ips) {
      if (isValidIP(ip) && !isPrivateIP(ip)) {
        return ip;
      }
    }
  }

  // Other common headers
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP && isValidIP(xRealIP) && !isPrivateIP(xRealIP)) {
    return xRealIP;
  }

  const xClientIP = request.headers.get('x-client-ip');
  if (xClientIP && isValidIP(xClientIP) && !isPrivateIP(xClientIP)) {
    return xClientIP;
  }

  return null;
}

/**
 * Cloudflare 헤더에서 국가 정보 추출
 */
function getCountryFromCloudflareHeaders(request: Request): string | null {
  const cfCountry = request.headers.get('cf-ipcountry');
  return cfCountry && cfCountry !== 'XX' ? cfCountry : null;
}

/**
 * 외부 IP API 호출 (ip-api.com - 무료, 1000 requests/hour)
 */
async function fetchIPLocation(ip: string): Promise<IPApiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,query`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Picnic-Payment-Service/1.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new IPDetectionError(
        `IP API request failed: ${response.status}`,
        'API_REQUEST_FAILED',
        'ipapi'
      );
    }

    const data = await response.json() as IPApiResponse;
    
    if (data.status === 'fail') {
      throw new IPDetectionError(
        data.message || 'IP API returned failure status',
        'API_FAILURE',
        'ipapi'
      );
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof IPDetectionError) {
      throw error;
    }
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new IPDetectionError(
        'IP API request timeout',
        'REQUEST_TIMEOUT',
        'ipapi'
      );
    }
    
    throw new IPDetectionError(
      `IP API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'NETWORK_ERROR',
      'ipapi'
    );
  }
}

/**
 * 국가 코드를 기반으로 지역 결정
 */
function determineRegionFromCountryCode(countryCode: string): Region {
  // 한국은 무조건 korea 지역
  if (countryCode === 'KR') {
    return 'korea';
  }
  
  // 그 외 모든 국가는 global 지역
  return 'global';
}

/**
 * 빠른 한국 IP 체크 (로컬 범위 기반)
 */
function quickKoreanCheck(ip: string): { isKorean: boolean; confidence: number } {
  const isKorean = isKoreanIP(ip);
  return {
    isKorean,
    confidence: isKorean ? 0.85 : 0.15 // 로컬 체크는 85% 신뢰도
  };
}

/**
 * 메인 IP 지역 감지 함수
 */
export async function detectRegionFromIP(
  request: Request,
  options: {
    useCache?: boolean;
    fallbackToHeaders?: boolean;
    skipExternalAPI?: boolean;
  } = {}
): Promise<IPDetectionResponse> {
  const {
    useCache = true,
    fallbackToHeaders = true,
    skipExternalAPI = false
  } = options;

  const timestamp = new Date().toISOString();

  try {
    // 1. 클라이언트 IP 추출
    const clientIP = getClientIP(request);
    
    if (!clientIP) {
      throw new IPDetectionError(
        'Unable to extract client IP from request',
        'NO_CLIENT_IP'
      );
    }

    // 2. Cloudflare 헤더 우선 체크 (가장 빠름)
    if (fallbackToHeaders) {
      const cfCountry = getCountryFromCloudflareHeaders(request);
      if (cfCountry) {
        const region = determineRegionFromCountryCode(cfCountry);
        return {
          region,
          country: cfCountry,
          countryCode: cfCountry,
          confidence: 0.95, // Cloudflare는 매우 신뢰도가 높음
          source: 'cf-headers',
          cached: false,
          timestamp
        };
      }
    }

    // 3. 빠른 로컬 한국 IP 체크
    const quickCheck = quickKoreanCheck(clientIP);
    if (quickCheck.isKorean && quickCheck.confidence > 0.8) {
      return {
        region: 'korea',
        country: 'South Korea',
        countryCode: 'KR',
        confidence: quickCheck.confidence,
        source: 'fallback',
        cached: false,
        timestamp
      };
    }

    // 4. 외부 API 호출 (필요한 경우만)
    if (!skipExternalAPI) {
      try {
        const ipData = await fetchIPLocation(clientIP);
        
        if (ipData.status === 'success' && ipData.countryCode) {
          const region = determineRegionFromCountryCode(ipData.countryCode);
          return {
            region,
            country: ipData.country || 'Unknown',
            countryCode: ipData.countryCode,
            confidence: 0.9, // 외부 API는 90% 신뢰도
            source: 'ipapi',
            cached: false,
            timestamp
          };
        }
      } catch (apiError) {
        console.warn('IP API failed, falling back to local detection:', apiError);
      }
    }

    // 5. 최종 fallback - 한국이 아니면 global로 가정
    return {
      region: quickCheck.isKorean ? 'korea' : 'global',
      country: quickCheck.isKorean ? 'South Korea' : 'Unknown',
      countryCode: quickCheck.isKorean ? 'KR' : 'XX',
      confidence: quickCheck.confidence,
      source: 'fallback',
      cached: false,
      timestamp
    };

  } catch (error) {
    // 모든 감지가 실패한 경우 기본값 반환
    console.error('IP region detection failed:', error);
    
    return {
      region: 'global', // 안전한 기본값
      country: 'Unknown',
      countryCode: 'XX',
      confidence: 0.1,
      source: 'fallback',
      cached: false,
      timestamp
    };
  }
}

/**
 * 간단한 지역 감지 (캐싱 없음, 빠른 응답)
 */
export async function detectRegionQuick(request: Request): Promise<Region> {
  try {
    const result = await detectRegionFromIP(request, {
      useCache: false,
      fallbackToHeaders: true,
      skipExternalAPI: true
    });
    return result.region;
  } catch {
    return 'global'; // 에러 시 안전한 기본값
  }
}

/**
 * 테스트용 IP 지역 감지
 */
export async function detectRegionFromTestIP(ip: string): Promise<IPDetectionResponse> {
  const timestamp = new Date().toISOString();
  
  if (!isValidIP(ip)) {
    throw new IPDetectionError(
      'Invalid IP address format',
      'INVALID_IP'
    );
  }

  // 빠른 로컬 체크
  const quickCheck = quickKoreanCheck(ip);
  if (quickCheck.confidence > 0.8) {
    return {
      region: quickCheck.isKorean ? 'korea' : 'global',
      country: quickCheck.isKorean ? 'South Korea' : 'Unknown',
      countryCode: quickCheck.isKorean ? 'KR' : 'XX',
      confidence: quickCheck.confidence,
      source: 'fallback',
      cached: false,
      timestamp
    };
  }

  // 외부 API 호출
  try {
    const ipData = await fetchIPLocation(ip);
    
    if (ipData.status === 'success' && ipData.countryCode) {
      const region = determineRegionFromCountryCode(ipData.countryCode);
      return {
        region,
        country: ipData.country || 'Unknown',
        countryCode: ipData.countryCode,
        confidence: 0.9,
        source: 'ipapi',
        cached: false,
        timestamp
      };
    }
  } catch (error) {
    console.warn('Test IP API failed:', error);
  }

  // Fallback
  return {
    region: 'global',
    country: 'Unknown',
    countryCode: 'XX',
    confidence: 0.1,
    source: 'fallback',
    cached: false,
    timestamp
  };
}

/**
 * 지역 감지 결과 유효성 검사
 */
export function validateDetectionResult(result: IPDetectionResponse): boolean {
  return (
    result &&
    typeof result.region === 'string' &&
    ['korea', 'global'].includes(result.region) &&
    typeof result.confidence === 'number' &&
    result.confidence >= 0 &&
    result.confidence <= 1 &&
    typeof result.source === 'string' &&
    ['ipapi', 'cf-headers', 'fallback'].includes(result.source)
  );
}

// Export types for external usage
export type { IPDetectionResponse };