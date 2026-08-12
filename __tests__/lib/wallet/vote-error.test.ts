import { describe, it, expect } from 'vitest';
import { mapVoteEdgeError } from '@/lib/wallet/vote-error';

describe('mapVoteEdgeError', () => {
  it('에러 body 의 error 문자열을 그대로 코드로 쓴다', () => {
    expect(mapVoteEdgeError(409, { error: 'WALLET_INSUFFICIENT_BALANCE' }))
      .toEqual({ status: 409, error: 'WALLET_INSUFFICIENT_BALANCE' });
  });
  it('body 를 못 읽으면 status 만 유지하고 일반 메시지', () => {
    expect(mapVoteEdgeError(500, undefined))
      .toEqual({ status: 500, error: 'VOTE_SUBMIT_FAILED' });
  });
  it('status 가 없으면 500', () => {
    expect(mapVoteEdgeError(undefined as unknown as number, null).status).toBe(500);
  });
});
