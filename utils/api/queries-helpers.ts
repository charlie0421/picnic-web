import { Vote, Reward } from "@/types/interfaces";

export const SUPABASE_TIMEOUT_MS = 4000;
export const GET_REWARDS_TIMEOUT_MS = 7000;
/**
 * `next build` 의 프리렌더가 조회 하나를 기다리는 최소 시간.
 * 런타임 예산(4~7초)은 ISR 재생성이 빨리 실패해 마지막 정상 페이지를 유지하게 하려는 값이다. 빌드에는 맞지 않는다:
 * 프리렌더가 실패하면 배포 전체가 실패하고, 빌드 머신(미국)에서 본 Supabase 응답은 가끔 수 초씩 걸린다
 * (2026-09-30: 8.6초·3.2초·5.7초가 이어져 7초 예산이 세 번 연속 넘었다).
 * Next 의 페이지 생성 제한(next.config.js 의 staticPageGenerationTimeout, 120초)보다는 짧아야 한다.
 */
export const BUILD_QUERY_TIMEOUT_MS = 30000;
export const DEFAULT_REWARD_LIMIT = 24;
export const REWARD_SELECT_COLUMNS = `
  id,
  title,
  thumbnail,
  location,
  location_images,
  overview_images,
  size_guide,
  size_guide_images,
  "order",
  created_at,
  updated_at,
  deleted_at
`;
export const FALLBACK_VOTES: Vote[] = [];
export const FALLBACK_REWARDS: Reward[] = [
  {
    id: -1,
    title: {
      ko: '샘플 리워드',
      en: 'Sample Reward',
    } as unknown as string,
    thumbnail: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    location: null,
    location_images: null,
    order: 0,
    overview_images: null,
    size_guide: null,
    size_guide_images: null,
  },
];

export async function withTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  label: string,
  timeoutMs: number = SUPABASE_TIMEOUT_MS
): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        console.warn(`[supabase-timeout] ${label} exceeded ${timeoutMs}ms. Using fallback data.`);
        resolve(fallback);
      }, timeoutMs);
    }),
  ]);
}

/**
 * 시간 예산 안에 끝나지 않으면 진행 중인 요청을 끊고 예외로 끝낸다. ISR 페이지의 조회에 쓴다.
 * - 폴백으로 대체하지 않는다(withTimeout 과 다른 점). 폴백은 캐시에 저장돼 정상 페이지를 덮는다.
 *   예외면 Next 가 마지막 정상 페이지를 유지한다.
 * - 요청을 끊는다. 포기한 요청이 살아 있으면 Next 의 fetch 잠금(같은 요청을 직렬화한다)을 계속 쥐고 있어
 *   프리렌더 재시도가 그 뒤에서 기다리다 다시 시간 예산을 넘긴다. run 은 받은 signal 을 조회에 연결해야 한다
 *   (postgrest-js 의 `.abortSignal(signal)`).
 *   한계: Next 는 stale 한 fetch 캐시 항목을 다시 받을 때 signal 을 빼고 요청한다(patch-fetch 의
 *   doOriginalFetch(true)). 런타임의 조회는 캐시되지 않아 해당하지 않고(next start 에서 7초에 끊기는 것을 확인),
 *   빌드에서 같은 빌드가 만든 항목이 페이지의 revalidate 보다 오래됐을 때만 해당한다.
 * - `next build` 중에는 예산을 BUILD_QUERY_TIMEOUT_MS 이상으로 늘린다.
 */
export async function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  label: string,
  runtimeTimeoutMs: number = SUPABASE_TIMEOUT_MS
): Promise<T> {
  // Next 는 빌드(정적 생성 워커 포함)에서 NEXT_PHASE 를 이 값으로 둔다.
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const timeoutMs = isBuild ? Math.max(runtimeTimeoutMs, BUILD_QUERY_TIMEOUT_MS) : runtimeTimeoutMs;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      run(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`[supabase-timeout] ${label} exceeded ${timeoutMs}ms`);
          // 먼저 이 예외로 끝내고 요청을 끊는다 — 끊긴 요청이 내는 오류가 아니라 시간 초과가 원인으로 남는다.
          reject(error);
          // 사유를 넘기지 않는다. 기본 사유(AbortError)여야 postgrest-js 가 끊긴 요청으로 보고 멈춘다.
          // 다른 오류를 사유로 주면 네트워크 오류로 보고 이미 끊긴 신호로 세 번 더 시도한다.
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// API 요청 실패 로깅 및 디버깅을 위한 함수
export const logRequestError = (error: unknown, functionName: string) => {
  console.error(`[API 오류] ${functionName}:`, error);
  return error;
};
