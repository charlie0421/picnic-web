"use client";

import { useState, useEffect, useCallback } from 'react';
import { useNetworkQuery } from './useRetryableQuery';
import { AppError, ErrorCategory } from '@/utils/error';

export interface VoteResultItem {
    id: number;
    voteId: number;
    artistId: number | null;
    groupId: number;
    voteTotal: number | null;
    artist: {
        id: number;
        name: string;
        image: string | null;
        artistGroup: {
            id: number;
            name: string;
        } | null;
    } | null;
    percentage: number;
    rank: number;
}

export interface VoteResultsData {
    voteId: number;
    title: string;
    status: "upcoming" | "ongoing" | "ended";
    totalVotes: number;
    results: VoteResultItem[];
}

export interface VoteResultsResponse {
    success: boolean;
    data?: VoteResultsData;
    error?: string;
    details?: string;
}

/**
 * 투표 결과를 조회하는 훅 (재시도 로직 포함)
 * 
 * 새로운 재시도 가능한 쿼리 시스템을 사용하여 네트워크 오류나 일시적인 서버 오류에 대해
 * 자동으로 재시도를 수행합니다.
 */
export function useVoteResults(voteId: number | null) {
    // 새로운 재시도 시스템 사용
    const {
        data,
        isLoading,
        error,
        refetch,
        retryCount,
        canRetry,
        retry
    } = useNetworkQuery<VoteResultsData>(
        ['vote-results', voteId],
        `/api/vote/results?voteId=${voteId}`,
        {
            enabled: !!voteId,
            fallbackData: null,
            retryConfig: {
                maxRetries: 3,
                retryDelay: 1000,
                retryableCategories: [
                    ErrorCategory.NETWORK,
                    ErrorCategory.SERVER,
                    ErrorCategory.EXTERNAL_SERVICE
                ],
            },
            onError: (error) => {
                console.error('[useVoteResults] 에러:', error);
            },
            onRetry: (attempt, error) => {
                console.log(`[useVoteResults] 재시도 ${attempt}회:`, error.message);
            },
        }
    );

    // 레거시 호환성을 위한 추가 메서드들
    const clearError = useCallback(() => {
        // 새로운 시스템에서는 refetch를 통해 에러를 클리어할 수 있음
        if (error && canRetry) {
            retry();
        }
    }, [error, canRetry, retry]);

    // 수동 재시도 함수
    const manualRefetch = useCallback(async () => {
        if (voteId) {
            return await refetch();
        }
        return null;
    }, [voteId, refetch]);

    return {
        data,
        isLoading,
        error: error?.message || null,
        refetch: manualRefetch,
        clearError,
        // 새로운 재시도 시스템의 추가 정보
        retryCount,
        canRetry,
        retry,
        // 에러 객체 (더 상세한 정보가 필요한 경우)
        errorDetails: error,
    };
}
