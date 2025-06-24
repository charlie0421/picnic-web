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
        if (!voteId || !voteItemId || amount === undefined || !userId || totalBonusRemain === undefined) {
            return NextResponse.json(
                { error: "필수 필드가 누락되었습니다." },
                { status: 400 }
            );
        }

        if (amount <= 0) {
            return NextResponse.json(
                { error: "투표 금액은 0보다 커야 합니다." },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // 1. 먼저 can_vote 함수로 투표 가능 여부 확인
        try {
            const { data: canVoteResult, error: canVoteError } = await supabase
                .rpc("can_vote", {
                    p_user_id: userId,
                    p_vote_amount: amount,
                });

            if (canVoteError) {
                console.error("[Vote Submit] can_vote 검증 실패:", canVoteError);

                if (canVoteError.message.includes("Insufficient balance")) {
                    return NextResponse.json(
                        { error: "잔액이 부족합니다." },
                        { status: 400 }
                    );
                }

                if (canVoteError.message.includes("User not found")) {
                    return NextResponse.json(
                        { error: "사용자를 찾을 수 없습니다." },
                        { status: 404 }
                    );
                }

                return NextResponse.json(
                    { error: `투표 자격 확인 실패: ${canVoteError.message}` },
                    { status: 500 }
                );
            }

            if (!canVoteResult) {
                return NextResponse.json(
                    { error: "투표가 허용되지 않습니다." },
                    { status: 400 }
                );
            }

            console.log("[Vote Submit] can_vote 검증 통과:", { userId, amount });

        } catch (canVoteException: any) {
            console.error("[Vote Submit] can_vote 예외:", canVoteException);

            if (canVoteException.message?.includes("Insufficient balance")) {
                return NextResponse.json(
                    { error: "잔액이 부족합니다." },
                    { status: 400 }
                );
            }

            if (canVoteException.message?.includes("User not found")) {
                return NextResponse.json(
                    { error: "사용자를 찾을 수 없습니다." },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { error: `투표 자격 확인 중 오류: ${canVoteException.message}` },
                { status: 500 }
            );
        }

        // 2. can_vote 검증 통과 후 실제 투표 처리 (엣지 함수 사용)
        const { data, error } = await supabase.rpc("perform_vote_transaction", {
            p_vote_id: voteId,
            p_vote_item_id: voteItemId,
            p_amount: amount,
            p_user_id: userId,
            p_total_bonus_remain: totalBonusRemain,
        });

        if (error) {
            console.error("[Vote Submit] perform_vote_transaction 에러:", error);
            return NextResponse.json(
                { error: `투표 처리 실패: ${error.message}` },
                { status: 500 }
            );
        }

        console.log("[Vote Submit] perform_vote_transaction 성공:", data);

        return NextResponse.json({
            success: true,
            data: data,
            message: "투표가 성공적으로 제출되었습니다.",
        });
    } catch (error) {
        console.error('투표 제출 처리 중 오류:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    return NextResponse.json(
        { error: "GET 메서드는 지원되지 않습니다." },
        { status: 405 }
    );
}
