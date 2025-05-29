'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { VoteResults, VoteResultsProps } from './VoteResults';
import { useVoteRealtimeEnhanced } from '@/hooks/useVoteRealtimeEnhanced';
import { RealtimeIndicator } from '../common/RealtimeStatus';
import { useVoteStore } from '@/stores/voteStore';
import { VoteItem } from '@/types/interfaces';
import { 
  AnimatedVoteList, 
  RealtimePulse, 
  ConnectionStatus,
  VoteSkeleton 
} from '@/components/ui/animations/RealtimeAnimations';
import { 
  EnhancedConnectionStatusDisplay, 
  SimpleConnectionIndicator 
} from '../common/ConnectionStatusDisplay';

export interface RealtimeVoteResultsProps extends Omit<VoteResultsProps, 'voteItems' | 'totalVotes' | 'isLoading'> {
  voteId: number;
  // 실시간 업데이트 관련 옵션
  enableRealtime?: boolean;
  showRealtimeIndicator?: boolean;
  animateChanges?: boolean;
  updateInterval?: number; // 폴백 업데이트 간격 (ms)
  // 애니메이션 옵션
  highlightNewUpdates?: boolean;
  highlightDuration?: number; // ms
  // 연결 상태 표시 옵션
  showConnectionStatus?: boolean;
  showDetailedConnectionInfo?: boolean;
  showAdvancedControls?: boolean;
  allowManualReconnect?: boolean;
  // 데이터 동기화 옵션
  enableDataSync?: boolean;
  maxRetries?: number;
  // 스마트 연결 옵션
  enableSmartReconnect?: boolean;
  enableBatterySaver?: boolean;
}

