import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUUIDSafe } from '@/lib/uuid';

// 서버(app/api/vote/submit/route.ts)가 쓰는 것과 동일한 정규식
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const realCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: realCrypto,
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
});

function stubCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('randomUUIDSafe', () => {
  it('crypto.randomUUID 가 있으면 그대로 사용한다', () => {
    const spy = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    stubCrypto({ randomUUID: spy });

    expect(randomUUIDSafe()).toBe('11111111-1111-4111-8111-111111111111');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('secure context 가 아니라 randomUUID 가 없어도 유효한 v4 UUID 를 만든다', () => {
    // getRandomValues 만 있는 환경 (http 접속 등)
    stubCrypto({
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = i * 7 + 3;
        return arr;
      },
    });

    const id = randomUUIDSafe();
    expect(id).toMatch(UUID_RE);
    expect(id[14]).toBe('4'); // version nibble
    expect(['8', '9', 'a', 'b']).toContain(id[19]); // variant nibble
  });

  it('crypto 자체가 없어도 유효한 v4 UUID 를 만든다', () => {
    stubCrypto(undefined);

    const id = randomUUIDSafe();
    expect(id).toMatch(UUID_RE);
    expect(id[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('연속 호출이 서로 다른 값을 만든다', () => {
    stubCrypto(undefined);

    const ids = new Set(Array.from({ length: 200 }, () => randomUUIDSafe()));
    expect(ids.size).toBe(200);
  });
});
