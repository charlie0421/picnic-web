"use client";

import { useState } from "react";

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
    details?: string;
}

export function useVoteSubmit() {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submitVote = async (
        voteData: VoteSubmissionData,
    ): Promise<VoteSubmissionResponse | null> => {
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch("/api/vote/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(voteData),
            });

            const result: VoteSubmissionResponse = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to submit vote");
            }

            return result;
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : "Unknown error";
            setError(errorMessage);
            console.error("[useVoteSubmit] 에러:", err);
            return null;
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        submitVote,
        isSubmitting,
        error,
        clearError: () => setError(null),
    };
}
