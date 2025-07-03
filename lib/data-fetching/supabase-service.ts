/**
 * 서버 측 Supabase 데이터 페칭 유틸리티
 *
 * 서버 컴포넌트에서 Supabase를 사용한 데이터 페칭을 위한 유틸리티 함수들을 제공합니다.
 * 이 파일의 모든 함수들은 서버 컴포넌트에서만 사용해야 합니다.
 *
 * React.cache를 사용하여 모든 함수가 동일한 렌더링 사이클 내에서 캐싱됩니다.
 * 이를 통해 중복 요청을 방지하고 성능을 최적화합니다.
 */

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { PostgrestError, PostgrestSingleResponse } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { unstable_cache } from "next/cache";
import { handleSupabaseError } from "@/lib/supabase/error";

// Supabase 테이블 이름 상수
export const TABLES = {
  ARTIST: "artist",
  ARTIST_GROUP: "artist_group",
  USER_PROFILES: "user_profiles",
  VOTE: "vote",
  VOTE_ITEM: "vote_item",
  VOTE_PICK: "vote_pick",
  VOTE_REWARD: "vote_reward",
  REWARD: "reward",
  MEDIA: "media",
  BANNER: "banner",
  USER: "user_profiles",
  VERSION: "version",
  PRODUCTS: "products",
} as const;

// Supabase 테이블 이름 타입
export type TableName = typeof TABLES[keyof typeof TABLES];

// Supabase RPC 함수 이름 상수
export const RPC = {
  GET_USER_VOTE: "get_user_vote",
  ADD_USER_VOTE: "add_user_vote",
  INCREMENT_VOTE: "increment_vote",
} as const;

// Supabase RPC 함수 이름 타입
export type RpcFunctionName = keyof typeof RPC;

// 테이블별 Row 타입
export type TableRow<T extends TableName> =
  Database["public"]["Tables"][T]["Row"];

// 테이블별 Insert 타입
export type TableInsert<T extends TableName> =
  Database["public"]["Tables"][T]["Insert"];

// 테이블별 Update 타입
export type TableUpdate<T extends TableName> =
  Database["public"]["Tables"][T]["Update"];

/**
 * 고급 필터 연산자 타입
 */
export type FilterOperator<T> = {
  eq?: T;
  neq?: T;
  gt?: T;
  gte?: T;
  lt?: T;
  lte?: T;
  like?: string;
  ilike?: string;
  is?: boolean | null;
  in?: T[];
  contains?: T;
  containedBy?: T[];
  rangeGt?: T;
  rangeGte?: T;
  rangeLt?: T;
  rangeLte?: T;
  rangeAdjacent?: T;
  overlaps?: T[];
  textSearch?: string;
  match?: Record<string, unknown>;
};

/**
 * 필터 옵션 타입
 */
export type FilterOptions = Record<string, any | FilterOperator<any>>;

/**
 * 정렬 옵션 타입
 */
export type OrderByOptions = {
  column: string;
  ascending?: boolean;
};

/**
 * 캐싱 및 재검증 옵션
 */
export interface QueryOptions {
  /**
   * 캐싱 전략
   * - 'force-cache': 캐싱 사용 (기본값)
   * - 'no-store': 캐싱 사용 안 함
   */
  cache?: "force-cache" | "no-store";

  /**
   * 재검증 시간(초)
   * - false: 재검증 없음
   * - 숫자: 지정된 시간(초) 후 재검증
   */
  revalidate?: number | false;

  /**
   * 캐시 태그
   * - 지정된 태그로 캐시를 무효화할 수 있음
   */
  tags?: string[];

  /**
   * 필터 옵션
   * - 쿼리에 필터를 적용할 때 사용
   */
  filters?: FilterOptions;
}

/**
 * 기본 쿼리 옵션
 */
const DEFAULT_OPTIONS: QueryOptions = {
  cache: "force-cache",
  revalidate: 60, // 1분
};

/**
 * 응답 결과 타입
 */
export type QueryResult<T> = {
  data: T | null;
  error: PostgrestError | null;
};

