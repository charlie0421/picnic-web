'use client';

import React, { memo, useMemo } from 'react';
import { ConnectionStatus, ConnectionInfo } from '@/lib/supabase/realtime';
import { UseVoteRealtimeOptimizedReturn } from '@/hooks/useVoteRealtimeOptimized';

interface OptimizedConnectionStatusDisplayProps {
  connectionStatus: ConnectionStatus;
  connectionInfo: ConnectionInfo;
  systemStatus: UseVoteRealtimeOptimizedReturn['systemStatus'];
  performanceMetrics: UseVoteRealtimeOptimizedReturn['performanceMetrics'];
  onToggleSmartReconnect?: () => void;
  onToggleBatterySaver?: () => void;
  smartReconnectEnabled?: boolean;
  batterySaverEnabled?: boolean;
  showDetails?: boolean;
  isCompact?: boolean;
}

// 연결 상태 아이콘 컴포넌트 (메모화)
const ConnectionStatusIcon = memo(({ status }: { status: ConnectionStatus }) => {
  const iconConfig = useMemo(() => {
    switch (status) {
      case 'connected':
        return { icon: '●', color: 'text-green-500', pulse: false };
      case 'connecting':
      case 'reconnecting':
        return { icon: '●', color: 'text-yellow-500', pulse: true };
      case 'disconnected':
        return { icon: '●', color: 'text-gray-400', pulse: false };
      case 'error':
      case 'network_error':
        return { icon: '●', color: 'text-red-500', pulse: false };
      case 'suspended':
        return { icon: '⏸', color: 'text-blue-500', pulse: false };
      default:
        return { icon: '●', color: 'text-gray-400', pulse: false };
    }
  }, [status]);

  return (
    <span 
      className={`${iconConfig.color} ${iconConfig.pulse ? 'animate-pulse' : ''}`}
      aria-label={`연결 상태: ${status}`}
      data-testid="connection-status-icon"
    >
      {iconConfig.icon}
    </span>
  );
});

ConnectionStatusIcon.displayName = 'ConnectionStatusIcon';

// 시스템 상태 배지 컴포넌트 (메모화)
const SystemStatusBadge = memo(({ 
  systemStatus 
}: { 
  systemStatus: UseVoteRealtimeOptimizedReturn['systemStatus'] 
}) => {
  const badges = useMemo(() => {
    const badges: Array<{ text: string; color: string }> = [];
    
    if (!systemStatus.isOnline) {
      badges.push({ text: '오프라인', color: 'bg-red-100 text-red-800' });
    }
    
    if (systemStatus.isSlowConnection) {
      badges.push({ text: '느린 연결', color: 'bg-yellow-100 text-yellow-800' });
    }
    
    if (!systemStatus.isPageVisible) {
      badges.push({ text: '백그라운드', color: 'bg-gray-100 text-gray-800' });
    }
    
    if (systemStatus.battery.level !== null && 
        !systemStatus.battery.isCharging && 
        systemStatus.battery.level < 0.15) {
      badges.push({ text: '배터리 부족', color: 'bg-red-100 text-red-800' });
    }
    
    return badges;
  }, [systemStatus]);

  if (badges.length === 0) return null;

  return (
    <div className="flex gap-1 mt-1">
      {badges.map((badge, index) => (
        <span
          key={index}
          className={`px-2 py-1 text-xs rounded-full ${badge.color}`}
        >
          {badge.text}
        </span>
      ))}
    </div>
  );
});

SystemStatusBadge.displayName = 'SystemStatusBadge';

// 성능 메트릭 표시 컴포넌트 (메모화)
const PerformanceMetrics = memo(({ 
  performanceMetrics 
}: { 
  performanceMetrics: UseVoteRealtimeOptimizedReturn['performanceMetrics'] 
}) => {
  const formatMemoryUsage = useMemo(() => {
    if (performanceMetrics.memoryUsage === null) return 'N/A';
    return `${(performanceMetrics.memoryUsage / 1024 / 1024).toFixed(1)}MB`;
  }, [performanceMetrics.memoryUsage]);

  const renderCount = performanceMetrics.renderCount;
  const isHighRenderCount = renderCount > 50;
  const eventCount = performanceMetrics.eventCount || 0;

  return (
    <div className="text-xs text-gray-600 space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="font-medium">렌더링:</span>
          <span className={isHighRenderCount ? 'text-orange-600 ml-1 font-medium' : 'ml-1'}>
            {renderCount}회
            {isHighRenderCount && ' ⚠️'}
          </span>
        </div>
        <div>
          <span className="font-medium">메모리:</span>
          <span className="ml-1">{formatMemoryUsage}</span>
        </div>
      </div>
      <div>
        <span className="font-medium">이벤트:</span>
        <span className="ml-1">{eventCount}개</span>
      </div>
      <div className="text-xs text-gray-500">
        마지막 렌더: {new Date(performanceMetrics.lastRenderTime).toLocaleTimeString()}
      </div>
    </div>
  );
});

PerformanceMetrics.displayName = 'PerformanceMetrics';

