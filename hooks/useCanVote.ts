"use client";

import { useCallback, useState } from "react";

interface UserBalance {
    starCandy: number;
    starCandyBonus: number;
    totalAvailable: number;
}

interface CanVoteResponse {
    canVote: boolean;
    userBalance?: UserBalance;
    error?: string;
    details?: string;
}

interface CanVoteData {
    userId: string;
    voteAmount: number;
}

export function useCanVote() {
    const [isChecking, setIsChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const checkCanVote = useCallback(
        async (data: CanVoteData): Promise<CanVoteResponse | null> => {
            setIsChecking(true);
            setError(null);

            try {
                const response = await fetch("/api/vote/can-vote", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(data),
                });

                const result = await response.json();

                if (!response.ok) {
                    const errorMessage = result.error ||
                        "Failed to check vote eligibility";
                    setError(errorMessage);
                    return null;
                }

                return result as CanVoteResponse;
            } catch (err) {
                console.error("Can vote check error:", err);
                const errorMessage = err instanceof Error
                    ? err.message
                    : "Unknown error";
                setError(errorMessage);
                return null;
            } finally {
                setIsChecking(false);
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

            try {
                const response = await fetch(
                    `/api/vote/can-vote?userId=${
                        encodeURIComponent(userId)
                    }&voteAmount=${voteAmount}`,
                );
                const result = await response.json();

                if (!response.ok) {
                    const errorMessage = result.error ||
                        "Failed to check vote eligibility";
                    setError(errorMessage);
                    return null;
                }

                return result as CanVoteResponse;
            } catch (err) {
                console.error("Can vote check error:", err);
                const errorMessage = err instanceof Error
                    ? err.message
                    : "Unknown error";
                setError(errorMessage);
                return null;
            } finally {
                setIsChecking(false);
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