/**
 * 페이지네이션 응답 타입
 */
export type PaginatedResult<T> = {
  data: T[];
  count: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * 에러 타입 구분
 */
export enum ErrorType {
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  VALIDATION = "VALIDATION",
  SERVER = "SERVER",
  UNKNOWN = "UNKNOWN",
}

/**
 * 커스텀 데이터 페칭 에러
 */
export class DataFetchingError extends Error {
  type: ErrorType;
  statusCode: number;
  details?: unknown;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    statusCode: number = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "DataFetchingError";
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Supabase 데이터 페칭 기본 함수
 * 캐싱 적용된 데이터 페칭 함수입니다.
 */
export const querySupabase = cache(async <T>(
  queryFn: (
    supabase: ReturnType<typeof createServerSupabaseClient>,
  ) => Promise<PostgrestSingleResponse<T>>,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<T> => {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await queryFn(supabase);

    if (error) {
      console.error("Supabase 쿼리 오류:", error);
      const errorType = error.code === "23505"
        ? ErrorType.VALIDATION
        : error.code === "42501"
        ? ErrorType.FORBIDDEN
        : error.code === "23503"
        ? ErrorType.VALIDATION
        : ErrorType.SERVER;

      throw new DataFetchingError(
        `데이터 조회 중 오류가 발생했습니다: ${error.message}`,
        errorType,
        500,
        error,
      );
    }

    if (data === null) {
      throw new DataFetchingError(
        "데이터를 찾을 수 없습니다",
        ErrorType.NOT_FOUND,
        404,
      );
    }

    return data;
  } catch (error) {
    if (error instanceof DataFetchingError) {
      throw error;
    }

    console.error("데이터 페칭 오류:", error);
    throw new DataFetchingError(
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다",
      ErrorType.UNKNOWN,
      500,
      error,
    );
  }
});

/**
 * ID로 단일 항목 조회
 */
export const getById = cache(async <T>(
  table: TableName,
  id: string | number,
  columns: string = "*",
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<T> => {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("id", id)
    .single();

  if (error) {
    console.error(`항목 조회 오류 (${table} ID:${id}):`, error);
    if (error.code === "PGRST116") {
      throw new DataFetchingError(
        `항목을 찾을 수 없습니다: ${table} ID ${id}`,
        ErrorType.NOT_FOUND,
        404,
        error,
      );
    }

    throw new DataFetchingError(
      `항목 조회 중 오류가 발생했습니다: ${error.message}`,
      ErrorType.SERVER,
      500,
      error,
    );
  }

  return data as T;
});

/**
 * 조건 기반 데이터 목록 조회
 */
export const getList = cache(async <T>(
  table: TableName,
  {
    columns = "*",
    filters = {},
    orderBy,
    limit,
    offset,
    options = DEFAULT_OPTIONS,
  }: {
    columns?: string;
    filters?: Record<string, any | FilterOperator<any>>;
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
    options?: QueryOptions;
  },
): Promise<T[]> => {
  const supabase = createServerSupabaseClient();
  let query = supabase.from(table).select(columns);

  // 필터 적용
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        query = query.in(key, value);
      } else if (typeof value === "object") {
        // 연산자 객체인 경우 적절한 필터 적용
        Object.entries(value as FilterOperator<any>).forEach(
          ([operator, operatorValue]) => {
            if (operatorValue !== undefined) {
              switch (operator) {
                case "eq":
                  query = query.eq(key, operatorValue);
                  break;
                case "neq":
                  query = query.neq(key, operatorValue);
                  break;
                case "gt":
                  query = query.gt(key, operatorValue);
                  break;
                case "gte":
                  query = query.gte(key, operatorValue);
                  break;
                case "lt":
                  query = query.lt(key, operatorValue);
                  break;
                case "lte":
                  query = query.lte(key, operatorValue);
                  break;
                case "like":
                  query = query.like(key, operatorValue as string);
                  break;
                case "ilike":
                  query = query.ilike(key, operatorValue as string);
                  break;
                case "is":
                  query = query.is(key, operatorValue as boolean | null);
                  break;
                case "in":
                  query = query.in(key, operatorValue as any[]);
                  break;
                case "contains":
                  query = query.contains(key, operatorValue);
                  break;
                case "containedBy":
                  query = query.containedBy(key, operatorValue as any[]);
                  break;
                case "overlaps":
                  query = query.overlaps(key, operatorValue as any[]);
                  break;
                case "textSearch":
                  query = query.textSearch(key, operatorValue as string);
                  break;
                // match 메서드는 파라미터가 하나만 필요합니다
                case "match":
                  query = query.match(operatorValue as Record<string, unknown>);
                  break;
              }
            }
          },
        );
      } else {
        query = query.eq(key, value);
      }
    }
  });

  // 정렬 적용
  if (orderBy) {
    query = query.order(orderBy.column, {
      ascending: orderBy.ascending !== false,
    });
  }

  // 페이지네이션 적용
  if (limit !== undefined) {
    query = query.limit(limit);
  }

  if (offset !== undefined) {
    query = query.range(offset, offset + (limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`목록 조회 오류 (${table}):`, error);
    throw new DataFetchingError(
      `목록을 조회할 수 없습니다: ${error.message}`,
      ErrorType.SERVER,
      500,
      error,
    );
  }

  return (data || []) as T[];
});

