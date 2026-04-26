import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { VoteItem } from '@/types/interfaces';
import {
  VoteStore,
  initialVoteDetailState,
  initialParticipationState,
  initialSubmissionState,
  initialResultsState,
} from './vote-store-types';
import { createVoteApiActions } from './vote-store-api';

// Re-export types for external consumers
export type {
  VoteSubmissionState,
  VoteParticipationState,
  VoteResultsState,
  VoteDetailState,
} from './vote-store-types';

// Zustand 스토어 생성
export const useVoteStore = create<VoteStore>()(
  devtools(
    (set, get) => ({
      // 초기 상태
      currentVote: initialVoteDetailState,
      participation: initialParticipationState,
      submission: initialSubmissionState,
      results: initialResultsState,

      // 기존 Actions 구현
      setCurrentVote: (vote, voteItems, voteStatus) =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              vote,
              voteItems,
              voteStatus,
              isLoading: false,
              error: null,
            },
            results: {
              ...state.results,
              voteItems,
              totalVotes: voteItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
              lastUpdateTime: Date.now(),
            },
          }),
          false,
          'setCurrentVote'
        ),

      updateVoteItems: (updatedItems) =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              voteItems: updatedItems,
            },
            results: {
              ...state.results,
              voteItems: updatedItems,
              totalVotes: updatedItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
              lastUpdateTime: Date.now(),
            },
          }),
          false,
          'updateVoteItems'
        ),

      updateVoteItem: (itemId, updates) =>
        set(
          (state) => {
            const updateItemInArray = (items: VoteItem[]) =>
              items.map((item) =>
                item.id === itemId ? { ...item, ...updates } : item
              );

            const updatedCurrentItems = updateItemInArray(state.currentVote.voteItems);
            const updatedResultItems = updateItemInArray(state.results.voteItems);

            return {
              currentVote: {
                ...state.currentVote,
                voteItems: updatedCurrentItems,
              },
              results: {
                ...state.results,
                voteItems: updatedResultItems,
                totalVotes: updatedResultItems.reduce((sum, item) => sum + (item.vote_total || 0), 0),
                lastUpdateTime: Date.now(),
              },
            };
          },
          false,
          'updateVoteItem'
        ),

      selectVoteItem: (itemId) =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              selectedItemId: itemId,
              error: null,
            },
          }),
          false,
          'selectVoteItem'
        ),

      setVoteAmount: (amount) =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              voteAmount: Math.max(1, Math.min(amount, state.submission.availableVotes)),
            },
          }),
          false,
          'setVoteAmount'
        ),

      startSubmission: () =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              isSubmitting: true,
              error: null,
            },
          }),
          false,
          'startSubmission'
        ),

      completeSubmission: (success, error) =>
        set(
          (state) => ({
            submission: {
              ...state.submission,
              isSubmitting: false,
              error: success ? null : (error || '투표 제출에 실패했습니다.'),
              // 성공 시 선택 상태 초기화
              selectedItemId: success ? null : state.submission.selectedItemId,
              voteAmount: success ? 1 : state.submission.voteAmount,
            },
            participation: success
              ? {
                  ...state.participation,
                  hasVoted: true,
                  userVoteItemId: state.submission.selectedItemId,
                  userVoteAmount: state.submission.voteAmount,
                  participationError: null,
                }
              : state.participation,
          }),
          false,
          'completeSubmission'
        ),

      setUserParticipation: (hasVoted, voteItemId, voteAmount = 0) =>
        set(
          (state) => ({
            participation: {
              ...state.participation,
              hasVoted,
              userVoteItemId: voteItemId || null,
              userVoteAmount: voteAmount,
              participationError: null,
            },
          }),
          false,
          'setUserParticipation'
        ),

      startResultsLoading: () =>
        set(
          (state) => ({
            results: {
              ...state.results,
              isLoading: true,
              error: null,
            },
          }),
          false,
          'startResultsLoading'
        ),

      updateResults: (voteItems, totalVotes) =>
        set(
          (state) => ({
            results: {
              ...state.results,
              voteItems,
              totalVotes,
              lastUpdateTime: Date.now(),
              isLoading: false,
              error: null,
            },
          }),
          false,
          'updateResults'
        ),

      setResultsError: (error) =>
        set(
          (state) => ({
            results: {
              ...state.results,
              error,
              isLoading: false,
            },
          }),
          false,
          'setResultsError'
        ),

      updateTimeLeft: (timeLeft) =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              timeLeft,
            },
          }),
          false,
          'updateTimeLeft'
        ),

      clearErrors: () =>
        set(
          (state) => ({
            currentVote: {
              ...state.currentVote,
              error: null,
            },
            submission: {
              ...state.submission,
              error: null,
            },
            participation: {
              ...state.participation,
              participationError: null,
            },
            results: {
              ...state.results,
              error: null,
            },
          }),
          false,
          'clearErrors'
        ),

      resetVoteState: () =>
        set(
          () => ({
            currentVote: initialVoteDetailState,
            participation: initialParticipationState,
            submission: initialSubmissionState,
            results: initialResultsState,
          }),
          false,
          'resetVoteState'
        ),

      resetSubmissionState: () =>
        set(
          () => ({
            submission: initialSubmissionState,
          }),
          false,
          'resetSubmissionState'
        ),

      resetParticipationState: () =>
        set(
          () => ({
            participation: initialParticipationState,
          }),
          false,
          'resetParticipationState'
        ),

      resetResultsState: () =>
        set(
          () => ({
            results: initialResultsState,
          }),
          false,
          'resetResultsState'
        ),

      // API 연동 액션들
      ...createVoteApiActions(set, get),
    }),
    {
      name: 'vote-store',
      // 개발 환경에서만 devtools 활성화
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
