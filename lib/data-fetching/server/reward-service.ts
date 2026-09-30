import 'server-only';

/**
 * 보상 관련 데이터 서비스
 * 
 * 서버 컴포넌트에서 보상 데이터를 조회하는 서비스 함수들입니다.
 * 각 함수는 React의 cache를 사용하여 요청을 캐싱합니다.
 */

import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CacheOptions } from './fetchers';
import { Reward } from '@/types/interfaces';

// 공개 Supabase 클라이언트 생성 (쿠키 없음 - ISR/정적 생성 호환)
function createPublicClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );
}

// 기본 보상 테이블 조회 쿼리 (서버 컴포넌트용)
const DEFAULT_REWARD_QUERY = `
  *,
  vote_reward (
    vote_id,
    vote:vote_id (
      id,
      title,
      main_image
    )
  )
`;

/**
 * 보상 목록 조회 함수
 */
export const getRewards = cache(async (
  options?: CacheOptions
): Promise<Reward[]> => {
  const supabase = createPublicClient(); // 공개 클라이언트 사용 (쿠키 없음)
  
  const { data, error } = await supabase
    .from('reward')
    .select(DEFAULT_REWARD_QUERY)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Reward fetch error:', error);
    throw new Error(error.message);
  }
  
  if (!data || data.length === 0) {
    return [];
  }
  
  // 응답 데이터 포맷팅
  return data.map((reward: any) => ({
    ...reward,
    deletedAt: reward.deleted_at,
    createdAt: reward.created_at,
    updatedAt: reward.updated_at,
    mainImage: reward.main_image,
    votes: reward.vote_reward
      ? reward.vote_reward.map((vr: any) => vr.vote).filter(Boolean)
      : [],
  }));
});

// PostgreSQL 이 "입력값이 잘못됐다" 고 돌려주는 코드. 조회 장애가 아니라 그런 리워드가 없다는 뜻이다.
// 22P02: invalid_text_representation(/rewards/abc), 22003: numeric_value_out_of_range(아주 큰 숫자).
const INVALID_ID_ERROR_CODES = new Set(['22P02', '22003']);

/**
 * 보상 상세 조회 함수
 *
 * /[lang]/rewards/[id] 는 ISR 이고, 페이지는 이 함수의 결과로 두 경우를 구분한다.
 * - null: 없는 리워드 → 404 (캐시돼도 되는 정상 결과)
 * - 예외: 조회 장애 → 전파해서 캐시하지 않는다 (Next 가 마지막 정상 페이지를 유지)
 * 잘못된 id 는 장애가 아니므로 null 이다. 그렇지 않으면 /rewards/abc 가 500 이 된다.
 */
export const getRewardById = cache(async (
  id: string,
  options?: CacheOptions
): Promise<Reward | null> => {
  // reward.id 는 양의 정수다. 정수가 아닌 값은 조회하지 않는다.
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return null;
  }

  const supabase = createPublicClient(); // 공개 클라이언트 사용 (쿠키 없음)
  
  const { data, error } = await supabase
    .from('reward')
    .select(DEFAULT_REWARD_QUERY)
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116' || INVALID_ID_ERROR_CODES.has(error.code)) {
      // 데이터가 없음
      return null;
    }
    console.error(`Reward ID ${id} fetch error:`, error);
    throw new Error(error.message);
  }
  
  if (!data) {
    return null;
  }
  
  // 응답 데이터 포맷팅
  return {
    ...data,
    deletedAt: data.deleted_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    mainImage: data.main_image,
    votes: data.vote_reward
      ? data.vote_reward.map((vr: any) => vr.vote).filter(Boolean)
      : [],
  } as Reward;
});
