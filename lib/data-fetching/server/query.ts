/**
 * 서버 측 Supabase 쿼리 함수
 *
 * 읽기 전용 데이터 조회 함수들을 제공합니다.
 * React.cache를 사용하여 동일한 렌더링 사이클 내에서 캐싱됩니다.
 */

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import {
  type TableName,
  type QueryOptions,
  type PaginatedResult,
  DataFetchingError,
  ErrorType,
  DEFAULT_OPTIONS,
} from "./types";
import { applyFilters, applyOrderBy, applyPagination } from "./query-helpers";

/**
 * Supabase 데이터 페칭 기본 함수
 * 캐싱 적용된 데이터 페칭 함수입니다.
 */
export const querySupabase = cache(async <T>(
  queryFn: (
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ) => Promise<PostgrestSingleResponse<T>>,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<T> => {
  try {
    const supabase = await createServerSupabaseClient();
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
  const supabase = await createServerSupabaseClient();
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
    filters?: Record<string, unknown>;
    orderBy?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
    options?: QueryOptions;
  },
): Promise<T[]> => {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from(table).select(columns);

  // 필터, 정렬, 페이지네이션 적용
  query = applyFilters(query, filters);
  query = applyOrderBy(query, orderBy);
  query = applyPagination(query, limit, offset);

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
    filters?: Record<string, unknown>;
    orderBy?: { column: string; ascending?: boolean };
    page?: number;
    pageSize?: number;
    options?: QueryOptions;
  },
): Promise<PaginatedResult<T>> => {
  try {
    const supabase = await createServerSupabaseClient();

    // 전체 항목 수 조회
    let countQuery = supabase.from(table).select("id", {
      count: "exact",
      head: true,
    });

    // 필터 적용
    countQuery = applyFilters(countQuery, filters);

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
