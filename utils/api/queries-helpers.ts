import { Vote, Reward } from "@/types/interfaces";

export const SUPABASE_TIMEOUT_MS = 4000;
export const GET_REWARDS_TIMEOUT_MS = 7000;
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
 * 시간 안에 끝나지 않으면 예외로 끝낸다. ISR 페이지의 조회에 쓴다 — withTimeout 처럼 폴백으로
 * 대체하면 그 폴백이 캐시에 저장돼 정상 페이지를 덮는다. 예외면 Next 가 마지막 정상 페이지를 유지한다.
 */
export async function rejectOnTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = SUPABASE_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`[supabase-timeout] ${label} exceeded ${timeoutMs}ms`)),
          timeoutMs,
        );
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
