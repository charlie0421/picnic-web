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


// API 요청 실패 로깅 및 디버깅을 위한 함수
export const logRequestError = (error: unknown, functionName: string) => {
  console.error(`[API 오류] ${functionName}:`, error);
  return error;
};
