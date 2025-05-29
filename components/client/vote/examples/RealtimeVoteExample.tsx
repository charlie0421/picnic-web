'use client';

import React, { useState } from 'react';
import { RealtimeVoteResults } from '../list';
import { VoteRealtimeProvider } from '@/contexts/VoteRealtimeContext';
import { RealtimeStatusPanel } from '../common/RealtimeStatus';

interface RealtimeVoteExampleProps {
  voteId: number;
  title?: string;
}

/**
 * 실시간 투표 결과 기능을 보여주는 예시 컴포넌트
 * 
 * 이 컴포넌트는 다음 기능들을 시연합니다:
 * - 실시간 투표 결과 업데이트
 * - 연결 상태 표시
 * - 애니메이션 효과
 * - 설정 옵션들
 */
export function RealtimeVoteExample({ 
  voteId, 
  title = '실시간 투표 결과' 
}: RealtimeVoteExampleProps) {
  const [enableRealtime, setEnableRealtime] = useState(true);
  const [showIndicator, setShowIndicator] = useState(true);
  const [animateChanges, setAnimateChanges] = useState(true);
  const [highlightNewVotes, setHighlightNewVotes] = useState(true);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 제목 */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600">
          실시간으로 업데이트되는 투표 결과를 확인하세요
        </p>
      </div>

      {/* 설정 패널 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">실시간 설정</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={enableRealtime}
              onChange={(e) => setEnableRealtime(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">실시간 업데이트</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={showIndicator}
              onChange={(e) => setShowIndicator(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">상태 표시</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={animateChanges}
              onChange={(e) => setAnimateChanges(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">애니메이션</span>
          </label>
          
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={highlightNewVotes}
              onChange={(e) => setHighlightNewVotes(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">하이라이트</span>
          </label>
        </div>
      </div>

      {/* 실시간 상태 패널 */}
      {enableRealtime && (
        <RealtimeStatusPanel voteId={voteId} />
      )}

      {/* 실시간 투표 결과 */}
      <div className="bg-white rounded-lg shadow-lg">
        <VoteRealtimeProvider voteId={voteId}>
          <RealtimeVoteResults
            voteId={voteId}
            enableRealtime={enableRealtime}
            showRealtimeIndicator={showIndicator}
            animateChanges={animateChanges}
            highlightNewUpdates={highlightNewVotes}
            highlightDuration={3000}
            updateInterval={30000}
            title="투표 순위"
            maxDisplayItems={10}
            showPercentage={true}
            showRanking={true}
          />
        </VoteRealtimeProvider>
      </div>

      {/* 사용법 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          💡 실시간 투표 결과 사용법
        </h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>실시간 업데이트:</strong> 다른 사용자가 투표하면 자동으로 결과가 업데이트됩니다.
          </p>
          <p>
            <strong>연결 상태:</strong> 우측 상단의 인디케이터로 실시간 연결 상태를 확인할 수 있습니다.
          </p>
          <p>
            <strong>애니메이션:</strong> 순위 변동이나 새로운 투표가 있을 때 시각적 효과가 나타납니다.
          </p>
          <p>
            <strong>폴백 모드:</strong> 실시간 연결이 실패하면 자동으로 주기적 업데이트로 전환됩니다.
          </p>
        </div>
      </div>

      {/* 기술 정보 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">기술 스택</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-1">프론트엔드</h4>
            <ul className="space-y-1">
              <li>• React 18 + Next.js 13+</li>
              <li>• Zustand (상태 관리)</li>
              <li>• Tailwind CSS (스타일링)</li>
              <li>• TypeScript (타입 안전성)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-1">백엔드</h4>
            <ul className="space-y-1">
              <li>• Supabase Realtime</li>
              <li>• PostgreSQL 트리거</li>
              <li>• WebSocket 연결</li>
              <li>• 자동 재연결 로직</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RealtimeVoteExample; 