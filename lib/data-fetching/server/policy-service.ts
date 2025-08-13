'use server';

import 'server-only';
import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// 약관 및 정책 가져오기 (캐시 적용)
export const getPolicy = cache(
  async (type: 'terms' | 'privacy', lang: string = 'ko') => {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('policy')
      .select('content, language')
      .eq('type', type)
      .in('language', [lang, 'ko']);

    if (error) {
      console.error(`[getPolicy] ${type} 정책 조회 실패:`, error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const policyForLang = data.find(p => p.language === lang);
    if (policyForLang) {
      return policyForLang.content;
    }

    const policyForKo = data.find(p => p.language === 'ko');
    if (policyForKo) {
      return policyForKo.content;
    }

    return null;
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

export interface FaqCategory {
  code: string;
  label: string;
  order_number: number;
  active: boolean;
}

export const getFaqCategories = cache(async (lang: string = 'ko') => {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('faq_categories')
      .select('code, label, order_number, active')
      .eq('active', true)
      .order('order_number', { ascending: true });

    if (error) throw error;

    const localized: FaqCategory[] = (data || []).map((row: any) => {
      const label = row.label || {};
      return {
        code: row.code,
        label: label?.[lang] || label?.['ko'] || row.code,
        order_number: row.order_number ?? 0,
        active: !!row.active,
      };
    });

    return localized;
  } catch (error) {
    console.error('getFaqCategories error:', error);
    return [] as FaqCategory[];
  }
});