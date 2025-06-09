"use client";

import { useState, useCallback } from "react";
import { AppError, ErrorCategory, ErrorSeverity } from "@/utils/error";
import { withNetworkRetry } from "@/utils/retry";

interface VoteSubmissionData {
    voteId: number;
    voteItemId: number;
    amount: number;
    userId: string;
    totalBonusRemain: number;
}

interface VoteSubmissionResponse {
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
}

/**
 * 투표 제출을 처리하는 훅 (재시도 로직 포함)
 * 
 * 새로운 재시도 시스템을 사용하여 네트워크 오류나 일시적인 서버 오류에 대해
 * 자동으로 재시도를 수행합니다.
 */
export function useVoteSubmit() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submitVote = async (
        voteData: VoteSubmissionData,
    ): Promise<VoteSubmissionResponse | null> => {
        setIsSubmitting(true);
        setError(null);

        const result = await withNetworkRetry(async () => {
            const response = await fetch("/api/vote/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(voteData),
            });

            if (!response.ok) {
                const result = await response.json();
                const errorMessage = result.error || "Failed to submit vote";
                
                // 비즈니스 로직 에러 (잔액 부족, 중복 투표 등)는 재시도하지 않음
                const isBusinessLogicError = response.status === 400 || response.status === 409;
                
                throw new AppError(
                    errorMessage,
                    isBusinessLogicError ? ErrorCategory.VALIDATION : 
                    response.status >= 500 ? ErrorCategory.SERVER : ErrorCategory.VALIDATION,
                    ErrorSeverity.MEDIUM,
                    response.status,
                    { 
                        originalError: result,
                        isRetryable: !isBusinessLogicError 
                    }
                );
            }

            return response.json() as Promise<VoteSubmissionResponse>;
        }, 'submitVote');

        setIsSubmitting(false);

        if (result.success) {
            return result.data!;
        } else {
            const errorMessage = result.error?.message || "투표 제출 중 오류가 발생했습니다.";
            setError(errorMessage);
            console.error("[useVoteSubmit] 에러:", result.error);
            return null;
        }
    };

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        submitVote,
        isSubmitting,
        error,
        clearError,
    };
}
