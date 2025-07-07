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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

/**
 * 보상 상세 조회 함수
 */
export const getRewardById = cache(async (
  id: string,
  options?: CacheOptions
): Promise<Reward | null> => {
  const supabase = createPublicClient(); // 공개 클라이언트 사용 (쿠키 없음)
  
  const { data, error } = await supabase
    .from('reward')
    .select(DEFAULT_REWARD_QUERY)
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
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