/**
 * RLS 정책을 고려한 안전한 데이터 연산 함수
 *
 * 사용자 인증 상태를 확인하고 RLS 정책을 보완하여
 * 데이터 접근 권한을 관리합니다.
 */

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { handleSupabaseError } from "@/lib/supabase/error";
import {
  type TableName,
  type TableInsert,
  type TableUpdate,
  type TableRow,
  type FilterOperator,
  type QueryOptions,
  DataFetchingError,
  ErrorType,
  DEFAULT_OPTIONS,
} from "./types";
import { applyFilters, applyOrderBy, applyPagination } from "./query-helpers";

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
    const supabase = await createServerSupabaseClient();
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
  const supabase = await createServerSupabaseClient();

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
  const supabase = await createServerSupabaseClient();

  try {
    let query = supabase.from(table).select(columns);

    // 사용자별 데이터 필터링 (RLS 정책 보완)
    if (!userContext.isAdmin && userContext.isAuthenticated && userContext.userId) {
      // 사용자 소유 데이터만 조회하는 테이블들
      const userOwnedTables = ['vote_pick', 'vote_comment', 'user_profiles'];
      if (userOwnedTables.includes(table)) {
        query = query.eq('user_id', userContext.userId);
      }
    }

    // 필터, 정렬, 페이지네이션 적용
    query = applyFilters(query, filters);
    query = applyOrderBy(query, orderBy);
    query = applyPagination(query, limit, offset);

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
  data: TableInsert<T>,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>> => {
  const userContext = await getCurrentUserContext();

  if (!userContext.isAuthenticated) {
    throw new DataFetchingError(
      '로그인이 필요합니다.',
      ErrorType.UNAUTHORIZED,
      401,
    );
  }

  const supabase = await createServerSupabaseClient();

  // 사용자 소유 데이터에 user_id 자동 설정
  const userOwnedTables = ['vote_pick', 'vote_comment'];
  const mutableData = data as Record<string, unknown>;
  if (userOwnedTables.includes(table) && !mutableData.user_id && userContext.userId) {
    mutableData.user_id = userContext.userId;
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
  data: TableUpdate<T>,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>> => {
  const userContext = await getCurrentUserContext();

  if (!userContext.isAuthenticated) {
    throw new DataFetchingError(
      '로그인이 필요합니다.',
      ErrorType.UNAUTHORIZED,
      401,
    );
  }

  const supabase = await createServerSupabaseClient();

  try {
    let query = supabase
      .from(table)
      .update(data)
      .eq("id", id);

    // 사용자 소유 데이터는 추가 필터링
    const userOwnedTables = ['vote_pick', 'vote_comment', 'user_profiles'];
    if (userOwnedTables.includes(table) && !userContext.isAdmin && userContext.userId) {
      query = query.eq('user_id', userContext.userId);
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

/**
 * RLS 정책을 고려한 안전한 데이터 삭제
 */
export const deleteDataSafe = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>[]> => {
  const userContext = await getCurrentUserContext();

  if (!userContext.isAuthenticated) {
    throw new DataFetchingError(
      '로그인이 필요합니다.',
      ErrorType.UNAUTHORIZED,
      401,
    );
  }

  const supabase = await createServerSupabaseClient();

  try {
    let query = supabase
      .from(table)
      .delete()
      .eq("id", id);

    // 사용자 소유 데이터는 추가 필터링
    const userOwnedTables = ['vote_pick', 'vote_comment'];
    if (userOwnedTables.includes(table) && !userContext.isAdmin && userContext.userId) {
      query = query.eq('user_id', userContext.userId);
    }

    const { data: deletedData, error } = await query
      .select();

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
