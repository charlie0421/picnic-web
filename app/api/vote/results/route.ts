import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase-server-client";
import { 
  withApiErrorHandler, 
  apiHelpers,
  createValidationError,
  createNotFoundError,
  createDatabaseError,
  safeApiOperation 
} from "@/utils/api-error-handler";

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

export const GET = withApiErrorHandler(async (request: NextRequest) => {
    const { data, error } = await safeApiOperation(async () => {
        const { searchParams } = new URL(request.url);
        const voteId = searchParams.get("voteId");

        if (!voteId) {
            throw createValidationError(
                "투표 ID가 필요합니다.",
                "voteId"
            );
        }

        const voteIdNumber = parseInt(voteId);
        if (isNaN(voteIdNumber) || voteIdNumber <= 0) {
            throw createValidationError(
                "유효한 투표 ID가 필요합니다.",
                "voteId"
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
            .eq("id", voteIdNumber)
            .is("deleted_at", null)
            .single();

        if (voteError) {
            if (voteError.code === 'PGRST116') { // No rows returned
                throw createNotFoundError(
                    "투표를 찾을 수 없습니다.",
                    "vote"
                );
            }
            throw createDatabaseError(
                "투표 정보 조회에 실패했습니다.",
                voteError.message
            );
        }

        if (!voteData) {
            throw createNotFoundError(
                "투표를 찾을 수 없습니다.",
                "vote"
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
            .eq("vote_id", voteIdNumber)
            .is("deleted_at", null)
            .order("vote_total", { ascending: false });

        if (itemsError) {
            throw createDatabaseError(
                "투표 아이템 조회에 실패했습니다.",
                itemsError.message
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
            voteId: voteIdNumber,
            title: voteData.title,
            status,
            totalVotes,
            results,
        };

        return {
            success: true,
            data: response,
        };
    }, request);

    if (error) {
        return error;
    }

    return apiHelpers.success(data!);
});

export const POST = withApiErrorHandler(async (request: NextRequest) => {
    const { error } = await safeApiOperation(async () => {
        throw apiHelpers.methodNotAllowed("POST 메서드는 지원되지 않습니다.");
    }, request);

    return error!;
});
