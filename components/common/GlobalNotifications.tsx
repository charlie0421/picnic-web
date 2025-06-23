'use client';

import React from 'react';
import { useNotification } from '@/contexts/NotificationContext';

export function GlobalNotifications() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            p-4 rounded-lg shadow-lg border-l-4 bg-white transform transition-all duration-300 ease-in-out
            animate-in slide-in-from-right-2 fade-in
            ${notification.type === 'success' ? 'border-green-500 bg-green-50' : ''}
            ${notification.type === 'error' ? 'border-red-500 bg-red-50' : ''}
            ${notification.type === 'warning' ? 'border-yellow-500 bg-yellow-50' : ''}
            ${notification.type === 'info' ? 'border-blue-500 bg-blue-50' : ''}
          `}
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1">
              <h4 className={`
                font-medium text-sm
                ${notification.type === 'success' ? 'text-green-800' : ''}
                ${notification.type === 'error' ? 'text-red-800' : ''}
                ${notification.type === 'warning' ? 'text-yellow-800' : ''}
                ${notification.type === 'info' ? 'text-blue-800' : ''}
              `}>
                {notification.title}
              </h4>
              <p className={`
                text-xs mt-1
                ${notification.type === 'success' ? 'text-green-700' : ''}
                ${notification.type === 'error' ? 'text-red-700' : ''}
                ${notification.type === 'warning' ? 'text-yellow-700' : ''}
                ${notification.type === 'info' ? 'text-blue-700' : ''}
              `}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className={`
                text-xs hover:opacity-70 transition-opacity p-1 rounded
                ${notification.type === 'success' ? 'text-green-800 hover:bg-green-200' : ''}
                ${notification.type === 'error' ? 'text-red-800 hover:bg-red-200' : ''}
                ${notification.type === 'warning' ? 'text-yellow-800 hover:bg-yellow-200' : ''}
                ${notification.type === 'info' ? 'text-blue-800 hover:bg-blue-200' : ''}
              `}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
} 