/**
 * `callRpc` 의 타입 회귀 픽스처. 런타임에 import 되지 않고 `tsc --noEmit` 으로만 검증된다.
 * (`__tests__/**` 는 tsconfig 에서 제외돼 있어 Vitest 파일로는 이 검사를 할 수 없다.)
 *
 * 각 `@ts-expect-error` 는 "여기서 반드시 컴파일 오류가 나야 한다"는 단언이다.
 * 오류가 나지 않으면 tsc 가 "unused '@ts-expect-error' directive" 로 실패한다.
 * 즉 이 파일은 RPC 호출이 무타입으로 되돌아가는 회귀를 자동으로 잡는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { callRpc } from './typed-rpc';

declare const supabase: SupabaseClient<any, any, any>;

export async function rpcTypeContract() {
  // 정상 호출은 통과해야 한다.
  const summary = await callRpc(supabase, 'get_wallet_summary');
  const page = await callRpc(supabase, 'get_currency_history', {
    p_currency: 'COTTON_CANDY',
    p_cursor: 'cursor',
    p_limit: 20,
  });

  // 반환 타입이 실제로 흘러야 한다 (any 면 아래 접근이 조용히 통과한다).
  // @ts-expect-error wallet_summary 에 없는 필드
  summary.data?.nonexistent_balance_field;
  // @ts-expect-error wallet_currency_history_page 에 없는 필드
  page.data?.nonexistent_page_field;

  // 아래 호출들은 반드시 컴파일 오류여야 한다.
  // (@ts-expect-error 는 바로 다음 '줄'만 덮으므로 호출을 한 줄로 둔다.)

  // @ts-expect-error 스키마에 없는 RPC 이름
  await callRpc(supabase, 'this_rpc_does_not_exist_at_all', { nonsense: 1 });

  // @ts-expect-error 인자 이름 오타 (p_limit -> p_limitt)
  await callRpc(supabase, 'get_currency_history', { p_currency: 'STAR_CANDY', p_cursor: 'c', p_limitt: 20 });

  // @ts-expect-error 인자 타입 불일치 (p_limit 은 number)
  await callRpc(supabase, 'get_currency_history', { p_currency: 'STAR_CANDY', p_cursor: 'c', p_limit: '20' });

  // @ts-expect-error wallet_currency enum 에 없는 통화
  await callRpc(supabase, 'get_currency_history', { p_currency: 'GOLD_CANDY', p_cursor: 'c', p_limit: 20 });
}
