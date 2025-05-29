'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectionStatus, ConnectionInfo } from '@/lib/supabase/realtime';

export interface EnhancedConnectionStatusDisplayProps {
  status: ConnectionStatus;
  connectionInfo: ConnectionInfo;
  networkStatus?: {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType: string | null;
  };
  batteryStatus?: {
    isCharging: boolean | null;
    level: number | null;
    chargingTime: number | null;
    dischargingTime: number | null;
  };
  isPageVisible?: boolean;
  smartReconnectEnabled?: boolean;
  batterySaverEnabled?: boolean;
  onManualReconnect?: () => void;
  onToggleSmartReconnect?: () => void;
  onToggleBatterySaver?: () => void;
  className?: string;
  showDetails?: boolean;
  showAdvancedControls?: boolean;
}

export function EnhancedConnectionStatusDisplay({
  status,
  connectionInfo,
  networkStatus,
  batteryStatus,
  isPageVisible = true,
  smartReconnectEnabled = true,
  batterySaverEnabled = true,
  onManualReconnect,
  onToggleSmartReconnect,
  onToggleBatterySaver,
  className = '',
  showDetails = false,
  showAdvancedControls = false
}: EnhancedConnectionStatusDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-700',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          title: '실시간 연결됨',
          message: '투표 결과가 실시간으로 업데이트됩니다.',
          icon: '🟢',
          showReconnect: false,
          severity: 'success' as const
        };
      case 'connecting':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-700',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          title: '연결 중...',
          message: '실시간 업데이트를 위해 서버에 연결하고 있습니다.',
          icon: '🟡',
          showReconnect: false,
          severity: 'warning' as const
        };
      case 'reconnecting':
        return {
          color: 'bg-blue-500',
          textColor: 'text-blue-700',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          title: '재연결 중...',
          message: `재연결을 시도하고 있습니다. (${connectionInfo.reconnectAttempts}/${connectionInfo.maxReconnectAttempts})`,
          icon: '🔄',
          showReconnect: false,
          severity: 'info' as const
        };
      case 'disconnected':
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-700',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          title: '연결 끊김',
          message: '실시간 업데이트가 일시적으로 중단되었습니다.',
          icon: '⚪',
          showReconnect: true,
          severity: 'neutral' as const
        };
      case 'network_error':
        return {
          color: 'bg-orange-500',
          textColor: 'text-orange-700',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          title: '네트워크 오류',
          message: networkStatus?.isOnline ? 
            '네트워크 연결이 불안정합니다.' : 
            '인터넷 연결을 확인해주세요.',
          icon: '📡',
          showReconnect: networkStatus?.isOnline ?? true,
          severity: 'warning' as const
        };
      case 'suspended':
        return {
          color: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          title: '연결 일시 중단',
          message: '배터리 절약을 위해 백그라운드에서 연결이 일시 중단되었습니다.',
          icon: '⏸️',
          showReconnect: false,
          severity: 'neutral' as const
        };
      case 'error':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-700',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          title: '연결 오류',
          message: connectionInfo.lastError?.message || '서버 연결에 실패했습니다.',
          icon: '🔴',
          showReconnect: true,
          severity: 'error' as const
        };
    }
  };

  const config = getStatusConfig();

  // 연결 품질 표시
  const getConnectionQuality = () => {
    if (!networkStatus) return null;

    if (!networkStatus.isOnline) return { level: 0, text: '오프라인', color: 'text-red-500' };
    if (networkStatus.isSlowConnection) return { level: 1, text: '느림', color: 'text-orange-500' };
    
    switch (networkStatus.connectionType) {
      case '4g':
      case 'wifi':
        return { level: 3, text: '좋음', color: 'text-green-500' };
      case '3g':
        return { level: 2, text: '보통', color: 'text-yellow-500' };
      case '2g':
      case 'slow-2g':
        return { level: 1, text: '느림', color: 'text-orange-500' };
      default:
        return { level: 2, text: '보통', color: 'text-gray-500' };
    }
  };

  const connectionQuality = getConnectionQuality();

  // 배터리 표시
  const getBatteryDisplay = () => {
    if (!batteryStatus || batteryStatus.level === null) return null;

    const percentage = Math.round(batteryStatus.level * 100);
    const isLow = percentage < 15;
    const isCritical = percentage < 5;

    return {
      percentage,
      isCharging: batteryStatus.isCharging,
      isLow,
      isCritical,
      icon: batteryStatus.isCharging ? '🔌' : (isCritical ? '🪫' : (isLow ? '🔋' : '🔋')),
      color: isCritical ? 'text-red-500' : (isLow ? 'text-orange-500' : 'text-green-500')
    };
  };

  const batteryDisplay = getBatteryDisplay();

  // 연결되어 있고 상세정보를 보지 않으면 표시하지 않음
  if (status === 'connected' && !showDetails && !showAdvancedControls) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4 ${className}`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-start space-x-3">
            {/* 상태 아이콘 */}
            <motion.div
              className={`w-4 h-4 rounded-full ${config.color} mt-0.5`}
              animate={
                status === 'connecting' || status === 'reconnecting' || status === 'error' ? {
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.7, 1]
                } : {}
              }
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />

            <div className="flex-1 min-w-0">
              {/* 제목과 품질 표시 */}
              <div className="flex items-center space-x-2">
                <h4 className={`text-sm font-medium ${config.textColor}`}>
                  {config.title}
                </h4>
                {connectionQuality && (
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-white ${connectionQuality.color}`}>
                    {connectionQuality.text}
                  </span>
                )}
              </div>
              
              {/* 메시지 */}
              <p className="text-xs text-gray-600 mt-1">
                {config.message}
              </p>
            </div>
          </div>

          {/* 확장/축소 버튼 (고급 기능이 있을 때만) */}
          {(showDetails || showAdvancedControls) && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                ⌄
              </motion.div>
            </button>
          )}
        </div>

        {/* 상세 정보 영역 */}
        <AnimatePresence>
          {isExpanded && (showDetails || showAdvancedControls) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3"
            >
              {/* 시스템 상태 */}
              {showDetails && (
                <div className="grid grid-cols-2 gap-4 text-xs">
                  {/* 네트워크 상태 */}
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">네트워크</div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span>온라인:</span>
                        <span>{networkStatus?.isOnline ? '✅' : '❌'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>연결 타입:</span>
                        <span>{networkStatus?.connectionType || '알 수 없음'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>느린 연결:</span>
                        <span>{networkStatus?.isSlowConnection ? '⚠️' : '✅'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 배터리 상태 */}
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">배터리</div>
                    {batteryDisplay ? (
                      <div className="space-y-0.5">
                        <div className="flex justify-between items-center">
                          <span>잔량:</span>
                          <span className={`flex items-center space-x-1 ${batteryDisplay.color}`}>
                            <span>{batteryDisplay.icon}</span>
                            <span>{batteryDisplay.percentage}%</span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>충전 중:</span>
                          <span>{batteryDisplay.isCharging ? '🔌' : '🔋'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-500">지원 안됨</div>
                    )}
                  </div>

                  {/* 페이지 상태 */}
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">페이지</div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span>활성 상태:</span>
                        <span>{isPageVisible ? '👀' : '🙈'}</span>
                      </div>
                      {connectionInfo.lastConnected && (
                        <div className="flex justify-between">
                          <span>마지막 연결:</span>
                          <span>{connectionInfo.lastConnected.toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 연결 통계 */}
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">연결 정보</div>
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span>재연결 횟수:</span>
                        <span>{connectionInfo.reconnectAttempts}/{connectionInfo.maxReconnectAttempts}</span>
                      </div>
                      {connectionInfo.nextReconnectAt && (
                        <div className="flex justify-between">
                          <span>다음 재연결:</span>
                          <span>{connectionInfo.nextReconnectAt.toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 오류 정보 */}
              {connectionInfo.lastError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                  <div className="font-medium text-red-700">마지막 오류:</div>
                  <div className="text-red-600 mt-1">
                    {connectionInfo.lastError.type}: {connectionInfo.lastError.message}
                  </div>
                </div>
              )}

              {/* 고급 제어 */}
              {showAdvancedControls && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  {/* 토글 스위치들 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">스마트 재연결</span>
                      <button
                        onClick={onToggleSmartReconnect}
                        className={`w-8 h-4 rounded-full transition-colors ${
                          smartReconnectEnabled ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                      >
                        <motion.div
                          className="w-3 h-3 bg-white rounded-full shadow"
                          animate={{ x: smartReconnectEnabled ? 18 : 2 }}
                          transition={{ duration: 0.2 }}
                        />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">배터리 절약</span>
                      <button
                        onClick={onToggleBatterySaver}
                        className={`w-8 h-4 rounded-full transition-colors ${
                          batterySaverEnabled ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <motion.div
                          className="w-3 h-3 bg-white rounded-full shadow"
                          animate={{ x: batterySaverEnabled ? 18 : 2 }}
                          transition={{ duration: 0.2 }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* 액션 버튼들 */}
                  <div className="flex space-x-2">
                    {config.showReconnect && onManualReconnect && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onManualReconnect}
                        className="flex-1 px-3 py-2 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      >
                        수동 재연결
                      </motion.button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 빠른 액션 (항상 표시) */}
        {!isExpanded && config.showReconnect && onManualReconnect && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onManualReconnect}
            className="mt-3 w-full px-3 py-2 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            다시 연결
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// 기존 ConnectionStatusDisplay (호환성 유지)
export interface ConnectionStatusDisplayProps {
  status: ConnectionStatus;
  connectionInfo: ConnectionInfo;
  onManualReconnect?: () => void;
  className?: string;
  showDetails?: boolean;
}

export function ConnectionStatusDisplay(props: ConnectionStatusDisplayProps) {
  return <EnhancedConnectionStatusDisplay {...props} />;
}

// 간단한 상태 인디케이터 (헤더나 푸터용)
export interface SimpleConnectionIndicatorProps {
  status: ConnectionStatus;
  networkStatus?: {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType: string | null;
  };
  className?: string;
}

export function SimpleConnectionIndicator({
  status,
  networkStatus,
  className = ''
}: SimpleConnectionIndicatorProps) {
  if (status === 'connected' && networkStatus?.isOnline) {
    return null; // 완전히 정상인 상태에서는 표시하지 않음
  }

  const getIndicatorConfig = () => {
    // 네트워크 오프라인 상태 우선 처리
    if (networkStatus && !networkStatus.isOnline) {
      return { color: 'bg-red-400', text: '오프라인', pulse: true };
    }

    switch (status) {
      case 'connecting':
      case 'reconnecting':
        return { color: 'bg-yellow-400', text: '연결 중', pulse: true };
      case 'network_error':
        return { color: 'bg-orange-400', text: '네트워크 오류', pulse: true };
      case 'error':
        return { color: 'bg-red-400', text: '연결 오류', pulse: true };
      case 'suspended':
        return { color: 'bg-gray-400', text: '일시 중단', pulse: false };
      case 'connected':
        // 연결되어 있지만 느린 연결인 경우
        if (networkStatus?.isSlowConnection) {
          return { color: 'bg-orange-400', text: '느린 연결', pulse: false };
        }
        return { color: 'bg-green-400', text: '연결됨', pulse: false };
      default:
        return { color: 'bg-gray-400', text: '연결 안됨', pulse: false };
    }
  };

  const config = getIndicatorConfig();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center space-x-2 ${className}`}
    >
      <motion.div
        className={`w-2 h-2 rounded-full ${config.color}`}
        animate={config.pulse ? {
          scale: [1, 1.3, 1],
          opacity: [1, 0.6, 1]
        } : {}}
        transition={{
          duration: 1.2,
          repeat: config.pulse ? Infinity : 0,
          ease: "easeInOut"
        }}
      />
      <span className="text-xs text-gray-600">
        {config.text}
      </span>
    </motion.div>
  );
} 