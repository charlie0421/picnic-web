import { createClient } from '@/utils/supabase-server-client';
import { Database } from '@/types/supabase';

type PolicyLanguage = 'ko' | 'en';
type PolicyType = 'privacy' | 'terms';

interface PolicyData {
  id: number;
  type: string | null;
  language: PolicyLanguage | null;
  content: string;
  version: string;
  created_at: string;
  updated_at: string;
}

/**
 * 정책 데이터를 가져오는 함수
 * @param type - 정책 타입 ('privacy' | 'terms')
 * @param language - 언어 코드 ('ko' | 'en')
 * @returns 정책 데이터 또는 null
 */
export async function getPolicyByTypeAndLanguage(
  type: PolicyType,
  language: PolicyLanguage
): Promise<PolicyData | null> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('policy')
      .select('*')
      .eq('type', type)
      .eq('language', language)
      .is('deleted_at', null)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error(`정책 데이터 조회 실패 (${type}, ${language}):`, error);
      return null;
    }

    return data;
  } catch (error) {
    console.error(`정책 데이터 조회 예외 (${type}, ${language}):`, error);
    return null;
  }
}

/**
 * 현재 언어에 맞는 정책 데이터를 가져오는 함수
 * 한글이면 'ko', 그 외는 'en' 사용
 * @param type - 정책 타입 ('privacy' | 'terms')
 * @param currentLang - 현재 언어 코드
 * @returns 정책 데이터 또는 null
 */
export async function getPolicyForCurrentLanguage(
  type: PolicyType,
  currentLang: string
): Promise<PolicyData | null> {
  // 한글이면 'ko', 그 외는 'en' 사용
  const policyLanguage: PolicyLanguage = currentLang === 'ko' ? 'ko' : 'en';
  
  let policy = await getPolicyByTypeAndLanguage(type, policyLanguage);
  
  // 만약 해당 언어의 정책이 없다면 영어 버전으로 폴백
  if (!policy && policyLanguage === 'ko') {
    console.warn(`한글 ${type} 정책을 찾을 수 없어 영어 버전으로 폴백합니다.`);
    policy = await getPolicyByTypeAndLanguage(type, 'en');
  }
  
  return policy;
}

/**
 * 모든 언어의 특정 정책 타입 데이터를 가져오는 함수
 * @param type - 정책 타입 ('privacy' | 'terms')
 * @returns 정책 데이터 배열
 */
export async function getAllPoliciesByType(type: PolicyType): Promise<PolicyData[]> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('policy')
      .select('*')
      .eq('type', type)
      .is('deleted_at', null)
      .order('language', { ascending: true })
      .order('version', { ascending: false });

    if (error) {
      console.error(`모든 ${type} 정책 조회 실패:`, error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error(`모든 ${type} 정책 조회 예외:`, error);
    return [];
  }
} 