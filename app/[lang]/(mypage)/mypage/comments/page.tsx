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
    page_title_my_comments: localeMessages['page_title_my_comments'] || 'My Comments',
    label_loading: localeMessages['label_loading'] || 'Loading...',
    label_no_comments: localeMessages['label_no_comments'] || 'No comments',
    label_load_more: localeMessages['label_load_more'] || 'Load more',
    label_comment_content: localeMessages['label_comment_content'] || 'Comment Content',
    label_comment_date: localeMessages['label_comment_date'] || 'Comment Date',
    label_comment_post_title: localeMessages['label_comment_post_title'] || 'Post Title',
    label_error_occurred: localeMessages['label_error_occurred'] || 'An error occurred',
    label_retry: localeMessages['label_retry'] || 'Retry',
    label_back_to_mypage: localeMessages['label_back_to_mypage'] || 'Back to My Page',
    label_please_try_again: localeMessages['label_please_try_again'] || 'Please try again',
    label_loading_comments: localeMessages['label_loading_comments'] || 'Loading comments...',
    label_all_comments_checked: localeMessages['label_all_comments_checked'] || 'All comments checked',
    label_unknown: localeMessages['label_unknown'] || 'Unknown',
    label_anonymous: localeMessages['label_anonymous'] || 'Anonymous',
    label_scroll_for_more: localeMessages['label_scroll_for_more'] || 'Scroll for more',
    label_total_comments_count: localeMessages['label_total_comments_count'] || 'Total Comments',
    label_total_likes: localeMessages['label_total_likes'] || 'Total Likes',
    label_total_boards: localeMessages['label_total_boards'] || 'Total Boards',
    label_no_comments_yet: localeMessages['label_no_comments_yet'] || 'No comments yet',
    label_write_first_comment: localeMessages['label_write_first_comment'] || 'Write your first comment',
    label_go_to_vote: localeMessages['label_go_to_vote'] || 'Go to vote',
    label_all_comments_loaded: localeMessages['label_all_comments_loaded'] || 'All comments loaded',
    label_likes: localeMessages['label_likes'] || 'Likes',
    label_board: localeMessages['label_board'] || 'Board',
    label_post: localeMessages['label_post'] || 'Post',
    // 새로 추가된 번역 키들
    error_comments_fetch_failed: localeMessages['error_comments_fetch_failed'] || 'Failed to fetch comments',
    error_unknown_occurred: localeMessages['error_unknown_occurred'] || 'An unknown error occurred',
    console_comments_fetch_error: localeMessages['console_comments_fetch_error'] || 'Comments fetch error',
    console_comment_content_parsing_error: localeMessages['console_comment_content_parsing_error'] || 'Comment content parsing error',
    label_comments_count_description: localeMessages['label_comments_count_description'] || '작성한 댓글 수',
    label_likes_description: localeMessages['label_likes_description'] || '받은 좋아요 수',
    label_boards_description: localeMessages['label_boards_description'] || '활동한 게시판 수',
    // 누락된 번역 키들 추가
    label_view_original_post: localeMessages['label_view_original_post'] || 'View Original Post',
    label_go_to_board: localeMessages['label_go_to_board'] || 'Go to Board',
    label_popular_comment: localeMessages['label_popular_comment'] || 'Popular Comment',
    label_comments_description: localeMessages['label_comments_description'] || 'Your comments',
    label_posts_description: localeMessages['label_posts_description'] || 'Your posts',
  };

  return (
    <CommentsClient 
      initialUser={user}
      translations={translations}
    />
  );
} 