/**
 * 페이지네이션이 적용된 데이터 목록 조회
 */
export const getPaginatedList = cache(async <T>(
  table: TableName,
  {
    columns = "*",
    filters = {},
    orderBy,
    page = 1,
    pageSize = 10,
    options = DEFAULT_OPTIONS,
  }: {
    columns?: string;
    filters?: Record<string, any | FilterOperator<any>>;
    orderBy?: { column: string; ascending?: boolean };
    page?: number;
    pageSize?: number;
    options?: QueryOptions;
  },
): Promise<PaginatedResult<T>> => {
  try {
    const supabase = createServerSupabaseClient();

    // 전체 항목 수 조회
    let countQuery = supabase.from(table).select("id", {
      count: "exact",
      head: true,
    });

    // 필터 적용
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === "object" && !Array.isArray(value)) {
          // 연산자 객체인 경우 적절한 필터 적용
          Object.entries(value as FilterOperator<any>).forEach(
            ([operator, operatorValue]) => {
              if (operatorValue !== undefined) {
                // countQuery에도 동일한 필터 적용 로직 추가 (getList의 로직과 유사)
                switch (operator) {
                  case "eq":
                    countQuery = countQuery.eq(key, operatorValue);
                    break;
                  case "neq":
                    countQuery = countQuery.neq(key, operatorValue);
                    break;
                  case "gt":
                    countQuery = countQuery.gt(key, operatorValue);
                    break;
                  case "gte":
                    countQuery = countQuery.gte(key, operatorValue);
                    break;
                  case "lt":
                    countQuery = countQuery.lt(key, operatorValue);
                    break;
                  case "lte":
                    countQuery = countQuery.lte(key, operatorValue);
                    break;
                  case "like":
                    countQuery = countQuery.like(key, operatorValue as string);
                    break;
                  case "ilike":
                    countQuery = countQuery.ilike(key, operatorValue as string);
                    break;
                  case "is":
                    countQuery = countQuery.is(
                      key,
                      operatorValue as boolean | null,
                    );
                    break;
                  case "in":
                    countQuery = countQuery.in(key, operatorValue as any[]);
                    break;
                }
              }
            },
          );
        } else if (Array.isArray(value)) {
          countQuery = countQuery.in(key, value);
        } else {
          countQuery = countQuery.eq(key, value);
        }
      }
    });

    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new DataFetchingError(
        `항목 수 조회 중 오류가 발생했습니다: ${countError.message}`,
        ErrorType.SERVER,
        500,
        countError,
      );
    }

    // 실제 데이터 조회
    const offset = (page - 1) * pageSize;
    const data = await getList<T>(table, {
      columns,
      filters,
      orderBy,
      limit: pageSize,
      offset,
      options,
    });

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      data,
      count: totalCount,
      hasMore: page < totalPages,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error("페이지네이션 데이터 조회 오류:", error);
    if (error instanceof DataFetchingError) {
      throw error;
    }
    throw new DataFetchingError(
      error instanceof Error
        ? error.message
        : "페이지네이션 데이터 조회 중 오류가 발생했습니다",
      ErrorType.SERVER,
      500,
      error,
    );
  }
});

