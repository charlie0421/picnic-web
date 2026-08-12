import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { acquireVoteRequestId, releaseVoteRequestId } from '@/lib/wallet/vote-request-id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KEY = { userId: 'user-1', voteId: 100, voteItemId: 10, amount: 5 };

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('acquireVoteRequestId', () => {
  it('유효한 UUID 를 반환한다', () => {
    expect(acquireVoteRequestId(KEY)).toMatch(UUID_RE);
  });

  it('같은 payload 로 다시 부르면 같은 id 를 준다 (재시도 멱등)', () => {
    const first = acquireVoteRequestId(KEY);
    const second = acquireVoteRequestId(KEY);
    expect(second).toBe(first);
  });

  it('다이얼로그가 언마운트됐다 다시 열려도 같은 id 를 유지한다', () => {
    // 컴포넌트 ref 와 달리 sessionStorage 는 언마운트를 넘어 살아남는다.
    // 이 동작이 없으면 오류 후 창을 닫았다 다시 열 때 새 id 가 발급돼 이중 차감이 가능하다.
    const before = acquireVoteRequestId(KEY);
    // (언마운트/재마운트는 모듈 상태를 쓰지 않으므로 그대로 다시 호출하면 된다)
    const after = acquireVoteRequestId(KEY);
    expect(after).toBe(before);
  });

  it('payload 4요소 중 하나라도 다르면 다른 id 를 준다', () => {
    const base = acquireVoteRequestId(KEY);
    expect(acquireVoteRequestId({ ...KEY, voteId: 101 })).not.toBe(base);
    expect(acquireVoteRequestId({ ...KEY, voteItemId: 11 })).not.toBe(base);
    expect(acquireVoteRequestId({ ...KEY, amount: 6 })).not.toBe(base);
    expect(acquireVoteRequestId({ ...KEY, userId: 'user-2' })).not.toBe(base);
  });

  it('저장된 값이 손상돼 있으면 새 UUID 로 대체한다', () => {
    acquireVoteRequestId(KEY);
    const storageKey = Object.keys(window.sessionStorage).find((k) =>
      k.startsWith('picnic:vote-request-id:'),
    )!;
    window.sessionStorage.setItem(storageKey, 'garbage');

    const id = acquireVoteRequestId(KEY);
    expect(id).toMatch(UUID_RE);
    expect(id).not.toBe('garbage');
  });

  it('sessionStorage 를 못 쓰면 예외 없이 새 UUID 로 degrade 한다', () => {
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const id = acquireVoteRequestId(KEY);
    expect(id).toMatch(UUID_RE);
  });
});

describe('releaseVoteRequestId', () => {
  it('성공 확정 후 비우면 다음 제출은 새 id 를 받는다', () => {
    const first = acquireVoteRequestId(KEY);
    releaseVoteRequestId(KEY);
    const second = acquireVoteRequestId(KEY);

    expect(second).toMatch(UUID_RE);
    expect(second).not.toBe(first);
  });

  it('다른 payload 의 키는 건드리지 않는다', () => {
    const a = acquireVoteRequestId(KEY);
    const b = acquireVoteRequestId({ ...KEY, amount: 6 });

    releaseVoteRequestId({ ...KEY, amount: 6 });

    expect(acquireVoteRequestId(KEY)).toBe(a);
    expect(acquireVoteRequestId({ ...KEY, amount: 6 })).not.toBe(b);
  });
});
