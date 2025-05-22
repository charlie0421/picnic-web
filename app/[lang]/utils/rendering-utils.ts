/**
 * 렌더링 최적화 유틸리티
 * 
 * Next.js의 정적 및 동적 렌더링 기능을 최적화하기 위한 유틸리티 함수들입니다.
 */

/**
 * 정적 페이지 생성을 위한 경로 목록을 생성합니다.
 * generateStaticParams와 함께 사용합니다.
 */
export async function generateStaticPathsHelper<T>(
  fetcher: () => Promise<T[]>,
  paramKey: string
): Promise<{ [key: string]: string }[]> {
  try {
    const items = await fetcher();
    return items.map(item => ({ 
      [paramKey]: String(item[paramKey as keyof T] || '')
    }));
  } catch (error) {
    console.error('정적 경로 생성 중 오류 발생:', error);
    return [];
  }
}

/**
 * ISR 페이지를 구성하기 위한 헬퍼 메타데이터 함수
 * 
 * @param revalidateSeconds 캐시 재검증 간격(초)
 */
export function createISRMetadata(revalidateSeconds: number = 60) {
  return {
    revalidate: revalidateSeconds
  };
}

/**
 * ISR 캐시 태그를 무효화하는 함수
 * 
 * @param tag 무효화할 태그 이름
 */
export async function revalidateTagHelper(tag: string): Promise<boolean> {
  try {
    // Next.js 14의 revalidateTag API를 사용
    const { revalidateTag } = await import('next/cache');
    revalidateTag(tag);
    return true;
  } catch (error) {
    console.error(`캐시 태그 무효화 중 오류 발생 (${tag}):`, error);
    return false;
  }
}

/**
 * 경로 기반 캐시 무효화 함수
 * 
 * @param path 무효화할 경로
 */
export async function revalidatePathHelper(path: string): Promise<boolean> {
  try {
    // Next.js 14의 revalidatePath API를 사용
    const { revalidatePath } = await import('next/cache');
    revalidatePath(path);
    return true;
  } catch (error) {
    console.error(`경로 무효화 중 오류 발생 (${path}):`, error);
    return false;
  }
}

/**
 * 동적 렌더링이 필요한지 확인하는 함수
 * 
 * @param params 요청 매개변수
 * @param dynamicParams 동적 렌더링이 필요한 매개변수 목록
 */
export function shouldUseServerRendering(
  params: Record<string, string | string[] | undefined>, 
  dynamicParams: string[] = []
): boolean {
  // 동적 매개변수가 존재하는지 확인
  return dynamicParams.some(param => 
    params[param] !== undefined && params[param] !== null
  );
}

/**
 * 캐시 제어 헤더를 생성하는 함수
 * 
 * @param maxAge 최대 캐시 기간(초)
 * @param staleWhileRevalidate stale-while-revalidate 기간(초)
 * @param isPublic 공개 캐시 가능 여부
 */
export function createCacheControlHeader(
  maxAge: number,
  staleWhileRevalidate?: number,
  isPublic: boolean = true
): string {
  let header = isPublic ? 'public, ' : 'private, ';
  header += `max-age=${maxAge}`;
  
  if (staleWhileRevalidate) {
    header += `, stale-while-revalidate=${staleWhileRevalidate}`;
  }
  
  return header;
}

/**
 * 정적 자산에 대한 캐시 헤더를 설정하는 함수
 * 
 * @param maxAge 최대 캐시 기간(초)
 * @param immutable 변경되지 않는 자산인지 여부
 */
export function createStaticAssetCacheHeader(
  maxAge: number = 86400, // 기본 1일
  immutable: boolean = false
): string {
  let header = 'public, max-age=' + maxAge;
  
  if (immutable) {
    header += ', immutable';
  }
  
  return header;
} 