/**
 * 데이터 삽입 (레거시 - RLS 호환성을 위해 insertDataSafe 사용 권장)
 */
export const insertData = cache(async <T extends TableName>(
  table: T,
  data: any,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any> => {
  const supabase = createServerSupabaseClient();
  const { data: insertedData, error } = await supabase
    .from(table)
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error(`데이터 삽입 오류 (${table}):`, error);
    
    // RLS 정책 관련 에러 처리 추가
    const appError = handleSupabaseError(error);
    throw appError;
  }

  return insertedData;
});

/**
 * 데이터 업데이트 (레거시 - RLS 호환성을 위해 updateDataSafe 사용 권장)
 */
export const updateData = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  data: any,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any> => {
  const supabase = createServerSupabaseClient();
  const { data: updatedData, error } = await supabase
    .from(table)
    .update(data)
    .eq("id" as any, id)
    .select()
    .single();

  if (error) {
    console.error(`데이터 업데이트 오류 (${table} ID:${id}):`, error);
    
    // RLS 정책 관련 에러 처리 추가
    const appError = handleSupabaseError(error);
    throw appError;
  }

  return updatedData;
});

/**
 * 데이터 삭제 (레거시 - RLS 호환성을 위해 deleteDataSafe 사용 권장)
 */
export const deleteData = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any> => {
  const supabase = createServerSupabaseClient();
  const { data: deletedData, error } = await supabase
    .from(table)
    .delete()
    .eq("id" as any, id)
    .select()
    .single();

  if (error) {
    console.error(`데이터 삭제 오류 (${table} ID:${id}):`, error);
    
    // RLS 정책 관련 에러 처리 추가
    const appError = handleSupabaseError(error);
    throw appError;
  }

  return deletedData;
});

/**
 * RLS 정책을 고려한 안전한 데이터 삭제
 */
export const deleteDataSafe = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any> => {
  const userContext = await getCurrentUserContext();
  
  if (!userContext.isAuthenticated) {
    throw new DataFetchingError(
      '로그인이 필요합니다.',
      ErrorType.UNAUTHORIZED,
      401,
    );
  }

  const supabase = createServerSupabaseClient();

  try {
    let query = supabase
      .from(table)
      .delete()
      .eq("id" as any, id);

    // 사용자 소유 데이터는 추가 필터링
    const userOwnedTables = ['vote_pick', 'vote_comment'];
    if (userOwnedTables.includes(table) && !userContext.isAdmin && userContext.userId) {
      query = query.eq('user_id' as any, userContext.userId);
    }

    const { data: deletedData, error } = await query
      .select()
      .single();

    if (error) {
      console.error(`데이터 삭제 오류 (${table} ID:${id}):`, error);
      const appError = handleSupabaseError(error);
      throw appError;
    }

    return deletedData;
  } catch (error) {
    if (error instanceof Error && error.message.includes('RLS')) {
      throw new DataFetchingError(
        '데이터를 삭제할 권한이 없습니다.',
        ErrorType.FORBIDDEN,
        403,
        error,
      );
    }
    throw error;
  }
});

/**
 * 사용자 지정 쿼리 실행
 */
