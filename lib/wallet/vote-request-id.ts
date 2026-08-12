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
 *
 * 남는 위험은 아래 3가지가 **모두** 겹칠 때뿐이다.
 *   1. sessionStorage 가 읽기·쓰기를 모두 거부
 *   2. Edge 가 커밋한 뒤 응답만 유실
 *   3. **JS realm 소실** 후 같은 payload 재시도 — 전체 새로고침, 또는 다른 탭에서의 재시도
 *      (Map 과 sessionStorage 는 탭마다 독립이다)
 * 이 경우 새 id 가 발급돼 이중 차감이 가능하다.
 *
 * 저장소 실패 시 제출 자체를 막는(fail-closed) 선택지도 있었으나 채택하지 않았다.
 * fail-closed 는 저장소를 못 쓰는 사용자의 투표를 **상시** 차단하는 확정 손실인 반면,
 * 위 잔여 위험은 그 사용자 집합의 부분집합에서 3중 조건이 겹칠 때만 발생한다.
 * Map 이 커버하는 언마운트/재오픈 경로가 실제 보고된 이중 차감 시나리오이고, 그건 닫혔다.
 */

const KEY_PREFIX = 'picnic:vote-request-id:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 삭제에 실패한 저장소 항목을 무효화하는 표식. UUID 형식이 아니라 acquire 가 무시한다. */
const RELEASED_TOMBSTONE = 'released';

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
    const s = window.sessionStorage;
    s.removeItem(k);

    // removeItem 이 throw 하거나 조용히 no-op 하는 저장소가 있다. 그대로 두면 완료된 id 가
    // 남아, 다음에 같은 payload 로 "새로" 투표할 때 readStored 가 그 id 를 되살린다.
    // 그러면 Edge 가 이전 성공을 replay 해 UI 는 성공인데 표는 늘지 않는다.
    // 지우지 못했으면 UUID 가 아닌 tombstone 으로 덮어 acquire 가 무시하게 만든다.
    if (s.getItem(k) !== null) {
      s.setItem(k, RELEASED_TOMBSTONE);
    }
  } catch {
    // 저장소 접근 자체가 막힌 경우. Map 은 이미 비웠고, 저장소 값은 읽을 수도 없으므로
    // acquire 의 readStored 도 실패해 새 id 가 발급된다 — 되살아날 경로가 없다.
  }
}

/** 테스트 전용 — 모듈 스코프 Map 초기화 */
export function __resetVoteRequestIdMemory(): void {
  memoryStore.clear();
}
