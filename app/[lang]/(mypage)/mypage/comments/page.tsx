import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CommentsClient from './CommentsClient';

export default async function CommentsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/comments');
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
    page_title_my_comments: localeMessages.page_title_my_comments || 'My Comments',
    label_loading: localeMessages.label_loading || 'Loading...',
    label_no_comments: localeMessages.label_no_comments || 'No comments found',
    label_load_more: localeMessages.label_load_more || 'Load More',
    label_comment_content: localeMessages.label_comment_content || 'Comment Content',
    label_comment_date: localeMessages.label_comment_date || 'Comment Date',
    label_comment_post_title: localeMessages.label_comment_post_title || 'Post Title',
    label_error_occurred: localeMessages.label_error_occurred || 'An error occurred',
    label_retry: localeMessages.label_retry || 'Retry',
    label_back_to_mypage: localeMessages.label_back_to_mypage || 'Back to My Page',
    label_please_try_again: localeMessages.label_please_try_again || 'Please try again',
    label_loading_comments: localeMessages.label_loading_comments || 'Loading comments...',
    label_all_comments_checked: localeMessages.label_all_comments_checked || 'All comments checked!',
    label_unknown: localeMessages.label_unknown || 'Unknown',
    label_anonymous: localeMessages.anonymous || 'Anonymous',
    label_scroll_for_more: localeMessages.label_scroll_for_more || 'Scroll down for more 👇',
  };

  return (
    <CommentsClient 
      initialUser={user}
      translations={translations}
    />
  );
} 