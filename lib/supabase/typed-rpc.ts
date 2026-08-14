import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/**
 * RPC 호출 지점에 생성 타입을 강제하는 좁은 헬퍼.
 *
 * `createSupabaseServerClient()` 는 `createServerClient` 를 제네릭 없이 호출하므로
 * `Database = any` 로 추론된다. 그 결과 `supabase.rpc('없는_함수', { 아무거나: 1 })`
 * 조차 컴파일을 통과한다. 클라이언트 전체에 제네릭을 붙이는 것이 정공법이지만,
 * 현재 소비자 25곳(대부분 곧 삭제될 비-VOTE 코드)에서 400건 넘는 타입 오류가
 * 발생하므로 그 마이그레이션은 비-VOTE 코드 정리 이후로 미룬다.
 *
 * 그때까지 이 헬퍼가 **호출 지점**의 함수명·인자·반환 타입을 검사한다.
 * 캐스트는 이 파일 한 줄에만 격리된다.
 */
type Functions = Database['public']['Functions'];

export type RpcName = keyof Functions;
export type RpcArgs<K extends RpcName> = Functions[K]['Args'];
export type RpcReturns<K extends RpcName> = Functions[K]['Returns'];

type RpcResult<K extends RpcName> =
  | { data: RpcReturns<K>; error: null }
  | { data: null; error: PostgrestError };

/**
 * 인자가 있는 RPC 를 호출한다. 함수명이 스키마에 없거나 인자 모양이 다르면 컴파일 실패한다.
 */
export async function callRpc<K extends RpcName>(
  supabase: SupabaseClient<any, any, any>,
  fn: K,
  args: RpcArgs<K>,
): Promise<RpcResult<K>>;
/**
 * 인자가 없는 RPC(`Args: never`)를 호출한다.
 */
export async function callRpc<K extends RpcName>(
  supabase: SupabaseClient<any, any, any>,
  fn: Functions[K]['Args'] extends never ? K : never,
): Promise<RpcResult<K>>;
export async function callRpc<K extends RpcName>(
  supabase: SupabaseClient<any, any, any>,
  fn: K,
  args?: RpcArgs<K>,
): Promise<RpcResult<K>> {
  // 여기가 유일한 캐스트 지점이다. 위 오버로드가 호출 지점을 이미 검사했다.
  // rpc() 는 Promise 가 아니라 thenable 인 PostgrestFilterBuilder 를 반환하므로
  // 직접 캐스트가 겹치지 않는다. unknown 을 거친다.
  //
  // 반드시 **메서드로** 호출해야 한다. `const rpc = supabase.rpc` 처럼 함수만 뽑아
  // 호출하면 this 바인딩이 끊겨 PostgrestClient 내부에서
  // "Cannot read properties of undefined (reading 'rest')" 로 죽는다.
  const client = supabase as unknown as {
    rpc: (
      name: string,
      params?: unknown,
    ) => Promise<{ data: unknown; error: PostgrestError | null }>;
  };

  const { data, error } =
    args === undefined ? await client.rpc(fn as string) : await client.rpc(fn as string, args);

  if (error) {
    return { data: null, error };
  }
  return { data: data as RpcReturns<K>, error: null };
}