export const executeCustomQuery = cache(async <T>(
  queryFn: (
    supabase: ReturnType<typeof createServerSupabaseClient>,
  ) => Promise<PostgrestSingleResponse<T>>,
): Promise<T> => {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await queryFn(supabase);

    if (error) {
      throw new DataFetchingError(
        `쿼리 실행 중 오류가 발생했습니다: ${error.message}`,
        ErrorType.SERVER,
        500,
        error,
      );
    }

    if (data === null) {
      throw new DataFetchingError(
        "데이터가 없습니다",
        ErrorType.NOT_FOUND,
        404,
      );
    }

    return data;
  } catch (error) {
    console.error("사용자 지정 쿼리 오류:", error);
    if (error instanceof DataFetchingError) {
      throw error;
    }
    throw new DataFetchingError(
      error instanceof Error
        ? error.message
        : "사용자 지정 쿼리 실행 중 오류가 발생했습니다",
      ErrorType.SERVER,
      500,
      error,
    );
  }
});

/**
 * 최신 버전 정보 조회
 */
export const getLatestVersion = cache(async (): Promise<{
  ios: any;
  android: any;
  apk?: any;
} | null> => {
  try {
    // 공개 데이터용 클라이언트 사용 (쿠키 없음)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    const { data, error } = await supabase
      .from(TABLES.VERSION)
      .select("ios, android, apk")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.warn("버전 정보 조회 실패:", error);
      return null;
    }

    return {
      ios: data?.ios || null,
      android: data?.android || null,
      apk: data?.apk || null,
    };
  } catch (error) {
    console.warn("버전 정보 조회 중 오류:", error);
    return null;
  }
});

// RPC 상수 이름을 타입 안전하게 소문자 함수 이름으로 변환하는 함수
function getRpcFunctionName(
  name: RpcFunctionName,
): "get_user_vote" | "add_user_vote" | "increment_vote" {
  switch (name) {
    case "GET_USER_VOTE":
      return "get_user_vote";
    case "ADD_USER_VOTE":
      return "add_user_vote";
    case "INCREMENT_VOTE":
      return "increment_vote";
  }
}

/**
 * ID로 항목 조회 (없을 경우 404)
 */
