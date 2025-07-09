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
    page_title_my_posts: localeMessages['page_title_my_posts'] || 'My Posts',
    label_loading: localeMessages['label_loading'] || 'Loading...',
    label_no_posts: localeMessages['label_no_posts'] || 'No posts',
    label_load_more: localeMessages['label_load_more'] || 'Load more',
    label_post_title: localeMessages['label_post_title'] || 'Post Title',
    label_post_content: localeMessages['label_post_content'] || 'Post Content',
    label_post_date: localeMessages['label_post_date'] || 'Post Date',
    label_error_occurred: localeMessages['label_error_occurred'] || 'An error occurred',
    label_retry: localeMessages['label_retry'] || 'Retry',
    label_back_to_mypage: localeMessages['label_back_to_mypage'] || 'Back to My Page',
    label_please_try_again: localeMessages['label_please_try_again'] || 'Please try again',
    label_loading_posts: localeMessages['label_loading_posts'] || 'Loading posts...',
    label_all_posts_checked: localeMessages['label_all_posts_checked'] || 'All posts checked',
    label_content_preview_two_lines: localeMessages['label_content_preview_two_lines'] || 'Content Preview',
    label_board: localeMessages['label_board'] || 'Board',
    label_total_posts_count: localeMessages['label_total_posts_count'] || 'Total Posts',
    label_scroll_for_more: localeMessages['label_scroll_for_more'] || 'Scroll for more',
    label_no_posts_description: localeMessages['label_no_posts_description'] || 'No posts yet',
    views: localeMessages['views'] || 'Views',
    label_title_comment: localeMessages['label_title_comment'] || 'Comments',
    comments: localeMessages['comments'] || 'Comments',
    label_anonymous: localeMessages['label_anonymous'] || 'Anonymous',
    error_posts_fetch_failed: localeMessages['error_posts_fetch_failed'] || 'Failed to fetch posts',
    error_unknown: localeMessages['error_unknown'] || 'Unknown error',
    label_total_views: localeMessages['label_total_views'] || 'Total Views',
    label_total_comments: localeMessages['label_total_comments'] || 'Total Comments',
    label_popular_post: localeMessages['label_popular_post'] || 'Popular Post',
    label_no_posts_yet: localeMessages['label_no_posts_yet'] || 'No posts yet',
    label_write_first_post: localeMessages['label_write_first_post'] || 'Write your first post',
    label_go_to_board: localeMessages['label_go_to_board'] || 'Go to board',
    label_all_posts_loaded: localeMessages['label_all_posts_loaded'] || 'All posts loaded',
    // 새로 추가된 번역 키들
    error_unknown_occurred: localeMessages['error_unknown_occurred'] || 'An unknown error occurred',
    console_posts_fetch_error: localeMessages['console_posts_fetch_error'] || 'Posts fetch error',
    console_content_parsing_error: localeMessages['console_content_parsing_error'] || 'Content parsing error',
    label_posts_description: localeMessages['label_posts_description'] || '작성한 게시물 수',
    label_views_description: localeMessages['label_views_description'] || '누적 조회수',
    label_comments_description: localeMessages['label_comments_description'] || '받은 댓글 수'
  };

  return (
    <PostsClient 
      initialUser={user}
      translations={translations}
    />
  );
} 