// 컨트롤 패널 컴포넌트 (메모화)
const ControlPanel = memo(({
  onToggleSmartReconnect,
  onToggleBatterySaver,
  smartReconnectEnabled,
  batterySaverEnabled
}: {
  onToggleSmartReconnect?: () => void;
  onToggleBatterySaver?: () => void;
  smartReconnectEnabled?: boolean;
  batterySaverEnabled?: boolean;
}) => {
  if (!onToggleSmartReconnect && !onToggleBatterySaver) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-gray-200">
      <div className="text-xs font-medium text-gray-700">최적화 설정</div>
      <div className="space-y-1">
        {onToggleSmartReconnect && (
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-gray-600">스마트 재연결</span>
            <button
              onClick={onToggleSmartReconnect}
              className={`w-8 h-4 rounded-full transition-colors ${
                smartReconnectEnabled ? 'bg-blue-500' : 'bg-gray-300'
              }`}
              aria-label={`스마트 재연결 ${smartReconnectEnabled ? '비활성화' : '활성화'}`}
              tabIndex={0}
            >
              <div
                className={`w-3 h-3 bg-white rounded-full transition-transform ${
                  smartReconnectEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        )}
        {onToggleBatterySaver && (
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs text-gray-600">배터리 절약</span>
            <button
              onClick={onToggleBatterySaver}
              className={`w-8 h-4 rounded-full transition-colors ${
                batterySaverEnabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
              aria-label={`배터리 절약 ${batterySaverEnabled ? '비활성화' : '활성화'}`}
              tabIndex={0}
            >
              <div
                className={`w-3 h-3 bg-white rounded-full transition-transform ${
                  batterySaverEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        )}
      </div>
    </div>
  );
});

ControlPanel.displayName = 'ControlPanel';

// 메인 컴포넌트 (메모화)
const OptimizedConnectionStatusDisplay = memo(({
  connectionStatus,
  connectionInfo,
  systemStatus,
  performanceMetrics,
  onToggleSmartReconnect,
  onToggleBatterySaver,
  smartReconnectEnabled = true,
  batterySaverEnabled = true,
  showDetails = false,
  isCompact = false
}: OptimizedConnectionStatusDisplayProps) => {
  // 상태 텍스트 계산 (메모화)
  const statusText = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return isCompact ? '연결됨' : '실시간 연결됨';
      case 'connecting':
        return '연결 중...';
      case 'reconnecting':
        return `재연결 중... (${connectionInfo.reconnectAttempts}/${connectionInfo.maxReconnectAttempts})`;
      case 'disconnected':
        return '연결 해제됨';
      case 'error':
        return `오류: ${connectionInfo.lastError?.message || '알 수 없는 오류'}`;
      case 'network_error':
        return '네트워크 오류';
      case 'suspended':
        return '일시 중단됨';
      default:
        return '상태 확인 중';
    }
  }, [connectionStatus, connectionInfo, isCompact]);

  // 컴팩트 모드
  if (isCompact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <ConnectionStatusIcon status={connectionStatus} />
        <span className="text-gray-600">{statusText}</span>
        <SystemStatusBadge systemStatus={systemStatus} />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm" role="status">
      {/* 기본 상태 정보 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ConnectionStatusIcon status={connectionStatus} />
          <span className="text-sm font-medium text-gray-900">{statusText}</span>
        </div>
        <div className="text-xs text-gray-500">
          {connectionInfo.lastConnected && (
            <>마지막 연결: {connectionInfo.lastConnected.toLocaleTimeString()}</>
          )}
        </div>
      </div>

      {/* 시스템 상태 배지 */}
      <SystemStatusBadge systemStatus={systemStatus} />

      {/* 상세 정보 */}
      {showDetails && (
        <div className="mt-3 space-y-3">
          {/* 연결 정보 */}
          <div className="text-xs text-gray-600 space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="font-medium">네트워크:</span>
                <span className="ml-1">
                  {systemStatus.isOnline ? '온라인' : '오프라인'}
                  {systemStatus.connectionType && ` (${systemStatus.connectionType})`}
                </span>
              </div>
              <div>
                <span className="font-medium">페이지:</span>
                <span className="ml-1">
                  {systemStatus.isPageVisible ? '활성' : '백그라운드'}
                </span>
              </div>
            </div>
            {systemStatus.battery.level !== null && (
              <div>
                <span className="font-medium">배터리:</span>
                <span className="ml-1">
                  {Math.round(systemStatus.battery.level * 100)}%
                  {systemStatus.battery.isCharging ? ' (충전 중)' : ''}
                </span>
              </div>
            )}
          </div>

          {/* 성능 메트릭 */}
          <PerformanceMetrics performanceMetrics={performanceMetrics} />

          {/* 컨트롤 패널 */}
          <ControlPanel
            onToggleSmartReconnect={onToggleSmartReconnect}
            onToggleBatterySaver={onToggleBatterySaver}
            smartReconnectEnabled={smartReconnectEnabled}
            batterySaverEnabled={batterySaverEnabled}
          />
        </div>
      )}
    </div>
  );
});

OptimizedConnectionStatusDisplay.displayName = 'OptimizedConnectionStatusDisplay';

export default OptimizedConnectionStatusDisplay;