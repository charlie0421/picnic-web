'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { NotificationInboxService, getLocalizedText } from '@/lib/data-fetching/client/notification-service';
import type { UserNotification } from '@/types/notification';
import { useTranslations } from '@/hooks/useTranslations';
import { useAuth } from '@/hooks/useAuth';
import PortalGuard from '@/components/PortalGuard';
import { PortalType } from '@/utils/enums';

const mergeNotificationLists = (
  previous: UserNotification[],
  incoming: UserNotification[],
  reset: boolean
) => {
  const base = reset ? [] : previous;
  const map = new Map<string, UserNotification>();

  base.forEach((item) => {
    map.set(String(item.id), item);
  });

  incoming.forEach((item) => {
    map.set(String(item.id), item);
  });

  const merged = Array.from(map.values());
  const newlyAdded = merged.length - base.length;

  return { merged, newlyAdded };
};

interface NotificationsClientProps {
  initialUser: any;
  translations: Record<string, string>;
}

export default function NotificationsClient({
  initialUser,
  translations,
}: NotificationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslations();
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 20;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);

  // 현재 언어 추출
  const currentLang = pathname?.split('/')[1] || 'ko';

  // 알림 목록 로드
  const loadNotifications = useCallback(
    async (reset = false) => {
      if (loading) return;

      setLoading(true);
      try {
        const startFrom = reset ? 0 : from;
        const list = await NotificationInboxService.fetchNotifications({
          from: startFrom,
          limit,
        });

        setNotifications((prev) => {
          const { merged, newlyAdded } = mergeNotificationLists(prev, list, reset);

          if (reset) {
            setFrom(merged.length);
          } else {
            setFrom((prevFrom) => prevFrom + newlyAdded);
          }

          setHasMore(list.length === limit && newlyAdded > 0);

          return merged;
        });
      } catch (error) {
        console.error('알림 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    },
    [from, loading, limit]
  );

  // 초기 로드
  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications(true);
    }
  }, [isAuthenticated]);

  // 무한 스크롤 설정
  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadNotifications(false);
        }
      },
      { threshold: 0.1 }
    );

    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadNotifications]);

  // 알림 읽음 처리
  const handleMarkAsRead = useCallback(
    async (notification: UserNotification) => {
      if (notification.isRead || !notification.userId) return; // 방송 알림은 읽음 처리 불가

      const success = await NotificationInboxService.markAsRead(notification.id);
      if (success) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id
              ? { ...n, isRead: true, readAt: new Date().toISOString() }
              : n
          )
        );
        // 헤더의 읽지 않은 알림 개수 갱신을 위한 이벤트 발생
        window.dispatchEvent(new CustomEvent('notification-read'));
      }
    },
    []
  );

  // 알림 클릭 처리
  const handleNotificationClick = useCallback(
    async (notification: UserNotification) => {
      // 읽음 처리 (이미 읽은 알림이 아니고 개인 알림인 경우)
      if (!notification.isRead && notification.userId) {
        await handleMarkAsRead(notification);
      }

      // action_url이 있으면 이동
      if (notification.actionUrl) {
        const url = notification.actionUrl;
        // 내부 링크인지 확인
        if (url.startsWith('/') || url.includes(window.location.hostname)) {
          router.push(url);
        } else {
          window.open(url, '_blank');
        }
        return;
      }

      // 타입별 네비게이션
      const data = notification.data || {};
      switch (notification.type) {
        case 'vote':
          const voteId = data['vote_id'] || data['id'];
          if (voteId) {
            router.push(`/${currentLang}/vote/${voteId}`);
          }
          break;
        case 'post':
          const postId = data['post_id'] || data['id'];
          if (postId) {
            router.push(`/${currentLang}/community/${postId}`);
          }
          break;
        case 'qna':
        case 'question_created':
        case 'answer_created':
          const questionId = data['question_id'] || data['id'];
          if (questionId) {
            router.push(`/${currentLang}/mypage/qna/${questionId}`);
          }
          break;
        default:
          console.log('처리되지 않은 알림 타입:', notification.type);
      }
    },
    [router, currentLang, handleMarkAsRead]
  );

  // 아이콘 및 색상 결정
  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'vote':
        return {
          icon: '🗳️',
          bgColor: 'bg-indigo-50',
          borderColor: 'border-indigo-200',
        };
      case 'qna':
      case 'answer_created':
      case 'question_created':
        return {
          icon: '💬',
          bgColor: 'bg-teal-50',
          borderColor: 'border-teal-200',
        };
      case 'post':
        return {
          icon: '📝',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200',
        };
      default:
        return {
          icon: '🔔',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
        };
    }
  };

  if (!isAuthenticated) {
    return (
      <PortalGuard type={PortalType.PRIVATE}>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-gray-600">{translations.notifications_error}</p>
          </div>
        </div>
      </PortalGuard>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">{translations.notifications_title}</h1>

      {notifications.length === 0 && !loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">{translations.notifications_empty}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const style = getNotificationStyle(notification.type);
            const title = getLocalizedText(
              typeof notification.title === 'object' ? notification.title : { ko: notification.title as string },
              currentLang
            );
            const body = getLocalizedText(
              typeof notification.body === 'object' ? notification.body : { ko: notification.body as string },
              currentLang
            );

            return (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`
                  p-4 rounded-lg border cursor-pointer transition-all
                  ${style.bgColor} ${style.borderColor}
                  ${notification.isRead ? 'opacity-75' : 'opacity-100'}
                  hover:shadow-md hover:scale-[1.01]
                `}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">{style.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className={`
                          text-base font-medium mb-1
                          ${notification.isRead ? 'font-normal' : 'font-bold'}
                        `}
                      >
                        {title}
                      </h3>
                      {!notification.isRead && notification.userId && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{body}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        {notification.createdAt
                          ? new Date(notification.createdAt).toLocaleDateString(currentLang, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                      {notification.actionUrl && (
                        <span className="text-xs text-blue-600">자세히 보기 →</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 무한 스크롤 로딩 인디케이터 */}
      {hasMore && (
        <div ref={loadingRef} className="py-8 text-center">
          {loading && (
            <div className="inline-block">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-sm text-gray-500">{translations.notifications_loading}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

