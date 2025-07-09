import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PostsClient from './PostsClient';

export default async function PostsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/posts');
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
    page_title_my_posts: localeMessages.page_title_my_posts || 'My Posts',
    label_loading: localeMessages.label_loading || 'Loading...',
    label_no_posts: localeMessages.label_no_posts || 'No posts found',
    label_load_more: localeMessages.label_load_more || 'Load More',
    label_post_title: localeMessages.label_post_title || 'Title',
    label_post_content: localeMessages.label_post_content || 'Content',
    label_post_date: localeMessages.label_post_date || 'Posted Date',
    label_error_occurred: localeMessages.label_error_occurred || 'An error occurred',
    label_retry: localeMessages.label_retry || 'Retry',
    label_back_to_mypage: localeMessages.label_back_to_mypage || 'Back to My Page',
    label_please_try_again: localeMessages.label_please_try_again || 'Please try again',
    label_loading_posts: localeMessages.label_loading_posts || 'Loading posts...',
    label_all_posts_checked: localeMessages.label_all_posts_checked || 'All posts checked!',
    label_total_posts_count: localeMessages.label_total_posts_count || 'Total Posts',
    label_scroll_for_more: localeMessages.label_scroll_for_more || 'Scroll for more',
    label_no_posts_description: localeMessages.label_no_posts_description || 'You haven\'t written any posts yet. Try writing a new post!',
    views: localeMessages.views || 'Views',
    label_title_comment: localeMessages.label_title_comment || 'Comments',
    comments: localeMessages.comments || 'Comments',
    label_anonymous: localeMessages.label_anonymous || 'Anonymous',
    error_posts_fetch_failed: localeMessages.error_posts_fetch_failed || 'Failed to load posts',
    error_unknown: localeMessages.error_unknown || 'An unknown error occurred',
  };

  return (
    <PostsClient 
      initialUser={user}
      translations={translations}
    />
  );
} 