"use client";

import { useCallback, useState } from "react";
import { AppError, ErrorCategory, ErrorSeverity } from '@/utils/error';
import { withNetworkRetry } from '@/utils/retry';

interface UserBalance {
    starCandy: number;
    starCandyBonus: number;
    totalAvailable: number;
}

interface CanVoteResponse {
    success: boolean;
    canVote?: boolean;
    error?: string;
    details?: string;
}

interface CanVoteData {
    userId: string;
    voteAmount: number;
}

/**
 * 투표 가능 여부를 확인하는 훅 (재시도 로직 포함)
 * 
 * 새로운 재시도 시스템을 사용하여 네트워크 오류나 일시적인 서버 오류에 대해
 * 자동으로 재시도를 수행합니다.
 */
export function useCanVote() {
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const checkCanVote = useCallback(
        async (data: CanVoteData): Promise<CanVoteResponse | null> => {
            setIsChecking(true);
            setError(null);

            const result = await withNetworkRetry(async () => {
                const response = await fetch("/api/vote/can-vote", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(data),
                });

                if (!response.ok) {
                    const result = await response.json();
                    const errorMessage = result.error || "Failed to check vote eligibility";
                    
                    throw new AppError(
                        errorMessage,
                        response.status >= 500 ? ErrorCategory.SERVER : ErrorCategory.VALIDATION,
                        ErrorSeverity.MEDIUM,
                        response.status,
                        { originalError: result }
                    );
                }

                return response.json() as Promise<CanVoteResponse>;
            }, 'checkCanVote');

            setIsChecking(false);

            if (result.success) {
                return result.data!;
            } else {
                const errorMessage = result.error?.message || 'Unknown error occurred';
                setError(errorMessage);
                console.error("Can vote check error:", result.error);
                return null;
            }
        },
        [],
    );

    const checkCanVoteByQuery = useCallback(
        async (
            userId: string,
            voteAmount: number,
        ): Promise<CanVoteResponse | null> => {
            setIsChecking(true);
            setError(null);

            const result = await withNetworkRetry(async () => {
                const response = await fetch(
                    `/api/vote/can-vote?userId=${
                        encodeURIComponent(userId)
                    }&voteAmount=${voteAmount}`,
                );

                if (!response.ok) {
                    const result = await response.json();
                    const errorMessage = result.error || "Failed to check vote eligibility";
                    
                    throw new AppError(
                        errorMessage,
                        response.status >= 500 ? ErrorCategory.SERVER : ErrorCategory.VALIDATION,
                        ErrorSeverity.MEDIUM,
                        response.status,
                        { originalError: result }
                    );
                }

                return response.json() as Promise<CanVoteResponse>;
            }, 'checkCanVoteByQuery');

            setIsChecking(false);

            if (result.success) {
                return result.data!;
            } else {
                const errorMessage = result.error?.message || 'Unknown error occurred';
                setError(errorMessage);
                console.error("Can vote check error:", result.error);
                return null;
            }
        },
        [],
    );

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        checkCanVote,
        checkCanVoteByQuery,
        isChecking,
        error,
        clearError,
    };
}
