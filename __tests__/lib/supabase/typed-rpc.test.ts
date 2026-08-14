import { describe, it, expect } from 'vitest';
import { callRpc } from '@/lib/supabase/typed-rpc';

/**
 * 프로덕션 회귀 재현 테스트.
 *
 * `const rpc = supabase.rpc` 로 함수만 뽑아 호출하면 this 바인딩이 끊겨
 * PostgrestClient 내부에서 "Cannot read properties of undefined (reading 'rest')"
 * 로 죽는다. 그러면 /api/user/wallet 이 500 이 되어 지갑이 전혀 로드되지 않는다.
 *
 * 기존 목은 `vi.fn()` 이라 this 를 쓰지 않아 이 결함을 통과시켰다. 그래서 여기서는
 * **this 에 민감한** 가짜 클라이언트를 쓴다. 메서드로 호출되지 않으면 던진다.
 */
function makeThisSensitiveClient(result: { data: unknown; error: unknown }) {
  const calls: Array<{ name: string; params: unknown }> = [];
  const client = {
    __isClient: true as const,
    calls,
    rpc(this: { __isClient?: true } | undefined, name: string, params?: unknown) {
      // 실제 supabase-js 는 this.rest 를 읽는다. 언바인딩 호출이면 this 가 undefined 다.
      if (!this || this.__isClient !== true) {
        throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      }
      calls.push({ name, params });
      return Promise.resolve(result);
    },
  };
  return client;
}

describe('callRpc — this 바인딩', () => {
  it('인자 없는 RPC 를 메서드로 호출한다', async () => {
    const client = makeThisSensitiveClient({ data: { star: '1' }, error: null });

    const res = await callRpc(client as never, 'get_wallet_summary');

    expect(res.error).toBeNull();
    expect(res.data).toEqual({ star: '1' });
    expect(client.calls).toEqual([{ name: 'get_wallet_summary', params: undefined }]);
  });

  it('인자 있는 RPC 를 메서드로 호출하고 인자를 그대로 전달한다', async () => {
    const client = makeThisSensitiveClient({ data: { items: [] }, error: null });

    const res = await callRpc(client as never, 'get_currency_history', {
      p_currency: 'COTTON_CANDY',
      p_cursor: null as unknown as string,
      p_limit: 20,
    });

    expect(res.error).toBeNull();
    expect(client.calls).toEqual([
      {
        name: 'get_currency_history',
        params: { p_currency: 'COTTON_CANDY', p_cursor: null, p_limit: 20 },
      },
    ]);
  });

  it('RPC 오류를 그대로 돌려준다', async () => {
    const err = { message: 'boom', details: '', hint: '', code: 'P0001' };
    const client = makeThisSensitiveClient({ data: null, error: err });

    const res = await callRpc(client as never, 'get_wallet_summary');

    expect(res.data).toBeNull();
    expect(res.error).toBe(err);
  });
});