export const getByIdOrNotFound = cache(async <T>(
  table: TableName,
  id: string | number,
  columns: string = "*",
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<T> => {
  try {
    return await getById<T>(table, id, columns, options);
  } catch (error) {
    if (
      error instanceof DataFetchingError && error.type === ErrorType.NOT_FOUND
    ) {
      console.error(`항목을 찾을 수 없음: ${table} ID ${id}`);
      notFound();
    }
    throw error;
  }
});

/**
 * 여러 항목 동시에 조회 (ID 목록 기반)
 */
export const getManyByIds = cache(async <T>(
  table: TableName,
  ids: (string | number)[],
  columns: string = "*",
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<T[]> => {
  if (!ids.length) return [];

  return getList<T>(table, {
    columns,
    filters: { id: { in: ids } },
    options,
  });
});

/**
 * 데이터 일괄 삽입
 */
export const bulkInsert = cache(async <T extends TableName>(
  table: T,
  data: any[],
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any[]> => {
  if (!data.length) return [];

  const supabase = createServerSupabaseClient();
  const { data: insertedData, error } = await supabase
    .from(table)
    .insert(data)
    .select();

  if (error) {
    console.error(`데이터 일괄 삽입 오류 (${table}):`, error);
    throw new DataFetchingError(
      `데이터를 일괄 삽입할 수 없습니다: ${error.message}`,
      ErrorType.SERVER,
      500,
      error,
    );
  }

  return insertedData;
});

/**
 * 데이터 일괄 업데이트
 */
export const bulkUpdate = cache(async <T extends TableName>(
  table: T,
  data: { id: string | number; data: any }[],
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any[]> => {
  if (!data.length) return [];

  const promises = data.map((item) =>
    updateData<T>(table, item.id, item.data, options)
  );

  try {
    return await Promise.all(promises);
  } catch (error) {
    console.error(`데이터 일괄 업데이트 오류 (${table}):`, error);
    if (error instanceof DataFetchingError) {
      throw error;
    }
    throw new DataFetchingError(
      error instanceof Error
        ? error.message
        : "데이터 일괄 업데이트 중 오류가 발생했습니다",
      ErrorType.SERVER,
      500,
      error,
    );
  }
});

/**
 * 캐시 태그 생성 함수
 *
 * 이 함수는 특정 리소스나 쿼리에 대한 캐시 태그를 생성합니다.
 * 캐시 무효화 시 이 태그를 사용하여 관련 캐시만 무효화할 수 있습니다.
 */
function generateCacheTag(
  table: string,
  id?: string | number,
  options?: QueryOptions,
): string[] {
  const tags = [`table:${table}`];

  if (id) {
    tags.push(`${table}:${id}`);
  }

  if (options?.filters) {
    const filterKeys = Object.keys(options.filters).sort().join("_");
    tags.push(`${table}:filters:${filterKeys}`);
  }

  return tags;
}

/**
 * 필터 적용 헬퍼 함수
 *
 * 이 함수는 쿼리에 필터 옵션을 적용합니다.
 */
function applyFilters<T = any>(
  query: PostgrestFilterBuilder<any, any, T[], unknown>,
  filters?: FilterOptions,
): PostgrestFilterBuilder<any, any, T[], unknown> {
  if (!filters) return query;

  let filteredQuery = query;

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "object" && !Array.isArray(value)) {
      if ("eq" in value) {
        filteredQuery = filteredQuery.eq(key, value.eq as any);
      } else if ("neq" in value) {
        filteredQuery = filteredQuery.neq(key, value.neq as any);
      } else if ("gt" in value) {
        filteredQuery = filteredQuery.gt(key, value.gt as any);
      } else if ("gte" in value) {
        filteredQuery = filteredQuery.gte(key, value.gte as any);
      } else if ("lt" in value) {
        filteredQuery = filteredQuery.lt(key, value.lt as any);
      } else if ("lte" in value) {
        filteredQuery = filteredQuery.lte(key, value.lte as any);
      } else if ("like" in value) {
        filteredQuery = filteredQuery.like(key, value.like as string);
      } else if ("ilike" in value) {
        filteredQuery = filteredQuery.ilike(key, value.ilike as string);
      } else if ("in" in value && Array.isArray(value.in)) {
        filteredQuery = filteredQuery.in(key, value.in);
      } else if ("is" in value) {
        filteredQuery = filteredQuery.is(key, value.is as any);
      }
    } else {
      filteredQuery = filteredQuery.eq(key, value);
    }
  }

  return filteredQuery;
}

/**
 * 정렬 적용 헬퍼 함수
 *
 * 이 함수는 쿼리에 정렬 옵션을 적용합니다.
 */
function applyOrderBy<T = any>(
  query: PostgrestFilterBuilder<any, any, T[], unknown>,
  orderBy?: OrderByOptions,
): PostgrestFilterBuilder<any, any, T[], unknown> {
  if (!orderBy) return query;

  return query.order(orderBy.column, {
    ascending: orderBy.ascending !== false,
  });
}

/**
 * 페이지네이션 적용 헬퍼 함수
 *
 * 이 함수는 쿼리에 페이지네이션 옵션을 적용합니다.
 */
function applyPagination<T = any>(
  query: PostgrestFilterBuilder<any, any, T[], unknown>,
  limit?: number,
  offset?: number,
): PostgrestFilterBuilder<any, any, T[], unknown> {
  let result = query;

  if (limit) {
    result = result.limit(limit);
  }

  if (offset) {
    result = result.range(offset, offset + (limit || 10) - 1);
  }

  return result;
}

/**
 * 데이터 프리페칭 함수
 *
 * 이 함수는 사용자가 방문할 가능성이 있는 페이지의 데이터를 미리 가져와 캐시에 저장합니다.
 */
export async function prefetchRecord<T>(
  table: TableName,
  id: string | number,
): Promise<void> {
  try {
    await getById<T>(table, id);
  } catch (error) {
    // 프리페치 실패는 무시
    console.warn(`Failed to prefetch ${table} with id ${id}:`, error);
  }
}

/**
 * 데이터 목록 프리페칭 함수
 *
 * 이 함수는 사용자가 방문할 가능성이 있는 페이지의 데이터 목록을 미리 가져와 캐시에 저장합니다.
 */
export async function prefetchList<T>(
  table: TableName,
  options: QueryOptions = {},
): Promise<void> {
  try {
    await getList<T>(table, options);
  } catch (error) {
    // 프리페치 실패는 무시
    console.warn(`Failed to prefetch list from ${table}:`, error);
  }
}

/**
 * RLS 정책 호환성을 위한 사용자 컨텍스트 인터페이스
 */
export interface UserContext {
  userId?: string;
  isAdmin?: boolean;
  isAuthenticated: boolean;
}

/**
 * 현재 사용자 컨텍스트를 가져오는 함수
 */
export const getCurrentUserContext = cache(async (): Promise<UserContext> => {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { isAuthenticated: false };
    }

    // 사용자 프로필에서 관리자 여부 확인
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    return {
      userId: user.id,
      isAdmin: profile?.is_admin || false,
      isAuthenticated: true,
    };
  } catch (error) {
    console.warn('사용자 컨텍스트 조회 실패:', error);
    return { isAuthenticated: false };
  }
});

