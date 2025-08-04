'use client';

import React from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTranslations } from '@/hooks/useTranslations';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, EmptyState } from '@/components/mypage/MypageStates';
import Pagination from '@/components/common/molecules/Pagination';
import type { EmptyStateConfig } from '@/types/mypage-common';

interface PostItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  viewCount: number;
  commentCount: number;
  boardName: string;
  isAnonymous: boolean;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface PostsClientProps {
  initialPosts: PostItem[];
  initialPagination: PaginationInfo;
  initialError: string | null;
}

export default function PostsClient({ 
  initialPosts, 
  initialPagination, 
  initialError 
}: PostsClientProps) {
  const { formatDate } = useLanguage();
  const { tDynamic, translations } = useTranslations();

  const truncateContent = (content: any) => {
    if (!content) return '';
    let textContent = content;
    if (typeof content === 'object') {
      textContent = JSON.stringify(content);
    } else {
      textContent = String(content);
    }
    const plainText = textContent.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
    return plainText.length > 100 ? `${plainText.substring(0, 100)}...` : plainText;
  };
  
  const emptyStateConfig: EmptyStateConfig = {
    title: tDynamic('label_no_posts'),
    description: tDynamic('label_no_posts_description'),
    actionLabel: tDynamic('label_go_to_board'),
    actionUrl: '/vote',
    icon: '📝'
  };

  if (initialError) {
    return <ErrorState error={new Error(initialError)} onRetry={() => {}} translations={translations} />;
  }

  const statistics = {
    totalViews: initialPosts.reduce((acc, post) => acc + post.viewCount, 0),
    totalComments: initialPosts.reduce((acc, post) => acc + post.commentCount, 0),
  };
  
  if (initialPosts.length === 0) {
    return (
       <div className="container mx-auto px-4 py-6">
        <MypageHeader 
          config={{
            title: tDynamic('page_title_my_posts'),
            icon: '📝',
            backUrl: '/mypage',
            backLabel: tDynamic('label_back_to_mypage')
          }}
          statistics={[]}
          translations={translations}
        />
        <EmptyState 
          config={emptyStateConfig}
          translations={translations}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <MypageHeader 
        config={{
          title: tDynamic('page_title_my_posts'),
          icon: '📝',
          backUrl: '/mypage',
          backLabel: tDynamic('label_back_to_mypage')
        }}
        statistics={[
          {
            id: 'primary',
            title: tDynamic('label_total_posts_count'),
            value: initialPagination.totalCount,
            description: tDynamic('label_posts_description'),
            icon: '📊',
            bgColor: 'from-primary-50 to-primary-100',
            borderColor: 'border-primary-200/50',
            textColor: 'text-primary-800',
            isLoading: false
          },
          {
            id: 'secondary',
            title: tDynamic('label_total_views'),
            value: statistics.totalViews,
            description: tDynamic('label_views_description'),
            icon: '👁️',
            bgColor: 'from-secondary-50 to-secondary-100',
            borderColor: 'border-secondary-200/50',
            textColor: 'text-secondary-800',
            isLoading: false
          },
          {
            id: 'point',
            title: tDynamic('label_total_comments'),
            value: statistics.totalComments,
            description: tDynamic('label_comments_description'),
            icon: '💬',
            bgColor: 'from-point-50 to-point-100',
            borderColor: 'border-point-200/50',
            textColor: 'text-point-800',
            isLoading: false
          }
        ]}
        translations={translations}
      />

      <div className="space-y-6 mt-6">
        {initialPosts.map((post) => (
          <div key={post.id} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group p-6">
                    <div className="space-y-4">
                      <div className="mb-3">
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">📝</span>
                            </div>
                    <span className="font-bold text-blue-800 text-sm">{tDynamic('label_post_title')}</span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors duration-200">
                    {post.title || tDynamic('label_no_title')}
                          </h3>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                  <div className="flex items-center space-x-2 mb-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">📄</span>
                              </div>
                    <span className="font-bold text-gray-800 text-sm">{tDynamic('label_post_content')}</span>
                          </div>
                          <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                    {truncateContent(post.content)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 border border-green-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">🏷️</span>
                            </div>
                    <span className="font-bold text-green-800 text-sm">{tDynamic('label_board')}</span>
                          </div>
                          <span className="text-gray-900 font-semibold text-sm">
                    {post.boardName || tDynamic('label_unknown')}
                          </span>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-3 border border-purple-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-violet-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">👁️</span>
                            </div>
                    <span className="font-bold text-purple-800 text-sm">{tDynamic('views')}</span>
                          </div>
                          <span className="text-gray-900 font-semibold text-sm">{post.viewCount?.toLocaleString()}</span>
                        </div>
                        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-3 border border-orange-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">💬</span>
                            </div>
                    <span className="font-bold text-orange-800 text-sm">{tDynamic('comments')}</span>
                          </div>
                          <span className="text-gray-900 font-semibold text-sm">{post.commentCount?.toLocaleString()}</span>
                        </div>
                      </div>

              <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 border border-point-100/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">📅</span>
                            </div>
                    <span className="font-bold text-point-800 text-sm">{tDynamic('label_post_date')}</span>
                          </div>
                          {post.isAnonymous && (
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                      {tDynamic('label_anonymous')}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          <span className="text-gray-900 font-semibold text-sm block">
                            {formatDate(post.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
        ))}
        
        <Pagination 
          totalPages={initialPagination.totalPages}
          currentPage={initialPagination.page}
        />
      </div>
    </div>
  );
}