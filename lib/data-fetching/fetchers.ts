/**
 * 서버 사이드 데이터 페칭 유틸리티
 *
 * Next.js의 서버 컴포넌트에서 사용할 데이터 페칭 유틸리티 함수 모음입니다.
 * 이 파일의 함수들은 서버 컴포넌트에서만 사용해야 합니다.
 */

import { createClient } from "@/utils/supabase-server-client";
import { notFound } from "next/navigation";
import { cache } from "react";
import { 
  withDatabaseRetry, 
  withNetworkRetry, 
  ExtendedRetryUtility,
  DATABASE_RETRY_CONFIG,
  NETWORK_RETRY_CONFIG 
} from "@/utils/retry";
import { logger } from "@/utils/logger";

// 기본 캐싱 옵션
export type CacheOptions = {
  revalidate?: number | false; // 데이터 재검증 시간 (초)
  tags?: string[]; // 캐시 태그
  cache?: "force-cache" | "no-store" | "default"; // 캐시 전략
};

const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  revalidate: 60, // 기본 1분 캐싱
  cache: "force-cache", // Next.js 15.3.1부터 no-store가 기본값이므로 명시적으로 force-cache 설정
};

/**
 * Supabase 쿼리를 위한 기본 페처 함수 (재시도 로직 포함)
 * 서버 컴포넌트에서 캐싱과 함께 Supabase 쿼리를 실행
 */
export const fetchFromSupabase = cache(async <T>(
  queryBuilder: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => Promise<{ data: T | null; error: any }>,
  options: CacheOptions = DEFAULT_CACHE_OPTIONS,
): Promise<T> => {
  const result = await withDatabaseRetry(async () => {
    const supabase = await createClient();
    const { data, error } = await queryBuilder(supabase);

    if (error) {
      await logger.error("Supabase query error", error, {
        operation: 'fetchFromSupabase',
        errorCode: error.code,
        errorMessage: error.message,
      });
      throw new Error(error.message || "데이터 조회 중 오류가 발생했습니다.");
    }

    if (!data) {
      // null 데이터 처리를 보다
      // 안전하게 배열 타입에 대해서는 빈 배열, 그 외에는 null 반환
      // 타입스크립트는 컴파일 타임에만 존재하므로 실행 시점에는 판단 불가
      // 타입 매개변수에서 명시적으로 배열 타입인 경우에만 빈 배열 반환
      return ([] as any) as T; // 기본적으로 빈 배열 반환
    }

    return data;
  }, 'fetchFromSupabase');

  if (result.success) {
    return result.data!;
  } else {
    throw result.error;
  }
});

/**
 * ID로 단일 데이터 조회
 */
export const fetchById = cache(async <T>(
  table: string,
  id: string,
  columns: string = "*",
  options: CacheOptions = DEFAULT_CACHE_OPTIONS,
): Promise<T> => {
  return fetchFromSupabase(async (supabase) => {
    return supabase
      .from(table)
      .select(columns)
      .eq("id", id)
      .single();
  }, options);
});

/**
 * 특정 조건으로 데이터 목록 조회
 */
export const fetchList = cache(async <T = any>(
  table: string,
  columns: string = "*",
  filters?: Record<string, any>,
  options: CacheOptions = DEFAULT_CACHE_OPTIONS,
): Promise<T[]> => {
  return fetchFromSupabase<T[]>(async (supabase) => {
    let query = supabase.from(table).select(columns);

    // 필터 적용
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          query = query.eq(key, value);
        }
      });
    }

    // 타입 안전한 방식으로 쿼리 결과 반환
    return query as unknown as Promise<{ data: T[]; error: any }>;
  }, options);
});

/**
 * 외부 API를 호출하는 페처 함수 (재시도 로직 포함)
 */
export const fetchApi = cache(async <T>(
  url: string,
  options: RequestInit = {},
  cacheOptions: CacheOptions = DEFAULT_CACHE_OPTIONS,
): Promise<T> => {
  const result = await withNetworkRetry(async () => {
    const res = await fetch(url, {
      ...options,
      cache: cacheOptions.cache || "force-cache", // Next.js 15.3.1부터 no-store가 기본값이므로 명시적으로 설정
      next: {
        revalidate: cacheOptions.revalidate,
        tags: cacheOptions.tags,
      },
    });

    if (!res.ok) {
      await logger.error(`API 요청 실패: ${url}`, new Error(`HTTP ${res.status}`), {
        operation: 'fetchApi',
        url,
        status: res.status,
        statusText: res.statusText,
      });
      throw new Error(`API 요청 실패: ${res.status}`);
    }

    return res.json();
  }, `fetchApi-${url}`);

  if (result.success) {
    return result.data!;
  } else {
    throw result.error;
  }
});
