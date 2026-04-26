import { Database } from './supabase';

export type UserNotificationRow = Database['public']['Tables']['user_notifications']['Row'];
export type BroadcastNotificationRow = Database['public']['Tables']['broadcast_notifications']['Row'];

export interface UserNotification {
  id: number;
  userId: string | null;
  title: string | Record<string, string>; // 다국어 지원: 문자열 또는 {"ko": "...", "en": "..."}
  body: string | Record<string, string>; // 다국어 지원
  data: Record<string, any> | null;
  actionUrl: string | null;
  type: string;
  isRead: boolean;
  createdAt: string | null;
  readAt: string | null;
}

export interface NotificationFetchOptions {
  from?: number;
  limit?: number;
}

export interface NotificationService {
  fetchNotifications(options?: NotificationFetchOptions): Promise<UserNotification[]>;
  markAsRead(id: number): Promise<boolean>;
}

