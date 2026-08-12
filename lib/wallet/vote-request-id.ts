import { randomUUIDSafe } from '@/lib/uuid';

/**
 * 투표 제출의 멱등 키(`request_id`) 관리.
 *
 * 서버(voting-v2)는 같은 `request_id` 로 온 재시도를 같은 작업으로 재생한다.
 * 따라서 "같은 사용자가 같은 투표에 같은 수량을 다시 제출"하는 동안에는 **같은 id 를 유지**해야
 * 응답 유실 후 재시도에서 이중 차감이 나지 않는다.
 *
 * 컴포넌트 내 useRef 로는 부족하다. 투표 다이얼로그는 조건부 렌더라서 사용자가 오류를 보고
 * 창을 닫았다 다시 열면 언마운트되며 ref 가 사라지고, 새 id 가 발급돼 이중 차감이 발생한다.
 * 그래서 sessionStorage 에 payload 키로 보관하고, **확정 성공 시에만** 비운다.
 *
 * sessionStorage 를 못 쓰는 환경(프라이빗 모드, 저장소 차단)에서는 매번 새 id 를 만들어
 * 기존 동작으로 degrade 한다. 그 경우 멱등이 보장되지 않는 것은 이 모듈 도입 이전과 같다.
 */

const KEY_PREFIX = 'picnic:vote-request-id:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VoteRequestKey {
  userId: string;
  voteId: number;
  voteItemId: number;
  amount: number;
}

function storageKey({ userId, voteId, voteItemId, amount }: VoteRequestKey): string {
  // payload 4요소가 모두 같을 때만 같은 id 를 재사용한다.
  // 하나라도 다르면 서버가 OP_IDEMPOTENCY_CONFLICT 를 반환하므로 반드시 키에 포함해야 한다.
  return `${KEY_PREFIX}${userId}:${voteId}:${voteItemId}:${amount}`;
}

function getStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.sessionStorage;
    // 프라이빗 모드 등에서 접근 시 throw 하는 브라우저가 있어 실제 쓰기까지 확인한다.
    const probe = `${KEY_PREFIX}__probe__`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * 이 payload 에 대한 멱등 키를 가져온다. 없으면 새로 만들어 보관한다.
 * 재시도에서 같은 payload 로 다시 호출하면 같은 값을 돌려준다.
 */
export function acquireVoteRequestId(key: VoteRequestKey): string {
  const store = getStore();
  if (!store) return randomUUIDSafe();

  const k = storageKey(key);
  try {
    const existing = store.getItem(k);
    if (existing && UUID_RE.test(existing)) return existing;

    const id = randomUUIDSafe();
    store.setItem(k, id);
    return id;
  } catch {
    return randomUUIDSafe();
  }
}

/**
 * 서버가 성공을 확정한 뒤에만 호출한다. 실패·타임아웃에서는 절대 비우지 말 것 —
 * 그 상태에서 비우면 다음 시도가 새 id 를 받아 이중 차감이 가능해진다.
 */
export function releaseVoteRequestId(key: VoteRequestKey): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(storageKey(key));
  } catch {
    /* 무시 — 남아 있어도 다음 성공에서 정리된다 */
  }
}
