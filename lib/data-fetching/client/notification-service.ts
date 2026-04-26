'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { UserNotification, NotificationFetchOptions } from '@/types/notification';
import type { Database } from '@/types/supabase';

type UserNotificationRow = Database['public']['Tables']['user_notifications']['Row'];
type BroadcastNotificationRow = Database['public']['Tables']['broadcast_notifications']['Row'];

/**
 * 다국어 필드를 정규화하는 함수
 * 문자열이면 {"ko": "...", "en": "..."} 형태로 변환
 * JSON 문자열이면 파싱하여 Map으로 변환
 */
function normalizeMultilangField(
  value: string | Record<string, string> | null | undefined
): Record<string, string> {
  if (!value) {
    return { ko: '', en: '' };
  }

  // 이미 객체인 경우
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, string>;
  }

  // 문자열인 경우
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // JSON 문자열인지 확인
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, string>;
        }
      } catch {
        // JSON 파싱 실패 시 일반 문자열로 처리
        return { ko: value, en: value };
      }
    }
    // 일반 문자열인 경우
    return { ko: value, en: value };
  }

  return { ko: '', en: '' };
}

/**
 * UserNotificationRow를 UserNotification으로 변환
 */
function transformUserNotification(row: UserNotificationRow): UserNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: normalizeMultilangField(row.title as any),
    body: normalizeMultilangField(row.body as any),
    data: (row.data as Record<string, any>) || null,
    actionUrl: row.action_url,
    type: row.type || 'default',
    isRead: row.is_read,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/**
 * BroadcastNotificationRow를 UserNotification으로 변환
 */
function transformBroadcastNotification(row: BroadcastNotificationRow): UserNotification {
  return {
    id: row.id,
    userId: null, // 방송 알림은 user_id가 없음
    title: normalizeMultilangField(row.title as any),
    body: normalizeMultilangField(row.body as any),
    data: (row.data as Record<string, any>) || null,
    actionUrl: row.action_url,
    type: row.type || 'default',
    isRead: false, // 방송 알림은 기본적으로 읽지 않음
    createdAt: row.created_at,
    readAt: null,
  };
}

/**
 * 현재 언어에 맞는 텍스트 반환
 */
export function getLocalizedText(
  multilang: Record<string, string>,
  currentLang: string = 'ko'
): string {
  // 현재 언어 우선, 없으면 ko, 그것도 없으면 en, 그것도 없으면 첫 번째 값
  return (
    multilang[currentLang] ||
    multilang['ko'] ||
    multilang['en'] ||
    Object.values(multilang)[0] ||
    ''
  );
}

/**
 * 알림함 서비스
 * 앱의 NotificationInboxService와 동일한 로직 구현
 */
export class NotificationInboxService {
  /**
   * 알림 목록 조회
   * 개인 알림과 방송 알림을 병합하여 정렬
   */
  static async fetchNotifications(
    options: NotificationFetchOptions = {}
  ): Promise<UserNotification[]> {
    try {
      const { from = 0, limit = 20 } = options;
      const supabase = createBrowserSupabaseClient();

      // 현재 사용자 확인
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const fetchCount = Math.min(from + limit, 200); // 과도한 로드 방지 상한

      // 개인 알림
      let userRows: UserNotificationRow[] = [];
      try {
        if (user) {
          const { data, error } = await supabase
            .from('user_notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(fetchCount);

          if (error) {
            console.warn('개인 알림 조회 실패:', error);
          } else {
            userRows = (data || []) as UserNotificationRow[];
          }
        }
      } catch (error) {
        console.warn('개인 알림 조회 중 오류:', error);
      }

      // 방송 알림
      let broadcastRows: BroadcastNotificationRow[] = [];
      try {
        const { data, error } = await supabase
          .from('broadcast_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(fetchCount);

        if (error) {
          console.warn('방송 알림 조회 실패:', error);
        } else {
          broadcastRows = (data || []) as BroadcastNotificationRow[];
        }
      } catch (error) {
        console.warn('방송 알림 조회 중 오류:', error);
      }

      // 변환
      const userList = userRows.map(transformUserNotification);
      const broadcastList = broadcastRows.map(transformBroadcastNotification);

      // 병합 및 정렬
      const all = [...userList, ...broadcastList];
      all.sort((a, b) => {
        const ca = a.createdAt || '';
        const cb = b.createdAt || '';
        const cmp = cb.localeCompare(ca); // desc
        if (cmp !== 0) return cmp;
        return b.id - a.id;
      });

      // 페이징
      const start = Math.max(0, Math.min(from, all.length));
      const end = Math.min(from + limit, all.length);
      return all.slice(start, end);
    } catch (error) {
      console.error('알림 조회 실패:', error);
      return [];
    }
  }

  /**
   * 알림 읽음 처리
   */
  static async markAsRead(id: number): Promise<boolean> {
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await (supabase as any)
        .from('user_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        console.error('알림 읽음 처리 실패:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('알림 읽음 처리 중 오류:', error);
      return false;
    }
  }

  /**
   * 읽지 않은 알림 개수 조회
   * 헤더 배지용으로 사용
   */
  static async getUnreadCount(): Promise<number> {
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return 0;
      }

      // 개인 알림 중 읽지 않은 것만 카운트
      const { count, error } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        console.warn('읽지 않은 알림 개수 조회 실패:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('읽지 않은 알림 개수 조회 중 오류:', error);
      return 0;
    }
  }
}

