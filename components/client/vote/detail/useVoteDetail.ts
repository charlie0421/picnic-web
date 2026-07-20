import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Vote, VoteItem } from '@/types/interfaces';
import { getVoteStatus } from '@/components/server/utils';
import { useLanguageStore } from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { useRequireAuth } from '@/hooks/useAuthGuard';
import { useWithdrawalGuard } from '@/hooks/useWithdrawalGuard';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';

import {
  VoteDetailPresenterProps,
  SEARCH_DEBOUNCE_MS,
  HEADER_RECALC_DELAY_MS,
} from './vote-detail-types';
import { useVotePolling } from './useVotePolling';
import { filterActiveVoteItems, sumVoteTotals } from '../common/vote-display-utils';

export function useVoteDetail({
  vote,
  initialItems,
  rewards = [],
  className,
  enableRealtime = true,
  pollingInterval = 1000,
  maxRetries = 3,
  lang,
}: VoteDetailPresenterProps) {
  const storeLanguage = useLanguageStore((s) => s.currentLanguage);
  // SSR 과 client first-render 일치 보장: mount 전까지는 URL lang prop 사용.
  // zustand persist 가 localStorage 값으로 hydrate 하면 SSR(default 'en')과 달라
  // i18n 텍스트 (vote.title 등) 가 hydration mismatch 를 일으킴.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currentLanguage = mounted ? storeLanguage : lang;
  const { withAuth } = useRequireAuth({
    customLoginMessage: {
      title: '투표하려면 로그인이 필요합니다',
      description:
        '이 투표에 참여하려면 로그인이 필요합니다. 로그인하시겠습니까?',
    },
  });
  const ensureActiveMembership = useWithdrawalGuard();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.is_admin === true || userProfile?.is_super_admin === true;

  const {
    voteItems,
    setVoteItems,
    userVote,
    notifications,
    removeNotification,
    addNotification,
    connectionState,
    pollingStartTime,
    lastPollingUpdate,
    pollingErrorCount,
    updateVoteDataPolling,
    user,
    connectionQuality,
    recentlyUpdatedItemsRef,
  } = useVotePolling({
    vote,
    voteId: vote.id,
    initialItems,
    pollingInterval,
    enableRealtime,
  });

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

  const voteStatus = getVoteStatus(vote);
  const canVote = voteStatus === 'ongoing';
  const debouncedSearchQuery = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    const observer = new MutationObserver(updateHeaderHeight);
    if (headerRef.current) {
      observer.observe(headerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
    const timer = setTimeout(updateHeaderHeight, HEADER_RECALC_DELAY_MS);
    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const handleCardClick = async (item: VoteItem) => {
    if (!canVote) return;
    if (await ensureActiveMembership()) {
      return;
    }
    const result = await withAuth(async () => {
      setVoteCandidate(item);
      setVoteAmount(1);
      setShowVoteModal(true);
      return true;
    });
    if (!result) {
      return;
    }
  };

  const confirmVote = async () => {
    if (!voteCandidate || voteAmount <= 0 || voteAmount > availableVotes)
      return;
    if (await ensureActiveMembership()) {
      return;
    }
    const result = await withAuth(async () => {
      setIsVoting(true);
      setShowVoteModal(false);
      try {
        setVoteItems((prev) =>
          prev.map((item) =>
            item.id === voteCandidate.id
              ? { ...item, vote_total: (item.vote_total || 0) + voteAmount }
              : item,
          ),
        );
        setAvailableVotes((prev) => prev - voteAmount);
        addNotification({
          type: 'success',
          title: '투표 완료',
          message: `${getLocalizedString(((voteCandidate as any)?.artist?.name) || '', currentLanguage)}에게 ${voteAmount}표 투표했습니다.`,
          duration: 3000,
        });
      } catch (error) {
        addNotification({
          type: 'error',
          title: '투표 실패',
          message: '투표 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
          duration: 4000,
        });
      } finally {
        setIsVoting(false);
        setVoteCandidate(null);
        setVoteAmount(1);
      }
      return true;
    });
    if (!result) {
      return;
    }
  };

  const cancelVote = () => {
    setShowVoteModal(false);
    setVoteCandidate(null);
    setVoteAmount(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const { rankedVoteItems, filteredItems, totalVotes } = useMemo(() => {
    const activeVoteItems = filterActiveVoteItems(voteItems);
    const ranked = [...activeVoteItems]
      .sort((a, b) => {
        const voteDiff = (b.vote_total || 0) - (a.vote_total || 0);
        if (voteDiff !== 0) return voteDiff;
        return (a.id || 0) - (b.id || 0);
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        _realtimeInfo: {
          isHighlighted: recentlyUpdatedItemsRef.current.has(item.id),
          isUpdated: recentlyUpdatedItemsRef.current.has(item.id),
          rankChange: 'same' as const,
        },
      }));
    const filtered = debouncedSearchQuery
      ? ranked.filter((item) => {
          const artistName = (item as any).artist?.name
            ? getLocalizedString(
                (item as any).artist.name,
                currentLanguage,
              )?.toLowerCase() || ''
            : '';
          const query = debouncedSearchQuery.toLowerCase();
          return artistName.includes(query);
        })
      : ranked;
    const total = sumVoteTotals(activeVoteItems);
    return { rankedVoteItems: ranked, filteredItems: filtered, totalVotes: total };
  }, [voteItems, debouncedSearchQuery, currentLanguage]);

  const formatVotePeriod = () => {
    if (!vote.start_at || !vote.stop_at) return '';
    const startDate = new Date(vote.start_at);
    const endDate = new Date(vote.stop_at);
    // timeZone 을 명시하지 않으면 SSR(서버 TZ, 보통 UTC) vs CSR(사용자 로컬) 결과가
    // 달라져 hydration mismatch 가 발생. K-pop 투표 마감 기준은 KST.
    const formatDate = (date: Date) =>
      date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul',
      });
    return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
  };

  return {
    // Store / auth
    currentLanguage,
    // Polling state
    voteItems,
    userVote,
    notifications,
    removeNotification,
    connectionState,
    pollingStartTime,
    lastPollingUpdate,
    pollingErrorCount,
    updateVoteDataPolling,
    user,
    connectionQuality,
    // Local state
    selectedItem,
    searchQuery,
    isVoting,
    timeLeft,
    showVoteModal,
    voteCandidate,
    voteAmount,
    availableVotes,
    headerHeight,
    headerRef,
    // Derived
    voteStatus,
    canVote,
    // Handlers
    handleCardClick,
    confirmVote,
    cancelVote,
    handleSearch,
    // Memoized
    rankedVoteItems,
    filteredItems,
    totalVotes,
    isAdmin,
    // Helpers
    formatVotePeriod,
    // Pass-through props
    vote,
    rewards,
    className,
  };
}
