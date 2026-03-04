/**
 * 서버 측 Supabase 데이터 페칭 타입 정의
 *
 * 상수, 타입, enum, 에러 클래스를 포함합니다.
 */

import { Database } from "@/types/supabase";
import { PostgrestError } from "@supabase/supabase-js";

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
export type FilterOptions = Record<string, unknown>;

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
export const DEFAULT_OPTIONS: QueryOptions = {
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
