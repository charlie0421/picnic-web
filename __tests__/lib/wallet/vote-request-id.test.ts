import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  acquireVoteRequestId,
  releaseVoteRequestId,
  __resetVoteRequestIdMemory,
} from '@/lib/wallet/vote-request-id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KEY = { userId: 'user-1', voteId: 100, voteItemId: 10, amount: 5 };

beforeEach(() => {
  window.sessionStorage.clear();
  __resetVoteRequestIdMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  __resetVoteRequestIdMemory();
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

  it('sessionStorage 쓰기가 막혀도 같은 페이지 안에서는 같은 id 를 유지한다', () => {
    // 저장 실패를 "매번 새 UUID" 로 degrade 하면 이중 차감이 조용히 되살아난다.
    // 모듈 스코프 Map 이 언마운트/재오픈 경로를 커버해야 한다.
    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const first = acquireVoteRequestId(KEY);
    const second = acquireVoteRequestId(KEY);

    expect(first).toMatch(UUID_RE);
    expect(second).toBe(first);
  });

  it('저장소가 가득 차도 이미 저장된 기존 키는 읽어서 재사용한다', () => {
    // 쓰기 probe 를 읽기보다 먼저 하면 이 경우 저장돼 있던 멱등 키를 잃는다.
    const original = acquireVoteRequestId(KEY);
    __resetVoteRequestIdMemory(); // 새 페이지 로드 상황 — Map 은 비고 저장소만 남음

    vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(acquireVoteRequestId(KEY)).toBe(original);
  });

  it('저장소 읽기가 throw 해도 예외 없이 동작한다', () => {
    vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    const first = acquireVoteRequestId(KEY);
    expect(first).toMatch(UUID_RE);
    expect(acquireVoteRequestId(KEY)).toBe(first);
  });

  it('새로고침(Map 초기화)에서도 저장소 값이 있으면 같은 id 를 유지한다', () => {
    const before = acquireVoteRequestId(KEY);
    __resetVoteRequestIdMemory();
    expect(acquireVoteRequestId(KEY)).toBe(before);
  });
});

describe('releaseVoteRequestId', () => {
  it('성공 확정 후 비우면 다음 제출은 새 id 를 받는다 (Map·저장소 모두 정리)', () => {
    const first = acquireVoteRequestId(KEY);
    releaseVoteRequestId(KEY);
    const second = acquireVoteRequestId(KEY);

    expect(second).toMatch(UUID_RE);
    expect(second).not.toBe(first);
    // Map 만 지우고 저장소를 남기면 다음 acquire 가 옛 id 를 되살린다
    __resetVoteRequestIdMemory();
    expect(acquireVoteRequestId(KEY)).not.toBe(first);
  });

  it('다른 payload 의 키는 건드리지 않는다', () => {
    const a = acquireVoteRequestId(KEY);
    const b = acquireVoteRequestId({ ...KEY, amount: 6 });

    releaseVoteRequestId({ ...KEY, amount: 6 });

    expect(acquireVoteRequestId(KEY)).toBe(a);
    expect(acquireVoteRequestId({ ...KEY, amount: 6 })).not.toBe(b);
  });
});