export function RealtimeVoteResults({
  voteId,
  enableRealtime = true,
  showRealtimeIndicator = true,
  animateChanges = true,
  updateInterval = 30000,
  highlightNewUpdates = true,
  highlightDuration = 3000,
  showConnectionStatus = true,
  showDetailedConnectionInfo = false,
  showAdvancedControls = false,
  allowManualReconnect = true,
  enableDataSync = true,
  maxRetries = 10,
  enableSmartReconnect = true,
  enableBatterySaver = true,
  ...voteResultsProps
}: RealtimeVoteResultsProps) {
  // 실시간 데이터 상태
  const { 
    voteItems, 
    totalVotes, 
    isLoading, 
    connectionStatus, 
    connectionInfo,
    realtimeService,
    lastUpdated, 
    error,
    networkStatus,
    batteryStatus,
    isPageVisible,
    manualReconnect,
    refreshData,
    toggleSmartReconnect,
    toggleBatterySaver
  } = useVoteRealtimeEnhanced({ 
    voteId, 
    enabled: enableRealtime,
    pollingInterval: updateInterval,
    enableDataSync,
    maxRetries,
    enableSmartReconnect,
    enableBatterySaver,
    onConnectionStatusChange: (status, info) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[RealtimeVoteResults] 연결 상태 변경:', status, info);
      }
    },
    onVoteUpdate: (event) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[RealtimeVoteResults] 투표 업데이트:', event);
      }
    },
    onError: (error) => {
      console.error('[RealtimeVoteResults] 오류:', error);
    }
  });

  // 하이라이트된 아이템 추적
  const [highlightedItems, setHighlightedItems] = useState<Set<number>>(new Set());

  // 실시간 업데이트 감지 및 하이라이트
  useEffect(() => {
    if (!highlightNewUpdates || !voteItems?.length) return;

    // 새로 업데이트된 아이템 감지 (여기서는 간단히 모든 아이템을 하이라이트)
    if (lastUpdated) {
      const newHighlights = new Set(voteItems.map(item => item.id));
      setHighlightedItems(newHighlights);
      
      // 하이라이트 제거
      const timer = setTimeout(() => {
        setHighlightedItems(new Set());
      }, highlightDuration);
      
      return () => clearTimeout(timer);
    }
  }, [lastUpdated, voteItems, highlightNewUpdates, highlightDuration]);

  // 실시간 정보가 추가된 투표 아이템들
  const enhancedVoteItems = useMemo(() => {
    if (!voteItems || !animateChanges) return voteItems;
    
    return voteItems.map(item => ({
      ...item,
      _realtimeInfo: {
        isHighlighted: highlightedItems.has(item.id),
        isNew: false, // 새 아이템 감지 로직은 별도 구현 필요
        isUpdated: highlightedItems.has(item.id),
        rankChange: 'same' as const // 순위 변경 감지 로직은 별도 구현 필요
      }
    }));
  }, [voteItems, animateChanges, highlightedItems]);

  // 연결 상태에 따른 사용자 피드백
  const getConnectionFeedback = () => {
    if (!networkStatus.isOnline) {
      return {
        type: 'warning' as const,
        message: '인터넷 연결이 끊어졌습니다. 온라인 상태가 되면 자동으로 다시 연결됩니다.',
        action: null
      };
    }

    if (!isPageVisible && connectionStatus !== 'connected') {
      return {
        type: 'info' as const,
        message: '페이지가 백그라운드에 있어 연결이 일시 중단되었습니다.',
        action: null
      };
    }

    if (batteryStatus.level !== null && batteryStatus.level < 0.15 && !batteryStatus.isCharging) {
      return {
        type: 'warning' as const,
        message: '배터리가 부족하여 실시간 업데이트가 제한됩니다.',
        action: enableBatterySaver ? '배터리 절약 모드 해제' : null
      };
    }

    if (networkStatus.isSlowConnection) {
      return {
        type: 'info' as const,
        message: '느린 네트워크 연결이 감지되어 업데이트 간격이 조정되었습니다.',
        action: null
      };
    }

    if (connectionStatus === 'error' && connectionInfo.reconnectAttempts >= connectionInfo.maxReconnectAttempts) {
      return {
        type: 'error' as const,
        message: '서버 연결에 계속 실패하고 있습니다. 수동으로 다시 시도해보세요.',
        action: '수동 재연결'
      };
    }

    return null;
  };

  const feedback = getConnectionFeedback();

  // 수동 재연결 핸들러
  const handleManualReconnect = () => {
    if (allowManualReconnect) {
      manualReconnect();
    }
  };

  // 데이터 새로고침 핸들러
  const handleDataRefresh = async () => {
    try {
      await refreshData();
    } catch (error) {
      console.error('데이터 새로고침 실패:', error);
    }
  };

  // 로딩 상태 (스켈레톤 표시)
  if (isLoading && !voteItems?.length) {
    return (
      <div className="space-y-4">
        {showConnectionStatus && connectionStatus && (
          <SimpleConnectionIndicator 
            status={connectionStatus}
            networkStatus={networkStatus}
            className="justify-center"
          />
        )}
        <VoteSkeleton count={5} />
      </div>
    );
  }

  // 오류 상태
  if (error && !voteItems?.length) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8">
          <div className="text-red-500 mb-2">⚠️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            투표 데이터를 불러올 수 없습니다
          </h3>
          <p className="text-gray-600 mb-4">
            {error.message}
          </p>
          <button
            onClick={handleDataRefresh}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 사용자 피드백 메시지 */}
      {feedback && (
        <div className={`p-3 rounded-lg border ${
          feedback.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
          feedback.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700' :
          'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm">{feedback.message}</span>
            {feedback.action && (
              <button
                onClick={feedback.action === '수동 재연결' ? handleManualReconnect : toggleBatterySaver}
                className="text-xs px-3 py-1 bg-white rounded border hover:bg-gray-50 transition-colors"
              >
                {feedback.action}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 연결 상태 표시 */}
      {showConnectionStatus && (
        <EnhancedConnectionStatusDisplay
          status={connectionStatus}
          connectionInfo={connectionInfo}
          networkStatus={networkStatus}
          batteryStatus={batteryStatus}
          isPageVisible={isPageVisible}
          smartReconnectEnabled={enableSmartReconnect}
          batterySaverEnabled={enableBatterySaver}
          onManualReconnect={handleManualReconnect}
          onToggleSmartReconnect={toggleSmartReconnect}
          onToggleBatterySaver={toggleBatterySaver}
          showDetails={showDetailedConnectionInfo}
          showAdvancedControls={showAdvancedControls}
          className="mb-4"
        />
      )}

      {/* 실시간 인디케이터 */}
      {showRealtimeIndicator && (
        <div className="flex items-center justify-between mb-4">
          <RealtimeIndicator 
            voteId={voteId} 
            className="text-sm"
          />
          <SimpleConnectionIndicator 
            status={connectionStatus}
            networkStatus={networkStatus}
            className="ml-auto"
          />
        </div>
      )}

      <RealtimePulse 
        isActive={connectionStatus === 'connected' && !!lastUpdated}
      >
        {/* 메인 투표 결과 */}
        {animateChanges && enhancedVoteItems ? (
          <AnimatedVoteList
            items={enhancedVoteItems}
            renderItem={(item, index) => (
              <VoteResults
                {...voteResultsProps}
                voteItems={[item]}
                totalVotes={totalVotes || 0}
                isLoading={false}
              />
            )}
            className="space-y-3"
          />
        ) : (
          <VoteResults
            {...voteResultsProps}
            voteItems={voteItems || []}
            totalVotes={totalVotes || 0}
            isLoading={isLoading}
          />
        )}
      </RealtimePulse>

      {/* 마지막 업데이트 시간과 시스템 정보 */}
      {(lastUpdated || showAdvancedControls) && showRealtimeIndicator && (
        <div className="mt-4 text-center space-y-2">
          {lastUpdated && (
            <span className="text-xs text-gray-500 block">
              마지막 업데이트: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          
          {showAdvancedControls && (
            <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
              {networkStatus.connectionType && (
                <span>네트워크: {networkStatus.connectionType}</span>
              )}
              {batteryStatus.level !== null && (
                <span className={
                  batteryStatus.level < 0.15 ? 'text-red-500' : 
                  batteryStatus.level < 0.3 ? 'text-orange-500' : 'text-green-500'
                }>
                  배터리: {Math.round(batteryStatus.level * 100)}%
                  {batteryStatus.isCharging ? ' (충전 중)' : ''}
                </span>
              )}
              <span>페이지: {isPageVisible ? '활성' : '비활성'}</span>
            </div>
          )}
        </div>
      )}

      {/* 개발 모드에서 연결 통계 표시 */}
      {process.env.NODE_ENV === 'development' && realtimeService && (
        <details className="mt-4 text-xs text-gray-500">
          <summary className="cursor-pointer">연결 통계 (개발 모드)</summary>
          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
            {JSON.stringify({
              connectionStatus,
              networkStatus,
              batteryStatus: {
                ...batteryStatus,
                level: batteryStatus.level ? Math.round(batteryStatus.level * 100) + '%' : null
              },
              isPageVisible,
              connectionInfo: {
                ...connectionInfo,
                lastConnected: connectionInfo.lastConnected?.toISOString(),
                nextReconnectAt: connectionInfo.nextReconnectAt?.toISOString()
              }
            }, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export default RealtimeVoteResults; 