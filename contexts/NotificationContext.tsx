'use client';

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
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
  // Track active dismiss timers so we can cancel them on unmount or when
  // a notification is removed early. The previous implementation never
  // cleared its setTimeout handles, leaving setState callbacks armed past
  // unmount and producing setState-on-unmounted warnings.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeNotification = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification: Omit<NotificationState, 'id' | 'timestamp'>) => {
    // crypto.randomUUID() is collision-safe; the previous Math.random().substr
    // pattern produced ~10-byte ids that could clash on rapid successive
    // notifications and used the deprecated substr() API.
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `n_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newNotification: NotificationState = {
      ...notification,
      id,
      timestamp: new Date(),
    };

    setNotifications(prev => [...prev, newNotification]);

    const duration = notification.duration || 5000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
      timersRef.current.set(id, timer);
    }
  }, []);

  const clearAllNotifications = useCallback(() => {
    for (const timer of Array.from(timersRef.current.values())) clearTimeout(timer);
    timersRef.current.clear();
    setNotifications([]);
  }, []);

  // Clear any pending dismiss timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of Array.from(timers.values())) clearTimeout(timer);
      timers.clear();
    };
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