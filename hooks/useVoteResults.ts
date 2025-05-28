"use client";

import { useEffect, useState } from "react";

interface VoteResultItem {
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

interface VoteResultsData {
    voteId: number;
    title: string;
    status: "upcoming" | "ongoing" | "ended";
    totalVotes: number;
    results: VoteResultItem[];
}

interface VoteResultsResponse {
    success: boolean;
    data?: VoteResultsData;
    error?: string;
}

export function useVoteResults(voteId: number | null) {
    const [data, setData] = useState<VoteResultsData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchResults = async (
        id: number,
    ): Promise<VoteResultsData | null> => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/vote/results?voteId=${id}`);
            const result: VoteResultsResponse = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to fetch vote results");
            }

            if (result.success && result.data) {
                setData(result.data);
                return result.data;
            } else {
                throw new Error("Invalid response format");
            }
        } catch (err) {
            const errorMessage = err instanceof Error
                ? err.message
                : "Unknown error";
            setError(errorMessage);
            console.error("[useVoteResults] 에러:", err);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    const refetch = () => {
        if (voteId) {
            return fetchResults(voteId);
        }
        return Promise.resolve(null);
    };

    useEffect(() => {
        if (voteId) {
            fetchResults(voteId);
        }
    }, [voteId]);

    return {
        data,
        isLoading,
        error,
        refetch,
        clearError: () => setError(null),
    };
}
