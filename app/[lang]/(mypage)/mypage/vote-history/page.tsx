import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import VoteHistoryClient from './VoteHistoryClient';

export default async function VoteHistoryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/vote-history');
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
    label_mypage_my_votes: localeMessages.label_mypage_my_votes || 'My Votes',
    label_loading: localeMessages.label_loading || 'Loading...',
    label_no_votes: localeMessages.label_no_votes || 'No vote history found',
    label_load_more: localeMessages.label_load_more || 'Load More',
    label_vote_amount: localeMessages.label_vote_amount || 'Vote Amount',
    label_vote_date: localeMessages.label_vote_date || 'Vote Date',
    label_vote_category: localeMessages.label_vote_category || 'Category',
    label_artist_name: localeMessages.label_artist_name || 'Artist',
    label_group_name: localeMessages.label_group_name || 'Group',
    label_vote_title: localeMessages.label_vote_title || 'Vote Title',
    label_error_occurred: localeMessages.label_error_occurred || 'An error occurred',
    label_retry: localeMessages.label_retry || 'Retry',
    label_no_more_votes: localeMessages.label_no_more_votes || 'No more votes',
    label_star_candy: localeMessages.label_star_candy || 'Star Candy',
    label_back_to_mypage: localeMessages.label_back_to_mypage || 'Back to My Page',
    label_total_vote_count: localeMessages.label_total_vote_count || 'You have voted {count} times so far 🗳️',
    label_vote_status_ongoing: localeMessages.label_vote_status_ongoing || 'Ongoing',
    label_vote_status_ended: localeMessages.label_vote_status_ended || 'Ended',
    label_vote_status_upcoming: localeMessages.label_vote_status_upcoming || 'Upcoming',
    label_no_title: localeMessages.label_no_title || 'No Title',
    label_unknown: localeMessages.label_unknown || 'Unknown',
    label_group_separator: localeMessages.label_group_separator || ' | ',
    label_artist: localeMessages.label_artist || 'Artist',
    label_scroll_for_more: localeMessages.label_scroll_for_more || 'Scroll down for more 👇',
    label_all_votes_checked: localeMessages.label_all_votes_checked || 'All votes checked!',
    // 새로 추가되는 번역 키들
    label_total_votes_count: localeMessages.label_total_votes_count || 'Total Votes',
    label_total_star_candy_used: localeMessages.label_total_star_candy_used || 'Total Star Candy Used',
    label_supported_artists: localeMessages.label_supported_artists || 'Supported Artists',
    label_please_try_again: localeMessages.label_please_try_again || 'Please try again',
    label_loading_vote_history: localeMessages.label_loading_vote_history || 'Loading vote history...',
    label_no_vote_history_yet: localeMessages.label_no_vote_history_yet || 'No vote history yet.',
    label_vote_for_favorite_artist: localeMessages.label_vote_for_favorite_artist || 'Vote for your favorite artist!',
    label_go_to_vote: localeMessages.label_go_to_vote || 'Go to Vote',
    label_all_vote_history_checked: localeMessages.label_all_vote_history_checked || 'All vote history checked!',
    label_all_data_loaded: localeMessages.label_all_data_loaded || 'All data loaded',
    page_title_my_vote_history: localeMessages.page_title_my_vote_history || 'Vote History',
    label_total_votes: localeMessages.label_total_votes || 'Total Votes',
    label_votes_description: localeMessages.label_votes_description || 'Total votes cast',
    label_total_amount: localeMessages.label_total_amount || 'Total Amount',
    label_amount_description: localeMessages.label_amount_description || 'Total amount spent',
    label_votes_this_month: localeMessages.label_votes_this_month || 'Votes This Month',
    label_month_description: localeMessages.label_month_description || 'Votes this month',
    label_voted_item: localeMessages.label_voted_item || 'Voted Item',
    label_vote_type: localeMessages.label_vote_type || 'Vote Type',
    label_general_vote: localeMessages.label_general_vote || 'General Vote',
    label_total_votes_for_item: localeMessages.label_total_votes_for_item || 'Total Votes for Item',
    label_no_vote_history: localeMessages.label_no_vote_history || 'No vote history',
    label_no_vote_history_description: localeMessages.label_no_vote_history_description || 'No votes yet'
  };

  return (
    <VoteHistoryClient 
      initialUser={user}
      translations={translations}
    />
  );
} 