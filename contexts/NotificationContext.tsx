'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { SUPABASE_AUTH_RATE_LIMIT_EVENT, SupabaseAuthRateLimitDetail } from '@/lib/supabase/events';
import { useTranslations } from '@/hooks/useTranslations';

interface NotificationState {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  timestamp: Date;
}

interface NotificationContextType {
  notifications: NotificationState[];
  addNotification: (notification: Omit<NotificationState, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationState[]>([]);
  const { t } = useTranslations();

  const addNotification = useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification: NotificationState = {
      ...notification,
      id,
      timestamp: new Date(),
    };

    setNotifications(prev => [...prev, newNotification]);

    // 자동 제거 (기본 5초, 또는 지정된 duration)
    const duration = notification.duration || 5000;
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSupabaseRateLimit = (event: Event) => {
      const detail = (event as CustomEvent<SupabaseAuthRateLimitDetail>).detail;
      const titleKey = detail?.titleKey ?? 'notifications.auth.rateLimitTitle';
      const messageKey = detail?.messageKey ?? 'notifications.auth.rateLimitMessage';
      const defaultTitle = detail?.title ?? 'Session expired';
      const defaultMessage =
        detail?.message ?? 'You were automatically signed out after too many requests. Please sign in again.';
      const notificationTitle = t(titleKey, defaultTitle) || defaultTitle;
      const notificationMessage = t(messageKey, defaultMessage) || defaultMessage;

      addNotification({
        type: detail?.type ?? 'warning',
        title: notificationTitle,
        message: notificationMessage,
        duration: detail?.duration ?? 8000,
      });
    };

    window.addEventListener(SUPABASE_AUTH_RATE_LIMIT_EVENT, handleSupabaseRateLimit);

    return () => {
      window.removeEventListener(SUPABASE_AUTH_RATE_LIMIT_EVENT, handleSupabaseRateLimit);
    };
  }, [addNotification, t]);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}