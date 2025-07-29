'use client';

import React, { memo, useState, useMemo, useCallback } from 'react';
import { useVoteRealtimeOptimized } from '@/hooks/useVoteRealtimeOptimized';
import OptimizedConnectionStatusDisplay from '../common/OptimizedConnectionStatusDisplay';
import { VoteItem } from '@/types/interfaces';
import { getLocalizedString, hasValidLocalizedString } from '@/utils/api/strings';
import { useLanguageStore } from '@/stores/languageStore';

interface OptimizedRealtimeVoteResultsProps {
  voteId: number;
  artistVoteId?: number;
  showDebugInfo?: boolean;
  enablePerformanceMonitoring?: boolean;
}

// 투표 아이템 컴포넌트 (메모화)
const VoteItemRow = memo(({ 
  item, 
  totalVotes, 
  rank 
}: { 
  item: VoteItem; 
  totalVotes: number;
  rank: number;
}) => {
  const { currentLanguage } = useLanguageStore();
  
  const percentage = useMemo(() => {
    return totalVotes > 0 && item.vote_total ? (item.vote_total / totalVotes * 100) : 0;
  }, [item.vote_total, totalVotes]);

  const isWinning = rank === 1 && totalVotes > 0;

  // 제목 추출 (아티스트 이름 우선, 그룹 이름은 별도 표시)
  const title = useMemo(() => {
    if (item.artist?.name && hasValidLocalizedString(item.artist.name)) {
      return getLocalizedString(item.artist.name, currentLanguage);
    }
    return `투표 항목 ${item.id}`;
  }, [item.artist, item.id, currentLanguage]);

  // 그룹 이름 추출
  const groupName = useMemo(() => {
    if (item.artist?.artistGroup?.name && hasValidLocalizedString(item.artist.artistGroup.name)) {
      return getLocalizedString(item.artist.artistGroup.name, currentLanguage);
    }
    return null;
  }, [item.artist?.artistGroup, currentLanguage]);

  return (
    <div className={`p-4 border rounded-lg transition-all duration-300 ${
      isWinning ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`font-bold text-lg ${
            isWinning ? 'text-yellow-600' : 'text-gray-700'
          }`}>
            #{rank}
          </span>
          <div>
            <h3 className="font-medium text-gray-900">{title}</h3>
            {groupName && (
              <p className="text-sm text-gray-600">{groupName}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg text-blue-600">
            {(item.vote_total || 0).toLocaleString()}표
          </div>
          <div className="text-sm text-gray-500">
            {percentage.toFixed(1)}%
          </div>
        </div>
      </div>
      
      {/* 진행 바 */}
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${
            isWinning ? 'bg-yellow-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
    </div>
  );
});

VoteItemRow.displayName = 'VoteItemRow';

// 로딩 스켈레톤 컴포넌트 (메모화)
const LoadingSkeleton = memo(() => (
  <div className="space-y-4">
    {[...Array(3)].map((_, index) => (
      <div key={index} className="animate-pulse">
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-6 bg-gray-300 rounded"></div>
              <div className="w-32 h-5 bg-gray-300 rounded"></div>
            </div>
            <div className="text-right">
              <div className="w-16 h-6 bg-gray-300 rounded mb-1"></div>
              <div className="w-12 h-4 bg-gray-300 rounded"></div>
            </div>
          </div>
          <div className="w-full h-3 bg-gray-300 rounded-full"></div>
        </div>
      </div>
    ))}
  </div>
));

LoadingSkeleton.displayName = 'LoadingSkeleton';

// 오류 표시 컴포넌트 (메모화)
const ErrorDisplay = memo(({ 
  error, 
  onRetry 
}: { 
  error: Error; 
  onRetry: () => void;
}) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-red-800 font-medium">연결 오류</h3>
        <p className="text-red-600 text-sm mt-1">{error.message}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        다시 시도
      </button>
    </div>
  </div>
));

ErrorDisplay.displayName = 'ErrorDisplay';

// 성능 모니터링 패널 (메모화)
const PerformanceMonitoringPanel = memo(({ 
  connectionStatus,
  eventCount
}: {
  connectionStatus: string;
  eventCount: number;
}) => (
  <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
    <h4 className="text-sm font-medium text-gray-700 mb-2">성능 모니터링</h4>
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <div className="text-gray-600">연결 상태:</div>
        <div className="font-mono text-gray-900">{connectionStatus}</div>
      </div>
      <div>
        <div className="text-gray-600">실시간 이벤트:</div>
        <div className="font-mono text-gray-900">{eventCount}개</div>
      </div>
    </div>
  </div>
));

PerformanceMonitoringPanel.displayName = 'PerformanceMonitoringPanel';

// 메인 컴포넌트
const OptimizedRealtimeVoteResults = memo(({
  voteId,
  artistVoteId,
  showDebugInfo = false,
  enablePerformanceMonitoring = false
}: OptimizedRealtimeVoteResultsProps) => {
  const [showDetails, setShowDetails] = useState(false);

  // 최적화된 실시간 훅 사용 (반환 값 수정)
  const {
    voteItems,
    totalVotes,
    isLoading,
    connectionStatus,
    error,
    eventCount,
    lastUpdated,
    refreshData,
  } = useVoteRealtimeOptimized({
    voteId,
    artistVoteId,
    enabled: true,
  });

  // 정렬된 투표 아이템 (메모화)
  const sortedVoteItems = useMemo(() => {
    if (!voteItems) return [];
    return [...voteItems].sort((a, b) => (b.vote_total || 0) - (a.vote_total || 0));
  }, [voteItems]);

  const handleRefresh = useCallback(async () => {
    try {
      await refreshData();
    } catch (err) {
      console.error('새로고침 실패:', err);
    }
  }, [refreshData]);
  
  // 재연결 핸들러는 이제 새로고침을 호출
  const handleReconnect = useCallback(() => {
    refreshData();
  }, [refreshData]);

  if (isLoading && !voteItems) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton />
        <div className="text-center text-gray-500 text-sm">
          투표 결과를 불러오는 중...
        </div>
      </div>
    );
  }

  if (error && !voteItems) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />;
  }

  return (
    <div className="space-y-4">
      <OptimizedConnectionStatusDisplay
        connectionStatus={connectionStatus}
        isCompact={!showDebugInfo}
      />

      {/* 컨트롤 패널 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            실시간 투표 결과
          </h2>
          {totalVotes !== null && (
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              총 {totalVotes.toLocaleString()}표
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {showDebugInfo && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {showDetails ? '간단히' : '상세히'}
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? '새로고침 중...' : '새로고침'}
          </button>
          {connectionStatus !== 'connected' && (
            <button
              onClick={handleReconnect}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              재연결
            </button>
          )}
        </div>
      </div>

      {/* 마지막 업데이트 시간 */}
      {lastUpdated && (
        <div className="text-xs text-gray-500 text-center">
          마지막 업데이트: {lastUpdated.toLocaleTimeString()}
        </div>
      )}

      {/* 투표 결과 목록 */}
      {sortedVoteItems.length > 0 ? (
        <div className="space-y-3">
          {sortedVoteItems.map((item, index) => (
            <VoteItemRow
              key={item.id}
              item={item}
              totalVotes={totalVotes || 0}
              rank={index + 1}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          아직 투표 결과가 없습니다.
        </div>
      )}

      {/* 성능 모니터링 패널 */}
      {enablePerformanceMonitoring && (
        <PerformanceMonitoringPanel
          connectionStatus={connectionStatus}
          eventCount={eventCount}
        />
      )}

      {/* 오류 알림 (데이터가 있는 상태에서 오류 발생) */}
      {error && voteItems && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="text-yellow-800 text-sm">
              ⚠️ 실시간 업데이트 중 오류 발생: {error.message}
            </div>
            <button
              onClick={handleReconnect}
              className="px-3 py-1 text-xs bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
            >
              재연결
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

OptimizedRealtimeVoteResults.displayName = 'OptimizedRealtimeVoteResults';

export default OptimizedRealtimeVoteResults; 