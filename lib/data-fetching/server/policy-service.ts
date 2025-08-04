'use server';

import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// 약관 및 정책 가져오기 (캐시 적용)
export const getPolicy = cache(
  async (type: 'terms' | 'privacy', lang: string = 'ko') => {
    const supabase = await createServerSupabaseClient();
    const policyKey = type === 'terms' ? 'TERMS_OF_SERVICE' : 'PRIVACY_POLICY';

    const { data, error } = await supabase
      .from('app_policies')
      .select('content')
      .eq('key', policyKey)
      .single();

    if (error) {
      console.error(`[getPolicy] ${type} 정책 조회 실패:`, error);
      return null;
    }

    const content = data?.content as any;
    return content?.[lang] || content?.['ko'] || null;
  }
);

export const getFaqs = cache(async (lang: string = 'ko') => {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from('faqs')
        .select('id, question, answer, category, created_at')
        .eq('status', 'PUBLISHED')
        .order('order_number', { ascending: true });
  
      if (error) {
        throw error;
      }
  
      const localizedData = (data || []).map(item => {
        const question = item.question as any;
        const answer = item.answer as any;
        return {
          ...item,
          question: question?.[lang] || question?.['ko'] || '',
          answer: answer?.[lang] || answer?.['ko'] || '',
        }
      });
  
      return localizedData;
    } catch (error) {
      console.error('getFaqs error:', error);
      return [];
    }
});