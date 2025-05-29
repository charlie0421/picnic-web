'use client';

import { memo } from 'react';
import { ConnectionStatus } from '@/lib/supabase/realtime';
import { useVoteConnectionStatus } from '@/hooks/useVoteRealtime';

// 연결 상태 아이콘 및 색상 매핑
const statusConfig = {
  connecting: {
    icon: '🔄',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    label: '연결 중...',
    description: '실시간 업데이트 연결을 시도하고 있습니다.'
  },
  connected: {
    icon: '🟢',
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    label: '연결됨',
    description: '실시간 업데이트가 활성화되었습니다.'
  },
  disconnected: {
    icon: '⚫',
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: '연결 안됨',
    description: '실시간 업데이트가 비활성화되었습니다.'
  },
  error: {
    icon: '🔴',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: '연결 오류',
    description: '실시간 업데이트 연결에 문제가 발생했습니다.'
  }
} as const;

interface RealtimeStatusProps {
  /** 투표 ID */
  voteId?: number;
  /** 컴팩트 모드 (아이콘만 표시) */
  compact?: boolean;
  /** 상세 정보 표시 여부 */
  showDetails?: boolean;
  /** 커스텀 클래스명 */
  className?: string;
  /** 상태 변경 콜백 */
  onStatusChange?: (status: ConnectionStatus) => void;
}

/**
 * 실시간 연결 상태를 표시하는 컴포넌트
 */
export const RealtimeStatus = memo<RealtimeStatusProps>(({
  voteId,
  compact = false,
  showDetails = false,
  className = '',
  onStatusChange
}) => {
  const { connectionStatus, isConnected, activeSubscriptionsCount } = useVoteConnectionStatus(voteId);
  
  const config = statusConfig[connectionStatus];

  // 상태 변경 알림
  if (onStatusChange) {
    onStatusChange(connectionStatus);
  }

  if (compact) {
    return (
      <div 
        className={`inline-flex items-center gap-1 ${className}`}
        title={`${config.label}: ${config.description}`}
      >
        <span className="text-sm">{config.icon}</span>
        {!compact && (
          <span className={`text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${config.bgColor} ${config.borderColor} ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{config.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${config.color}`}>
              {config.label}
            </span>
            {isConnected && activeSubscriptionsCount > 0 && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {activeSubscriptionsCount}개 구독
              </span>
            )}
          </div>
          {showDetails && (
            <p className="text-xs text-gray-600 mt-1">
              {config.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

RealtimeStatus.displayName = 'RealtimeStatus';

/**
 * 간단한 실시간 상태 인디케이터
 */
export const RealtimeIndicator = memo<{ voteId?: number; className?: string }>(({
  voteId,
  className = ''
}) => {
  return (
    <RealtimeStatus
      voteId={voteId}
      compact={true}
      className={className}
    />
  );
});

RealtimeIndicator.displayName = 'RealtimeIndicator';

/**
 * 상세한 실시간 상태 패널
 */
export const RealtimeStatusPanel = memo<{ voteId?: number; className?: string }>(({
  voteId,
  className = ''
}) => {
  return (
    <RealtimeStatus
      voteId={voteId}
      compact={false}
      showDetails={true}
      className={className}
    />
  );
});

RealtimeStatusPanel.displayName = 'RealtimeStatusPanel'; 