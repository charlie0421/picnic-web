import { describe, it, expect } from 'vitest';
import { nextRequestId } from '@/components/client/vote/dialogs/useVoteDialog';

describe('nextRequestId', () => {
  it('최초 제출 시 새 UUID 를 발급한다', () => {
    const next = nextRequestId(null, 10, 5);
    expect(next.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('동일 파라미터 재시도면 같은 id 를 유지한다 (멱등)', () => {
    const first = nextRequestId(null, 10, 5);
    expect(nextRequestId(first, 10, 5).id).toBe(first.id);
  });
  it('amount 나 item 이 바뀌면 새 id 를 발급한다', () => {
    const first = nextRequestId(null, 10, 5);
    expect(nextRequestId(first, 10, 7).id).not.toBe(first.id);
    expect(nextRequestId(first, 11, 5).id).not.toBe(first.id);
  });
});
