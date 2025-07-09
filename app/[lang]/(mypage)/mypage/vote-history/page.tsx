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
    label_no_more_votes: localeMessages.label_no_more_votes || 'No more votes to load',
    label_star_candy: localeMessages.label_star_candy || 'Star Candy',
    label_back_to_mypage: localeMessages.label_back_to_mypage || 'Back to MyPage',
    label_total_vote_count: localeMessages.label_total_vote_count || 'You\'ve voted {count} times so far 🗳️',
    label_vote_status_ongoing: localeMessages.label_vote_status_ongoing || 'Ongoing',
    label_vote_status_ended: localeMessages.label_vote_status_ended || 'Ended',
    label_vote_status_upcoming: localeMessages.label_vote_status_upcoming || 'Upcoming',
    label_no_title: localeMessages.label_no_title || 'No Title',
    label_unknown: localeMessages.label_unknown || 'Unknown',
    label_group_separator: localeMessages.label_group_separator || ' | ',
    label_artist: localeMessages.label_artist || 'Artist',
    label_scroll_for_more: localeMessages.label_scroll_for_more || 'Scroll down for more 👇',
    label_all_votes_checked: localeMessages.label_all_votes_checked || 'All votes checked',
  };

  return (
    <VoteHistoryClient 
      initialUser={user}
      translations={translations}
    />
  );
} 