/**
 * RLS 정책을 고려한 안전한 데이터 조회
 */
export const getByIdSafe = cache(async <T>(
  table: TableName,
  id: string | number,
  columns: string = "*",
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<T> => {
  const userContext = await getCurrentUserContext();
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("id", id)
      .single();

    if (error) {
      console.error(`항목 조회 오류 (${table} ID:${id}):`, error);
      
      // RLS 정책 관련 에러 처리
      const appError = handleSupabaseError(error);
      throw appError;
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.message.includes('RLS')) {
      throw new DataFetchingError(
        userContext.isAuthenticated 
          ? '해당 데이터에 접근할 권한이 없습니다.'
          : '로그인이 필요합니다.',
        userContext.isAuthenticated ? ErrorType.FORBIDDEN : ErrorType.UNAUTHORIZED,
        userContext.isAuthenticated ? 403 : 401,
        error,
      );
    }
    throw error;
  }
});

/**
 * RLS 정책을 고려한 안전한 데이터 목록 조회
 */
export const getListSafe = cache(async <T>(
  table: TableName,
  {
    columns = "*",
    filters = {},
    orderBy,
    limit,
    offset,
    options = DEFAULT_OPTIONS,
  }: {
    columns?: string;
    filters?: Record<string, any | FilterOperator<any>>;
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
    options?: QueryOptions;
  },
): Promise<T[]> => {
  const userContext = await getCurrentUserContext();
  const supabase = createServerSupabaseClient();

  try {
    let query = supabase.from(table).select(columns);

    // 사용자별 데이터 필터링 (RLS 정책 보완)
    if (!userContext.isAdmin && userContext.isAuthenticated && userContext.userId) {
      // 사용자 소유 데이터만 조회하는 테이블들
      const userOwnedTables = ['vote_pick', 'vote_comment', 'user_profiles'];
      if (userOwnedTables.includes(table)) {
        query = query.eq('user_id' as any, userContext.userId);
      }
    }

    // 필터 적용
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === "object") {
          // 연산자 객체인 경우 적절한 필터 적용
          Object.entries(value as FilterOperator<any>).forEach(
            ([operator, operatorValue]) => {
              if (operatorValue !== undefined) {
                switch (operator) {
                  case "eq":
                    query = query.eq(key, operatorValue);
                    break;
                  case "neq":
                    query = query.neq(key, operatorValue);
                    break;
                  case "gt":
                    query = query.gt(key, operatorValue);
                    break;
                  case "gte":
                    query = query.gte(key, operatorValue);
                    break;
                  case "lt":
                    query = query.lt(key, operatorValue);
                    break;
                  case "lte":
                    query = query.lte(key, operatorValue);
                    break;
                  case "like":
                    query = query.like(key, operatorValue as string);
                    break;
                  case "ilike":
                    query = query.ilike(key, operatorValue as string);
                    break;
                  case "is":
                    query = query.is(key, operatorValue as boolean | null);
                    break;
                  case "in":
                    query = query.in(key, operatorValue as any[]);
                    break;
                  case "contains":
                    query = query.contains(key, operatorValue);
                    break;
                  case "containedBy":
                    query = query.containedBy(key, operatorValue as any[]);
                    break;
                  case "overlaps":
                    query = query.overlaps(key, operatorValue as any[]);
                    break;
                  case "textSearch":
                    query = query.textSearch(key, operatorValue as string);
                    break;
                  case "match":
                    query = query.match(operatorValue as Record<string, unknown>);
                    break;
                }
              }
            },
          );
        } else {
          query = query.eq(key, value);
        }
      }
    });

    // 정렬 적용
    if (orderBy) {
      query = query.order(orderBy.column, {
        ascending: orderBy.ascending !== false,
      });
    }

    // 페이지네이션 적용
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    if (offset !== undefined) {
      query = query.range(offset, offset + (limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`목록 조회 오류 (${table}):`, error);
      const appError = handleSupabaseError(error);
      throw appError;
    }

    return (data || []) as T[];
  } catch (error) {
    if (error instanceof Error && error.message.includes('RLS')) {
      throw new DataFetchingError(
        userContext.isAuthenticated 
          ? '해당 데이터에 접근할 권한이 없습니다.'
          : '로그인이 필요합니다.',
        userContext.isAuthenticated ? ErrorType.FORBIDDEN : ErrorType.UNAUTHORIZED,
        userContext.isAuthenticated ? 403 : 401,
        error,
      );
    }
    throw error;
  }
});

