/**
 * 서버 측 Supabase 데이터 페칭 유틸리티
 *
 * 서버 컴포넌트에서 Supabase를 사용한 데이터 페칭을 위한 유틸리티 함수들을 제공합니다.
 * 이 파일의 모든 함수들은 서버 컴포넌트에서만 사용해야 합니다.
 *
 * React.cache를 사용하여 모든 함수가 동일한 렌더링 사이클 내에서 캐싱됩니다.
 * 이를 통해 중복 요청을 방지하고 성능을 최적화합니다.
 *
 * 이 파일은 배럴 모듈로, 각 하위 모듈에서 모든 export를 재노출합니다.
 */

export * from "./types";
export * from "./query-helpers";
export * from "./query";
export * from "./mutation";
export * from "./safe-operations";
export * from "./version";
export * from "./prefetch";
