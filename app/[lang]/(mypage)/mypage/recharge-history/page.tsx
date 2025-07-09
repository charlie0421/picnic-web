import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RechargeHistoryClient from './RechargeHistoryClient';

export default async function RechargeHistoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/recharge-history');
  }

  // 서버사이드에서 번역 로드
  let localeMessages: Record<string, string> = {};
  try {
    localeMessages = await import(`../../../../../public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    console.error('번역 파일 로드 실패:', error);
    localeMessages = await import(`../../../../../public/locales/en.json`).then(m => m.default);
  }
  
  // 필요한 번역 키들을 추출
  const translations = {
    page_title_my_recharge_history: localeMessages.page_title_my_recharge_history || 'My Recharge History',
    label_loading: localeMessages.label_loading || 'Loading...',
    label_no_recharge_history: localeMessages.label_no_recharge_history || 'No recharge history found',
    label_load_more: localeMessages.label_load_more || 'Load More',
    label_recharge_amount: localeMessages.label_recharge_amount || 'Recharge Amount',
    label_recharge_date: localeMessages.label_recharge_date || 'Recharge Date',
    label_recharge_method: localeMessages.label_recharge_method || 'Payment Method',
    label_star_candy_amount: localeMessages.label_star_candy_amount || 'Star Candy Amount',
    label_error_occurred: localeMessages.label_error_occurred || 'An error occurred',
    label_retry: localeMessages.label_retry || 'Retry',
    label_back_to_mypage: localeMessages.label_back_to_mypage || 'Back to My Page',
    label_please_try_again: localeMessages.label_please_try_again || 'Please try again',
    label_loading_recharge_history: localeMessages.label_loading_recharge_history || 'Loading recharge history...',
    label_all_recharge_history_checked: localeMessages.label_all_recharge_history_checked || 'All recharge history checked!',
    text_star_candy: localeMessages.text_star_candy || 'Star Candy',
    label_total_recharge_amount: localeMessages.label_total_recharge_amount || 'Total Recharge Amount',
    label_total_recharge_count: localeMessages.label_total_recharge_count || 'Total Recharge Count',
  };

  return (
    <RechargeHistoryClient 
      initialUser={user}
      translations={translations}
    />
  );
} 