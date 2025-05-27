import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase-server-client";

interface VoteSubmissionRequest {
    voteId: number;
    voteItemId: number;
    amount: number;
    userId: string;
    totalBonusRemain: number;
}

export async function POST(request: NextRequest) {
    try {
        const body: VoteSubmissionRequest = await request.json();
        const { voteId, voteItemId, amount, userId, totalBonusRemain } = body;

        // 입력 검증
        if (
            !voteId || !voteItemId || !amount || !userId ||
            totalBonusRemain === undefined
        ) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 },
            );
        }

        if (amount <= 0) {
            return NextResponse.json(
                { error: "Amount must be greater than 0" },
                { status: 400 },
            );
        }

        const supabase = await createClient();

        // process_vote 함수 호출
        const { data, error } = await supabase.rpc("process_vote", {
            p_vote_id: voteId,
            p_vote_item_id: voteItemId,
            p_amount: amount,
            p_user_id: userId,
            p_total_bonus_remain: totalBonusRemain,
        });

        if (error) {
            console.error("[Vote Submit] process_vote 에러:", error);
            return NextResponse.json(
                { error: "Failed to process vote", details: error.message },
                { status: 500 },
            );
        }

        console.log("[Vote Submit] process_vote 성공:", data);

        return NextResponse.json({
            success: true,
            data: data,
            message: "Vote submitted successfully",
        });
    } catch (error) {
        console.error("[Vote Submit] 예외 발생:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function GET(request: NextRequest) {
    return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 },
    );
}
