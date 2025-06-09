import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase-server-client";
import { 
  withApiErrorHandler, 
  apiHelpers,
  createValidationError,
  createNotFoundError,
  createBusinessLogicError,
  safeApiOperation 
} from "@/utils/api-error-handler";

interface VoteSubmissionRequest {
    voteId: number;
    voteItemId: number;
    amount: number;
    userId: string;
    totalBonusRemain: number;
}

export const POST = withApiErrorHandler(async (request: NextRequest) => {
    const { data, error } = await safeApiOperation(async () => {
        const body: VoteSubmissionRequest = await request.json();
        const { voteId, voteItemId, amount, userId, totalBonusRemain } = body;

        // 입력 검증
        if (!voteId || !voteItemId || amount === undefined || !userId || totalBonusRemain === undefined) {
            throw createValidationError(
                "필수 필드가 누락되었습니다.",
                "required_fields"
            );
        }

        if (amount <= 0) {
            throw createValidationError(
                "투표 금액은 0보다 커야 합니다.",
                "amount"
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
                    throw createBusinessLogicError(
                        "잔액이 부족합니다.",
                        "insufficient_balance",
                        canVoteError.message
                    );
                }

                if (canVoteError.message.includes("User not found")) {
                    throw createNotFoundError(
                        "사용자를 찾을 수 없습니다.",
                        "user"
                    );
                }

                throw new Error(`투표 자격 확인 실패: ${canVoteError.message}`);
            }

            if (!canVoteResult) {
                throw createBusinessLogicError(
                    "투표가 허용되지 않습니다.",
                    "vote_not_allowed"
                );
            }

            console.log("[Vote Submit] can_vote 검증 통과:", { userId, amount });

        } catch (canVoteException: any) {
            console.error("[Vote Submit] can_vote 예외:", canVoteException);

            // 이미 우리가 던진 에러라면 다시 던지기
            if (canVoteException.category) {
                throw canVoteException;
            }

            if (canVoteException.message?.includes("Insufficient balance")) {
                throw createBusinessLogicError(
                    "잔액이 부족합니다.",
                    "insufficient_balance",
                    canVoteException.message
                );
            }

            if (canVoteException.message?.includes("User not found")) {
                throw createNotFoundError(
                    "사용자를 찾을 수 없습니다.",
                    "user"
                );
            }

            throw new Error(`투표 자격 확인 중 오류: ${canVoteException.message}`);
        }

        // 2. can_vote 검증 통과 후 실제 투표 처리
        const { data, error } = await supabase.rpc("process_vote", {
            p_vote_id: voteId,
            p_vote_item_id: voteItemId,
            p_amount: amount,
            p_user_id: userId,
            p_total_bonus_remain: totalBonusRemain,
        });

        if (error) {
            console.error("[Vote Submit] process_vote 에러:", error);
            throw new Error(`투표 처리 실패: ${error.message}`);
        }

        console.log("[Vote Submit] process_vote 성공:", data);

        return {
            success: true,
            data: data,
            message: "투표가 성공적으로 제출되었습니다.",
        };
    }, request);

    if (error) {
        return error;
    }

    return apiHelpers.success(data!);
});

export const GET = withApiErrorHandler(async (request: NextRequest) => {
    const { error } = await safeApiOperation(async () => {
        throw apiHelpers.methodNotAllowed("GET 메서드는 지원되지 않습니다.");
    }, request);

    return error!;
});
