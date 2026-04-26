/**
 * Supabase 쿼리 헬퍼 함수
 *
 * 필터, 정렬, 페이지네이션 적용 및 캐시 태그 생성 유틸리티입니다.
 */

import type { FilterOptions, OrderByOptions, QueryOptions, RpcFunctionName } from "./types";

/**
 * 필터 적용 헬퍼 함수
 *
 * Supabase 쿼리 빌더에 필터 옵션을 적용합니다.
 * getList, getPaginatedList, getListSafe에서 공통으로 사용됩니다.
 */
export function applyFilters<TQuery>(
  query: TQuery,
  filters?: FilterOptions,
): TQuery {
  if (!filters) return query;

  // Supabase query builder objects have dynamic method signatures;
  // we use unknown to bridge the gap
  let q = query as unknown as Record<string, (...args: unknown[]) => unknown>;

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      q = q.in(key, value) as typeof q;
    } else if (typeof value === "object") {
      // 연산자 객체인 경우 적절한 필터 적용
      for (const [operator, operatorValue] of Object.entries(value as Record<string, unknown>)) {
        if (operatorValue === undefined) continue;
        switch (operator) {
          case "eq":
            q = q.eq(key, operatorValue) as typeof q;
            break;
          case "neq":
            q = q.neq(key, operatorValue) as typeof q;
            break;
          case "gt":
            q = q.gt(key, operatorValue) as typeof q;
            break;
          case "gte":
            q = q.gte(key, operatorValue) as typeof q;
            break;
          case "lt":
            q = q.lt(key, operatorValue) as typeof q;
            break;
          case "lte":
            q = q.lte(key, operatorValue) as typeof q;
            break;
          case "like":
            q = q.like(key, operatorValue as string) as typeof q;
            break;
          case "ilike":
            q = q.ilike(key, operatorValue as string) as typeof q;
            break;
          case "is":
            q = q.is(key, operatorValue as boolean | null) as typeof q;
            break;
          case "in":
            q = q.in(key, operatorValue as unknown[]) as typeof q;
            break;
          case "contains":
            q = q.contains(key, operatorValue as string) as typeof q;
            break;
          case "containedBy":
            q = q.containedBy(key, operatorValue as unknown[]) as typeof q;
            break;
          case "overlaps":
            q = q.overlaps(key, operatorValue as unknown[]) as typeof q;
            break;
          case "textSearch":
            q = q.textSearch(key, operatorValue as string) as typeof q;
            break;
          // match 메서드는 파라미터가 하나만 필요합니다
          case "match":
            q = q.match(operatorValue as Record<string, unknown>) as typeof q;
            break;
        }
      }
    } else {
      q = q.eq(key, value) as typeof q;
    }
  }

  return q as unknown as TQuery;
}

/**
 * 정렬 적용 헬퍼 함수
 *
 * 쿼리에 정렬 옵션을 적용합니다.
 */
export function applyOrderBy<TQuery>(
  query: TQuery,
  orderBy?: OrderByOptions,
): TQuery {
  if (!orderBy) return query;

  return (query as unknown as Record<string, (...args: unknown[]) => TQuery>).order(orderBy.column, {
    ascending: orderBy.ascending !== false,
  });
}

/**
 * 페이지네이션 적용 헬퍼 함수
 *
 * 쿼리에 페이지네이션 옵션을 적용합니다.
 */
export function applyPagination<TQuery>(
  query: TQuery,
  limit?: number,
  offset?: number,
): TQuery {
  let result = query as unknown as Record<string, (...args: unknown[]) => unknown>;

  if (limit !== undefined) {
    result = result.limit(limit) as typeof result;
  }

  if (offset !== undefined) {
    result = result.range(offset, offset + (limit || 10) - 1) as typeof result;
  }

  return result as unknown as TQuery;
}

/**
 * 캐시 태그 생성 함수
 *
 * 특정 리소스나 쿼리에 대한 캐시 태그를 생성합니다.
 * 캐시 무효화 시 이 태그를 사용하여 관련 캐시만 무효화할 수 있습니다.
 */
export function generateCacheTag(
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

// RPC 상수 이름을 타입 안전하게 소문자 함수 이름으로 변환하는 함수
export function getRpcFunctionName(
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
