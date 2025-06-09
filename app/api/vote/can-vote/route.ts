import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase-server-client";
import { withApiErrorHandler, safeApiOperation } from "@/utils/api-error-handler";
import { AppError, ErrorCategory } from "@/utils/error";

interface CanVoteRequest {
    userId: string;
    voteAmount: number;
}

interface CanVoteResponse {
    canVote: boolean;
    userBalance?: {
        starCandy: number;
        starCandyBonus: number;
        totalAvailable: number;
    };
    error?: string;
}

async function canVoteHandler(request: NextRequest) {
    const { data: body, error: parseError } = await safeApiOperation(
        () => request.json() as Promise<CanVoteRequest>,
        request
    );

    if (parseError) {
        return parseError;
    }

    const { userId, voteAmount } = body!;

    // 입력 검증
    if (!userId || voteAmount === undefined) {
        throw new AppError(
            "필수 필드가 누락되었습니다: userId, voteAmount",
            ErrorCategory.VALIDATION,
            'low',
            400
        );
    }

    if (voteAmount <= 0) {
        throw new AppError(
            "투표 금액은 0보다 커야 합니다",
            ErrorCategory.VALIDATION,
            'low',
            400
        );
    }

    const { data: result, error: dbError } = await safeApiOperation(async () => {
        const supabase = await createClient();
        
        // can_vote 함수 호출
        const { data, error } = await supabase.rpc("can_vote", {
            p_user_id: userId,
            p_vote_amount: voteAmount,
        });

        if (error) {
            // 특정 에러 메시지에 따른 분류
            if (error.message?.includes("Insufficient balance")) {
                throw new AppError(
                    "잔액이 부족합니다",
                    ErrorCategory.VALIDATION,
                    'medium',
                    400,
                    { originalError: error }
                );
            }

            if (error.message?.includes("User not found")) {
                throw new AppError(
                    "사용자를 찾을 수 없습니다",
                    ErrorCategory.NOT_FOUND,
                    'medium',
                    404,
                    { originalError: error }
                );
            }

            throw new AppError(
                `투표 가능 여부 확인 실패: ${error.message}`,
                ErrorCategory.SERVER,
                'high',
                500,
                { originalError: error }
            );
        }

        // 사용자 잔액 정보도 함께 조회
        const { data: userProfile, error: profileError } = await supabase
            .from("user_profiles")
            .select("star_candy, star_candy_bonus")
            .eq("id", userId)
            .single();

        if (profileError) {
            throw new AppError(
                `사용자 프로필 조회 실패: ${profileError.message}`,
                ErrorCategory.SERVER,
                'medium',
                500,
                { originalError: profileError }
            );
        }

        return {
            canVote: data === true,
            userBalance: userProfile ? {
                starCandy: userProfile.star_candy || 0,
                starCandyBonus: userProfile.star_candy_bonus || 0,
                totalAvailable: (userProfile.star_candy || 0) + (userProfile.star_candy_bonus || 0),
            } : undefined
        };
    }, request);

    if (dbError) {
        return dbError;
    }

    const response: CanVoteResponse = {
        canVote: result!.canVote,
        userBalance: result!.userBalance,
    };

    return NextResponse.json(response);
}

async function canVoteGetHandler(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const voteAmount = searchParams.get("voteAmount");

    if (!userId || !voteAmount) {
        throw new AppError(
            "필수 쿼리 파라미터가 누락되었습니다: userId, voteAmount",
            ErrorCategory.VALIDATION,
            'low',
            400
        );
    }

    const voteAmountNum = parseInt(voteAmount);
    if (isNaN(voteAmountNum) || voteAmountNum <= 0) {
        throw new AppError(
            "잘못된 voteAmount: 양의 정수여야 합니다",
            ErrorCategory.VALIDATION,
            'low',
            400
        );
    }

    // POST 메서드와 동일한 로직 재사용
    const mockRequest = {
        ...request,
        json: () => Promise.resolve({ userId, voteAmount: voteAmountNum }),
    } as NextRequest;

    return canVoteHandler(mockRequest);
}

export const POST = withApiErrorHandler(canVoteHandler);
export const GET = withApiErrorHandler(canVoteGetHandler);
