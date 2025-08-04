'use client';

import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';
import { useTranslations } from '@/hooks/useTranslations';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, EmptyState } from '@/components/mypage/MypageStates';
import Pagination from '@/components/common/molecules/Pagination';
import type { EmptyStateConfig } from '@/types/mypage-common';

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  postId: string;
  postTitle: string;
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

interface StatisticsInfo {
  totalComments: number;
  totalLikes: number;
  totalBoards: number;
  mostActiveBoard: string | null;
}

interface CommentsClientProps {
  initialComments: CommentItem[];
  initialPagination: PaginationInfo;
  initialStatistics: StatisticsInfo;
  initialError: string | null;
}

export default function CommentsClient({ 
  initialComments, 
  initialPagination, 
  initialStatistics,
  initialError 
}: CommentsClientProps) {
  const { formatDate } = useLanguage();
  const { tDynamic, translations } = useTranslations();

  const truncateContent = (content: any, maxLength: number = 150) => {
    if (!content) return '';
    let textContent = content;
    if (typeof content === 'object') {
      textContent = JSON.stringify(content);
    } else {
      textContent = String(content);
    }
    const cleanText = textContent.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (cleanText.length <= maxLength) return cleanText;
    const cutPoint = cleanText.lastIndexOf(' ', maxLength);
    return cutPoint > maxLength / 2 ? cleanText.substring(0, cutPoint) + '...' : cleanText.substring(0, maxLength) + '...';
  };

  const emptyStateConfig: EmptyStateConfig = {
    title: tDynamic('label_no_comments_yet'),
    description: tDynamic('label_write_first_comment'),
    actionLabel: tDynamic('label_go_to_board'),
    actionUrl: '/board',
    icon: '💬'
  };

  if (initialError) {
    return <ErrorState error={new Error(initialError)} onRetry={() => {}} translations={translations} />;
  }
  
  if (initialComments.length === 0) {
     return (
       <div className="container mx-auto px-4 py-6">
        <MypageHeader 
          config={{
            title: tDynamic('page_title_my_comments'),
            icon: '💬',
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
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-6">
        <MypageHeader 
          config={{
            title: tDynamic('page_title_my_comments'),
            icon: '💬',
            backUrl: '/mypage',
            backLabel: tDynamic('label_back_to_mypage')
          }}
          statistics={[
            {
              id: 'primary',
              title: tDynamic('label_total_comments_count'),
              value: initialStatistics.totalComments,
              description: tDynamic('label_comments_description'),
              icon: '📊',
              bgColor: 'from-primary-50 to-primary-100',
              borderColor: 'border-primary-200/50',
              textColor: 'text-primary-800',
              isLoading: false
            },
            {
              id: 'secondary',
              title: tDynamic('label_total_likes'),
              value: initialStatistics.totalLikes,
              description: tDynamic('label_likes_description'),
              icon: '👍',
              bgColor: 'from-secondary-50 to-secondary-100',
              borderColor: 'border-secondary-200/50',
              textColor: 'text-secondary-800',
              isLoading: false
            },
            {
              id: 'point',
              title: tDynamic('label_most_active_board'),
              value: initialStatistics.mostActiveBoard || '-',
              description: tDynamic('label_board_description'),
              icon: '✨',
              bgColor: 'from-point-50 to-point-100',
              borderColor: 'border-point-200/50',
              textColor: 'text-point-800',
              isLoading: false
            }
          ]}
          translations={translations}
        />

        <div className="space-y-4 mt-6">
          {initialComments.map((comment, index) => (
            <div 
              key={comment.id} 
              className="group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-md hover:shadow-lg border border-white/30 overflow-hidden transition-all duration-300 transform hover:scale-[1.01] hover:-translate-y-1"
            >
              <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
              <div className="relative p-4">
                <div className="flex items-start space-x-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-1">
                          {comment.postTitle || tDynamic('label_no_title')}
                        </h3>
                        <div className="h-0.5 w-12 bg-gradient-to-r from-primary to-point rounded-full"></div>
                      </div>
                      {comment.isAnonymous && (
                        <div className="flex-shrink-0 ml-4">
                          <span className="px-2 py-1 text-xs font-semibold rounded-lg border bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-700">
                            {tDynamic('label_anonymous')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mb-3">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">💬</span>
                          </div>
                          <span className="font-bold text-gray-800 text-sm">{tDynamic('label_comment_content')}</span>
                        </div>
                        <div className="text-gray-700 text-sm leading-relaxed">
                          {truncateContent(comment.content)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-3 border border-primary-100/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-primary to-point rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">👍</span>
                          </div>
                          <span className="font-bold text-primary-800 text-sm">{tDynamic('label_likes')}</span>
                        </div>
                        <span className="text-gray-900 font-bold text-lg">{comment.likeCount.toLocaleString()}</span>
                      </div>
                      <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-xl p-3 border border-sub-100/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-sub to-secondary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📋</span>
                          </div>
                          <span className="font-bold text-sub-800 text-sm">{tDynamic('label_board')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{comment.boardName || tDynamic('label_unknown')}</span>
                      </div>
                      <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-xl p-3 border border-secondary-100/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-secondary to-primary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📅</span>
                          </div>
                          <span className="font-bold text-secondary-800 text-sm">{tDynamic('label_comment_date')}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-gray-900 font-semibold text-sm block">
                            {formatDate(comment.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 border border-point-100/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📄</span>
                          </div>
                          <span className="font-bold text-point-800 text-sm">{tDynamic('label_view_original_post')}</span>
                        </div>
                        <Link 
                          href={`/board/post/${comment.postId}`}
                          className="inline-flex items-center space-x-1 px-2 py-1 bg-white/80 text-point-800 rounded-lg text-xs font-semibold shadow-sm border border-point-200/50 hover:bg-point-50 transition-colors duration-200"
                        >
                          <span>{tDynamic('label_view')}</span>
                          <span>→</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Pagination 
          totalPages={initialPagination.totalPages}
          currentPage={initialPagination.page}
        />
      </div>
    </div>
  );
}