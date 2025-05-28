import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase-server-client";

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

interface VoteResultsResponse {
    voteId: number;
    title: string;
    status: "upcoming" | "ongoing" | "ended";
    totalVotes: number;
    results: VoteResultItem[];
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const voteId = searchParams.get("voteId");

        if (!voteId) {
            return NextResponse.json(
                { error: "Vote ID is required" },
                { status: 400 },
            );
        }

        const supabase = await createClient();

        // 투표 기본 정보 조회
        const { data: voteData, error: voteError } = await supabase
            .from("vote")
            .select(`
                id,
                title,
                start_at,
                stop_at,
                deleted_at
            `)
            .eq("id", voteId)
            .is("deleted_at", null)
            .single();

        if (voteError) {
            console.error("[Vote Results] 투표 조회 에러:", voteError);
            return NextResponse.json(
                { error: "Vote not found", details: voteError.message },
                { status: 404 },
            );
        }

        if (!voteData) {
            return NextResponse.json(
                { error: "Vote not found" },
                { status: 404 },
            );
        }

        // 투표 상태 계산
        const now = new Date();
        const startAt = new Date(voteData.start_at);
        const stopAt = new Date(voteData.stop_at);

        let status: "upcoming" | "ongoing" | "ended";
        if (now < startAt) {
            status = "upcoming";
        } else if (now >= startAt && now <= stopAt) {
            status = "ongoing";
        } else {
            status = "ended";
        }

        // 투표 아이템 및 결과 조회
        const { data: voteItems, error: itemsError } = await supabase
            .from("vote_item")
            .select(`
                id,
                vote_id,
                artist_id,
                group_id,
                vote_total,
                artist (
                    id,
                    name,
                    image,
                    artist_group (
                        id,
                        name
                    )
                )
            `)
            .eq("vote_id", voteId)
            .is("deleted_at", null)
            .order("vote_total", { ascending: false });

        if (itemsError) {
            console.error("[Vote Results] 투표 아이템 조회 에러:", itemsError);
            return NextResponse.json(
                {
                    error: "Failed to fetch vote items",
                    details: itemsError.message,
                },
                { status: 500 },
            );
        }

        // 총 투표 수 계산
        const totalVotes = voteItems?.reduce((sum, item) =>
            sum + (item.vote_total || 0), 0) || 0;

        // 결과 데이터 변환 및 순위 계산
        const results: VoteResultItem[] = voteItems?.map((item: any, index) => {
            const voteTotal = item.vote_total || 0;
            const percentage = totalVotes > 0
                ? (voteTotal / totalVotes) * 100
                : 0;

            return {
                id: item.id,
                voteId: item.vote_id,
                artistId: item.artist_id,
                groupId: item.group_id,
                voteTotal,
                artist: item.artist
                    ? {
                        id: item.artist.id,
                        name: item.artist.name,
                        image: item.artist.image,
                        artistGroup: item.artist.artist_group,
                    }
                    : null,
                percentage: Math.round(percentage * 100) / 100, // 소수점 2자리
                rank: index + 1, // 이미 vote_total 내림차순으로 정렬됨
            };
        }) || [];

        const response: VoteResultsResponse = {
            voteId: parseInt(voteId),
            title: voteData.title,
            status,
            totalVotes,
            results,
        };

        console.log("[Vote Results] 성공:", {
            voteId,
            totalVotes,
            itemCount: results.length,
            status,
        });

        return NextResponse.json({
            success: true,
            data: response,
        });
    } catch (error) {
        console.error("[Vote Results] 예외 발생:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 },
    );
}
