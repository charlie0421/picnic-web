import { randomUUIDSafe } from '@/lib/uuid';

/**
 * 투표 제출의 멱등 키(`request_id`) 관리.
 *
 * 서버(voting-v2)는 같은 `request_id` 로 온 재시도를 같은 작업으로 재생한다.
 * 따라서 "같은 사용자가 같은 투표에 같은 수량을 다시 제출"하는 동안에는 **같은 id 를 유지**해야
 * 응답 유실 후 재시도에서 이중 차감이 나지 않는다.
 *
 * 보관은 2단이다.
 * 1. 모듈 스코프 Map — 다이얼로그가 언마운트돼도(조건부 렌더로 닫았다 다시 열기) 살아남는다.
 * 2. sessionStorage — 새로고침·탭 복원까지 살아남는다.
 *
 * 저장소를 못 쓰는 환경(프라이빗 모드, 저장소 가득참)에서는 Map 만으로 동작한다.
 * 이 경우 "응답 유실 + 새로고침 + 재시도" 가 겹치면 멱등이 깨지지만, 저장소 실패를 이유로
 * 투표 자체를 막으면 정상 사용자의 가용성을 더 크게 해치므로 이 잔여 위험을 택했다.
 * (Map 이 커버하는 언마운트/재오픈 경로가 실제 보고된 이중 차감 시나리오다.)
 */

const KEY_PREFIX = 'picnic:vote-request-id:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 저장소가 없거나 실패해도 같은 페이지 안에서는 멱등을 유지한다. */
const memoryStore = new Map<string, string>();

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

/**
 * 읽기 전용 접근. **쓰기 probe 를 하지 않는다.**
 * 저장소가 가득 찬 상태에서 probe 를 먼저 하면 이미 저장돼 있던 멱등 키까지 못 읽게 된다.
 */
function readStored(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 저장 시도. 성공 여부는 read-back 으로 확인한다(조용히 삼키는 구현 대비). */
function persist(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.sessionStorage.setItem(key, value);
    return window.sessionStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

/**
 * 이 payload 에 대한 멱등 키를 가져온다. 없으면 새로 만들어 보관한다.
 * 재시도에서 같은 payload 로 다시 호출하면 같은 값을 돌려준다.
 */
export function acquireVoteRequestId(key: VoteRequestKey): string {
  const k = storageKey(key);

  // 1) 같은 페이지 안의 기존 값
  const inMemory = memoryStore.get(k);
  if (inMemory && UUID_RE.test(inMemory)) return inMemory;

  // 2) 저장소의 기존 값 — 쓰기 가능 여부와 무관하게 먼저 읽는다
  const stored = readStored(k);
  if (stored && UUID_RE.test(stored)) {
    memoryStore.set(k, stored);
    return stored;
  }

  // 3) 신규 발급. 저장 실패해도 Map 에는 반드시 남긴다.
  const id = randomUUIDSafe();
  memoryStore.set(k, id);
  persist(k, id);
  return id;
}

/**
 * 서버가 성공을 확정한 뒤에만 호출한다. 실패·타임아웃에서는 절대 비우지 말 것 —
 * 그 상태에서 비우면 다음 시도가 새 id 를 받아 이중 차감이 가능해진다.
 */
export function releaseVoteRequestId(key: VoteRequestKey): void {
  const k = storageKey(key);
  memoryStore.delete(k);
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(k);
  } catch {
    /* 무시 — Map 은 이미 비웠고, 저장소 잔여값은 다음 성공에서 정리된다 */
  }
}

/** 테스트 전용 — 모듈 스코프 Map 초기화 */
export function __resetVoteRequestIdMemory(): void {
  memoryStore.clear();
}
