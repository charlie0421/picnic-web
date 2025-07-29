'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import {
  getVoteStatus,
  formatRemainingTime,
  formatTimeUntilStart,
} from '@/components/server/utils';
import { formatVotePeriodWithTimeZone } from '@/utils/date';
import { VoteCard, VoteRankCard } from '..';
import { VoteTimer } from '../common/VoteTimer';
import { VoteSearch } from './VoteSearch';
import { VoteButton } from '../common/VoteButton';
import { Badge, Card } from '@/components/common';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { getCdnImageUrl } from '@/utils/api/image';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { useAuth } from '@/lib/supabase/auth-provider';

// Task 4에서 만든 리얼타임 컴포넌트들 import
import { useVoteRealtime } from '@/hooks/useVoteRealtime';
import { RealtimeStatus } from '@/components/client/vote/common/RealtimeStatus';
import OptimizedRealtimeVoteResults from '@/components/client/vote/list/OptimizedRealtimeVoteResults';
import { AnimatedCount } from '@/components/ui/animations/RealtimeAnimations';
import { motion, AnimatePresence } from 'framer-motion';

export interface RealtimeVoteDetailPresenterProps {
  vote: Vote;
  initialItems: VoteItem[];
  rewards?: any[];
  className?: string;
}

export function RealtimeVoteDetailPresenter({
  vote,
  initialItems,
  rewards = [],
  className,
}: RealtimeVoteDetailPresenterProps) {
  const { currentLanguage } = useLanguageStore();
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });
  const { user } = useAuth();

  // 기존 상태들
  const [selectedItem, setSelectedItem] = useState<VoteItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isVoting, setIsVoting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voteCandidate, setVoteCandidate] = useState<VoteItem | null>(null);
  const [voteAmount, setVoteAmount] = useState(1);
  const [availableVotes, setAvailableVotes] = useState(10);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // 리얼타임 상태 관리
  const [realtimeVoteItems, setRealtimeVoteItems] = useState<VoteItem[]>(initialItems);
  const [realtimeTotalVotes, setRealtimeTotalVotes] = useState<number>(
    initialItems.reduce((sum, item) => sum + (item.vote_total || 0), 0)
  );

  // 리얼타임 훅 사용
  const {
    connectionStatus,
    isConnected,
    lastEvent,
    eventCount,
  } = useVoteRealtime({
    voteId: vote.id,
    autoConnect: true,
    onVoteUpdate: (event) => {
      console.log('실시간 투표 업데이트:', event);
      
      // 이벤트에 따라 상태 업데이트
      if (event.type === 'vote_item_updated' && event.payload) {
        const updatedItem = event.payload as unknown as VoteItem;
        
        setRealtimeVoteItems(prev => 
          prev.map(item => 
            item.id === updatedItem.id 
              ? { ...item, vote_total: updatedItem.vote_total }
              : item
          )
        );
        
        // 총 투표 수 재계산
        setRealtimeTotalVotes(prev => {
          const currentItem = realtimeVoteItems.find(item => item.id === updatedItem.id);
          const oldTotal = currentItem?.vote_total || 0;
          return prev - oldTotal + (updatedItem.vote_total || 0);
        });
      } else if (event.type === 'vote_pick_created') {
        // 새로운 투표가 생성되었을 때의 처리
        // 데이터베이스 트리거가 vote_item을 업데이트하므로,
        // 클라이언트에서는 별도 처리가 필요 없을 수 있음.
        // 필요한 경우, 여기서 관련 아이템을 다시 fetch 할 수 있음.
        console.log('새로운 투표 생성:', event.payload);
      }
    },
    onConnectionStatusChange: (status) => {
      console.log('연결 상태 변경:', status);
    },
  });

  // 실시간 데이터 우선 사용, 없으면 초기 데이터 사용
  const voteItems = realtimeVoteItems;
  
  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';

  // 남은 시간 계산 및 업데이트
  useEffect(() => {
    if (!vote.stop_at || voteStatus !== 'ongoing') return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const endTime = new Date(vote.stop_at!).getTime();
      const difference = endTime - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor(
          (difference % (1000 * 60 * 60)) / (1000 * 60),
        );
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [vote.stop_at, voteStatus]);

  // 투표 기간 포맷팅 (시간대 정보 포함)
  const formatVotePeriod = () => {
    if (!vote.start_at || !vote.stop_at) return '';

    // 새로운 시간대 포맷팅 함수 사용
    return formatVotePeriodWithTimeZone(vote.start_at, vote.stop_at, currentLanguage);
  };

  // 타이머 렌더링 (애니메이션 추가)
  const renderTimer = () => {
    if (voteStatus !== 'ongoing' || !timeLeft) return null;

    const { days, hours, minutes, seconds } = timeLeft;
    const isExpired =
      days === 0 && hours === 0 && minutes === 0 && seconds === 0;

    if (isExpired) {
      return (
        <motion.div 
          className='flex items-center gap-2'
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <span className='text-xl'>🚫</span>
          <span className='text-sm md:text-base font-bold text-red-600'>
            마감
          </span>
        </motion.div>
      );
    }

    return (
      <motion.div 
        className='flex items-center gap-2'
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className='text-xl'>⏱️</span>
        <div className='flex items-center gap-1 text-xs sm:text-sm font-mono font-bold'>
          <motion.span 
            className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'
            key={`days-${days}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatedCount value={days} suffix="일" />
          </motion.span>
          <span className='text-gray-400'>:</span>
          <motion.span 
            className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'
            key={`hours-${hours}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatedCount value={hours} suffix="시" />
          </motion.span>
          <span className='text-gray-400'>:</span>
          <motion.span 
            className='bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs'
            key={`minutes-${minutes}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatedCount value={minutes} suffix="분" />
          </motion.span>
          <span className='text-gray-400'>:</span>
          <motion.span 
            className='bg-red-100 text-red-800 px-1.5 py-0.5 rounded animate-pulse text-xs'
            key={`seconds-${seconds}`}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatedCount value={seconds} suffix="초" />
          </motion.span>
        </div>
      </motion.div>
    );
  };

  // 투표 아이템 랭킹 계산 (애니메이션을 위한 이전 순위 추적)
  const rankedVoteItems = useMemo(() => {
    if (!voteItems.length) return [];

    const sortedItems = [...voteItems].sort(
      (a, b) => (b.vote_total || 0) - (a.vote_total || 0),
    );

    let currentRank = 1;
    let currentScore = sortedItems[0]?.vote_total || 0;

    return sortedItems.map((item, index) => {
      if (index > 0 && currentScore !== (item.vote_total || 0)) {
        currentRank = index + 1;
        currentScore = item.vote_total || 0;
      }

      return {
        ...item,
        rank: currentRank,
      };
    });
  }, [voteItems]);

  // 검색 필터링
  const filteredItems = useMemo(() => {
    if (!searchQuery) return rankedVoteItems;

    return rankedVoteItems.filter((item) => {
      const artistName = item.artist?.name
        ? getLocalizedString(
            item.artist.name,
            currentLanguage,
          )?.toLowerCase() || ''
        : '';
      const query = searchQuery.toLowerCase();
      return artistName.includes(query);
    });
  }, [rankedVoteItems, searchQuery, currentLanguage]);

  // 투표 확인 팝업 열기
  const handleCardClick = async (item: VoteItem) => {
    if (!canVote) return;

    await withAuth(() => {
      setVoteCandidate(item);
      setShowVoteModal(true);
    });
  };

  // 투표 실행
  const confirmVote = async () => {
    if (!voteCandidate || !canVote || isVoting || !user) return;

    setIsVoting(true);
    try {
      console.log('📤 [RealtimeVoteDetailPresenter] 투표 제출 시작:', {
        voteId: vote.id,
        voteItemId: voteCandidate.id,
        amount: voteAmount,
      });

      const voteData = {
        vote_id: vote.id,
        vote_item_id: voteCandidate.id,
        amount: voteAmount,
      };

      const response = await fetch('/api/vote/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(voteData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '투표 처리 중 오류가 발생했습니다.');
      }

      console.log('✅ [RealtimeVoteDetailPresenter] 투표 제출 성공:', result);

      // 투표 성공 후 사용자 보유 투표량 감소
      setAvailableVotes(prev => Math.max(0, prev - voteAmount));
      setShowVoteModal(false);
      setVoteCandidate(null);
      setVoteAmount(1);
    } catch (error) {
      console.error('투표 실행 중 오류:', error);
      // TODO: 에러 처리
    } finally {
      setIsVoting(false);
    }
  };

  // 투표 취소
  const cancelVote = () => {
    setShowVoteModal(false);
    setVoteCandidate(null);
    setVoteAmount(1);
  };

  // 헤더 높이 계산
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, []);

  // 투표 제목 가져오기
  const voteTitle = useMemo(() => {
    if (!vote.title) return '투표';
    
    if (typeof vote.title === 'string') {
      return vote.title;
    }
    
    return getLocalizedString(vote.title, currentLanguage) || '투표';
  }, [vote.title, currentLanguage]);

  // 총 투표 수 계산
  const totalVotes = useMemo(() => {
    return realtimeTotalVotes || voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0);
  }, [realtimeTotalVotes, voteItems]);

  // 검색 핸들러
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className={`max-w-6xl mx-auto p-4 space-y-6 ${className}`}>
      {/* 상단 헤더 - 고정 */}
      <motion.div 
        ref={headerRef}
        className="sticky top-0 z-10 bg-white border-b border-gray-200 pb-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* 투표 기본 정보 */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <motion.h1 
                className="text-2xl lg:text-3xl font-bold text-gray-900"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                {voteTitle}
              </motion.h1>
              <Badge 
                variant={
                  voteStatus === 'ongoing' ? 'success' :
                  voteStatus === 'upcoming' ? 'warning' : 'default'
                }
                size="sm"
              >
                {voteStatus === 'ongoing' ? '진행 중' :
                 voteStatus === 'upcoming' ? '예정' : '종료'}
              </Badge>
            </div>
            
            <motion.div 
              className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-gray-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <span>📅 {formatVotePeriod()}</span>
              <span className="hidden sm:inline">•</span>
              <span>👥 총 <AnimatedCount value={totalVotes} /> 표</span>
              <span className="hidden sm:inline">•</span>
              <span>🏆 {filteredItems.length}명 참여</span>
            </motion.div>
          </div>

          {/* 타이머 & 실시간 상태 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {renderTimer()}
            <RealtimeStatus 
              voteId={vote.id}
              compact={true}
            />
          </div>
        </div>

        {/* 검색 */}
        <motion.div 
          className="w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <VoteSearch 
            onSearch={handleSearch}
            placeholder={`${rankedVoteItems.length}명 중 검색...`}
            totalItems={rankedVoteItems.length}
          />
        </motion.div>
      </motion.div>

      {/* 실시간 투표 결과 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <OptimizedRealtimeVoteResults 
          voteId={vote.id}
          showDebugInfo={process.env.NODE_ENV === 'development'}
          enablePerformanceMonitoring={process.env.NODE_ENV === 'development'}
        />
      </motion.div>

      {/* 투표 확인 모달 */}
      <AnimatePresence>
        {showVoteModal && voteCandidate && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelVote}
          >
            <motion.div 
              className="bg-white rounded-lg p-6 m-4 max-w-md w-full"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">투표 확인</h3>
              
              <div className="mb-4">
                <p className="text-gray-600 mb-2">
                  {voteCandidate.artist?.name ? 
                    getLocalizedString(voteCandidate.artist.name, currentLanguage) :
                    '알 수 없는 아티스트'
                  }에게 투표하시겠습니까?
                </p>
                
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm font-medium">투표 수:</label>
                  <input 
                    type="number"
                    min="1"
                    max={availableVotes}
                    value={voteAmount}
                    onChange={(e) => setVoteAmount(Math.min(availableVotes, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="border rounded px-2 py-1 w-20 text-center"
                  />
                </div>
                
                <p className="text-xs text-gray-500">
                  사용 가능한 투표: {availableVotes}표
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={cancelVote}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button 
                  onClick={confirmVote}
                  disabled={isVoting || voteAmount > availableVotes}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isVoting ? '투표 중...' : '투표하기'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 리워드 섹션 (있는 경우) */}
      {rewards.length > 0 && (
        <motion.section 
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <h2 className="text-xl font-semibold mb-4">🎁 투표 리워드</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rewards.map((reward, index) => (
              <motion.div 
                key={reward.id || index}
                className="border rounded-lg p-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + index * 0.1, duration: 0.5 }}
              >
                {/* TODO: 리워드 카드 구현 */}
                <p>리워드 #{index + 1}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* 실시간 상태 정보 (개발 모드) */}
      {process.env.NODE_ENV === 'development' && (
        <motion.div 
          className="mt-8 p-4 bg-gray-50 rounded-lg border"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <h3 className="font-semibold mb-2">🔧 개발자 정보</h3>
          <div className="text-sm space-y-1 text-gray-600">
            <p>연결 상태: {isConnected ? '🟢 연결됨' : '🔴 연결 안됨'}</p>
            <p>이벤트 수: {eventCount}</p>
            <p>마지막 이벤트: {lastEvent ? new Date().toLocaleTimeString() : 'None'}</p>
            <p>연결 상태: {connectionStatus}</p>
          </div>
        </motion.div>
      )}
    </div>
  );
} 