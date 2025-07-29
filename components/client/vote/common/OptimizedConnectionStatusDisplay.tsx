'use client';

import React, { memo } from 'react';
import { ConnectionStatus } from '@/lib/supabase/realtime';

interface OptimizedConnectionStatusDisplayProps {
  connectionStatus: ConnectionStatus;
  isCompact?: boolean;
}

const OptimizedConnectionStatusDisplay = memo(({ 
  connectionStatus, 
  isCompact = false 
}: OptimizedConnectionStatusDisplayProps) => {

  const getStatusIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return { 
          className: 'bg-green-100 text-green-800', 
          text: '실시간 연결됨', 
          icon: '🟢' 
        };
      case 'reconnecting':
        return { 
          className: 'bg-yellow-100 text-yellow-800 animate-pulse', 
          text: '재연결 중...', 
          icon: '🟡' 
        };
      case 'error':
      case 'network_error':
        return { 
          className: 'bg-red-100 text-red-800', 
          text: '연결 오류', 
          icon: '🔴' 
        };
      case 'suspended':
        return { 
          className: 'bg-gray-100 text-gray-700', 
          text: '연결 일시중단', 
          icon: '⏸️' 
        };
      default:
        return { 
          className: 'bg-gray-100 text-gray-700', 
          text: '연결 끊김', 
          icon: '⚪' 
        };
    }
  };

  const { className, text, icon } = getStatusIndicator();

  if (isCompact) {
    return (
      <div 
        className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium ${className}`}
        title={text}
      >
        <span>{icon}</span>
        <span className="hidden sm:inline">{text}</span>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div>
            <p className="font-semibold">{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
});

OptimizedConnectionStatusDisplay.displayName = 'OptimizedConnectionStatusDisplay';

export default OptimizedConnectionStatusDisplay;