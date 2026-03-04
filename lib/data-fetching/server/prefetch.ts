/**
 * 데이터 프리페칭 함수
 *
 * 사용자가 방문할 가능성이 있는 페이지의 데이터를 미리 가져와 캐시에 저장합니다.
 */

import type { TableName, QueryOptions } from "./types";
import { getById } from "./query";
import { getList } from "./query";

/**
 * 데이터 프리페칭 함수
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