/**
 * RLS 정책을 고려한 안전한 데이터 삽입
 */
export const insertDataSafe = cache(async <T extends TableName>(
  table: T,
  data: any,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any> => {
  const userContext = await getCurrentUserContext();
  
  if (!userContext.isAuthenticated) {
    throw new DataFetchingError(
      '로그인이 필요합니다.',
      ErrorType.UNAUTHORIZED,
      401,
    );
  }

  const supabase = createServerSupabaseClient();

  // 사용자 소유 데이터에 user_id 자동 설정
  const userOwnedTables = ['vote_pick', 'vote_comment'];
  if (userOwnedTables.includes(table) && !data.user_id && userContext.userId) {
    data.user_id = userContext.userId;
  }

  try {
    const { data: insertedData, error } = await supabase
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error(`데이터 삽입 오류 (${table}):`, error);
      const appError = handleSupabaseError(error);
      throw appError;
    }

    return insertedData;
  } catch (error) {
    if (error instanceof Error && error.message.includes('RLS')) {
      throw new DataFetchingError(
        '데이터를 생성할 권한이 없습니다.',
        ErrorType.FORBIDDEN,
        403,
        error,
      );
    }
    throw error;
  }
});

/**
 * RLS 정책을 고려한 안전한 데이터 업데이트
 */
export const updateDataSafe = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  data: any,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<any> => {
  const userContext = await getCurrentUserContext();
  
  if (!userContext.isAuthenticated) {
    throw new DataFetchingError(
      '로그인이 필요합니다.',
      ErrorType.UNAUTHORIZED,
      401,
    );
  }

  const supabase = createServerSupabaseClient();

  try {
    let query = supabase
      .from(table)
      .update(data)
      .eq("id" as any, id);

    // 사용자 소유 데이터는 추가 필터링
    const userOwnedTables = ['vote_pick', 'vote_comment', 'user_profiles'];
    if (userOwnedTables.includes(table) && !userContext.isAdmin && userContext.userId) {
      query = query.eq('user_id' as any, userContext.userId);
    }

    const { data: updatedData, error } = await query
      .select()
      .single();

    if (error) {
      console.error(`데이터 업데이트 오류 (${table} ID:${id}):`, error);
      const appError = handleSupabaseError(error);
      throw appError;
    }

    return updatedData;
  } catch (error) {
    if (error instanceof Error && error.message.includes('RLS')) {
      throw new DataFetchingError(
        '데이터를 수정할 권한이 없습니다.',
        ErrorType.FORBIDDEN,
        403,
        error,
      );
    }
    throw error;
  }
});
