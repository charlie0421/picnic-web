/**
 * 서버 측 Supabase 데이터 변경(CUD) 함수
 *
 * 삽입, 수정, 삭제, 사용자 지정 쿼리 함수들을 제공합니다.
 * React.cache를 사용하여 동일한 렌더링 사이클 내에서 캐싱됩니다.
 */

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { handleSupabaseError } from "@/lib/supabase/error";
import {
  type TableName,
  type TableInsert,
  type TableUpdate,
  type TableRow,
  type QueryOptions,
  DataFetchingError,
  ErrorType,
  DEFAULT_OPTIONS,
} from "./types";

/**
 * 제네릭 테이블 연산의 컬럼명 브리지.
 *
 * `T extends TableName` 유니온에서는 `.eq(asTableColumn('id'), ...)` 의 컬럼명도 유니온 전 멤버에
 * 대해 동시에 유효해야 해서 좁혀지지 않는다. 개별 테이블로 호출하면 문제가 없다.
 * 값 브리지(asTablePayload)와 같은 이유·같은 격리 전략이다.
 */
const asTableColumn = <V,>(value: V) => value as never;

/**
 * 제네릭 테이블 연산의 타입 브리지.
 *
 * `supabase.from(table)` 에서 `table` 이 `T extends TableName` 유니온이면
 * TypeScript 는 `.insert()`/`.update()`/`.eq()` 의 인자를 유니온 전 멤버에 대해
 * 동시에 만족시키라고 요구해 좁히지 못한다. 개별 테이블로 호출하면 문제가 없다.
 *
 * 공개 API 는 이미 `TableInsert<T>`/`TableUpdate<T>`/`TableRow<T>` 로 호출자에게
 * 타입 안전하므로, 좁혀지지 않는 내부 경계에만 캐스트를 둔다.
 * `lib/supabase/typed-rpc.ts` 가 RPC 에 대해 쓰는 것과 같은 격리 전략이다.
 */
const asTablePayload = <V,>(value: V) => value as never;
const asTableRow = <V,>(value: unknown) => value as V;

/**
 * 데이터 삽입 (레거시 - RLS 호환성을 위해 insertDataSafe 사용 권장)
 */
export const insertData = cache(async <T extends TableName>(
  table: T,
  data: TableInsert<T>,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>> => {
  const supabase = await createServerSupabaseClient();
  const { data: insertedData, error } = await supabase
    .from(table)
    .insert(asTablePayload(data))
    .select()
    .single();

  if (error) {
    console.error(`데이터 삽입 오류 (${table}):`, error);

    // RLS 정책 관련 에러 처리 추가
    const appError = handleSupabaseError(error);
    throw appError;
  }

  return asTableRow<TableRow<T>>(insertedData);
});

/**
 * 데이터 업데이트 (레거시 - RLS 호환성을 위해 updateDataSafe 사용 권장)
 */
export const updateData = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  data: TableUpdate<T>,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>> => {
  const supabase = await createServerSupabaseClient();
  const { data: updatedData, error } = await supabase
    .from(table)
    .update(asTablePayload(data))
    .eq(asTableColumn("id"), asTablePayload(id))
    .select()
    .single();

  if (error) {
    console.error(`데이터 업데이트 오류 (${table} ID:${id}):`, error);

    // RLS 정책 관련 에러 처리 추가
    const appError = handleSupabaseError(error);
    throw appError;
  }

  return asTableRow<TableRow<T>>(updatedData);
});

/**
 * 데이터 삭제 (레거시 - RLS 호환성을 위해 deleteDataSafe 사용 권장)
 */
export const deleteData = cache(async <T extends TableName>(
  table: T,
  id: string | number,
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>[]> => {
  const supabase = await createServerSupabaseClient();
  const { data: deletedData, error } = await supabase
    .from(table)
    .delete()
    .eq(asTableColumn("id"), asTablePayload(id))
    .select();

  if (error) {
    console.error(`데이터 삭제 오류 (${table} ID:${id}):`, error);

    // RLS 정책 관련 에러 처리 추가
    const appError = handleSupabaseError(error);
    throw appError;
  }

  return asTableRow<TableRow<T>[]>(deletedData);
});

/**
 * 데이터 일괄 삽입
 */
export const bulkInsert = cache(async <T extends TableName>(
  table: T,
  data: TableInsert<T>[],
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>[]> => {
  if (!data.length) return [];

  const supabase = await createServerSupabaseClient();
  const { data: insertedData, error } = await supabase
    .from(table)
    .insert(asTablePayload(data))
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

  return asTableRow<TableRow<T>[]>(insertedData);
});

/**
 * 데이터 일괄 업데이트
 */
export const bulkUpdate = cache(async <T extends TableName>(
  table: T,
  data: { id: string | number; data: TableUpdate<T> }[],
  options: QueryOptions = DEFAULT_OPTIONS,
): Promise<TableRow<T>[]> => {
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
 * 사용자 지정 쿼리 실행
 */
export const executeCustomQuery = cache(async <T>(
  queryFn: (
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ) => Promise<PostgrestSingleResponse<T>>,
): Promise<T> => {
  try {
    const supabase = await createServerSupabaseClient();
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

    return asTableRow<T>(data);
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
