import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase-server-client";

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

export async function POST(request: NextRequest) {
    try {
        const body: CanVoteRequest = await request.json();
        const { userId, voteAmount } = body;

        // 입력 검증
        if (!userId || voteAmount === undefined) {
            return NextResponse.json(
                { error: "Missing required fields: userId and voteAmount" },
                { status: 400 },
            );
        }

        if (voteAmount <= 0) {
            return NextResponse.json(
                { error: "Vote amount must be greater than 0" },
                { status: 400 },
            );
        }

        const supabase = await createClient();

        try {
            // can_vote 함수 호출
            const { data, error } = await supabase.rpc("can_vote", {
                p_user_id: userId,
                p_vote_amount: voteAmount,
            });

            if (error) {
                console.error("[Can Vote] can_vote 함수 에러:", error);

                // 에러 메시지에 따라 적절한 응답 반환
                if (error.message.includes("Insufficient balance")) {
                    return NextResponse.json({
                        canVote: false,
                        error: "Insufficient balance",
                        details: error.message,
                    } as CanVoteResponse, { status: 200 });
                }

                if (error.message.includes("User not found")) {
                    return NextResponse.json({
                        canVote: false,
                        error: "User not found",
                        details: error.message,
                    } as CanVoteResponse, { status: 404 });
                }

                return NextResponse.json(
                    {
                        error: "Failed to check vote eligibility",
                        details: error.message,
                    },
                    { status: 500 },
                );
            }

            // 사용자 잔액 정보도 함께 조회
            const { data: userProfile, error: profileError } = await supabase
                .from("user_profiles")
                .select("star_candy, star_candy_bonus")
                .eq("id", userId)
                .single();

            const response: CanVoteResponse = {
                canVote: data === true,
            };

            if (userProfile && !profileError) {
                response.userBalance = {
                    starCandy: userProfile.star_candy || 0,
                    starCandyBonus: userProfile.star_candy_bonus || 0,
                    totalAvailable: (userProfile.star_candy || 0) +
                        (userProfile.star_candy_bonus || 0),
                };
            }

            console.log("[Can Vote] 성공:", {
                userId,
                voteAmount,
                canVote: response.canVote,
                totalAvailable: response.userBalance?.totalAvailable,
            });

            return NextResponse.json(response);
        } catch (dbError: any) {
            console.error("[Can Vote] DB 함수 호출 중 예외:", dbError);

            // can_vote 함수에서 발생한 예외 처리
            if (dbError.message?.includes("Insufficient balance")) {
                return NextResponse.json({
                    canVote: false,
                    error: "Insufficient balance",
                    details: dbError.message,
                } as CanVoteResponse, { status: 200 });
            }

            if (dbError.message?.includes("User not found")) {
                return NextResponse.json({
                    canVote: false,
                    error: "User not found",
                    details: dbError.message,
                } as CanVoteResponse, { status: 404 });
            }

            return NextResponse.json(
                { error: "Database error", details: dbError.message },
                { status: 500 },
            );
        }
    } catch (error) {
        console.error("[Can Vote] 예외 발생:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const voteAmount = searchParams.get("voteAmount");

    if (!userId || !voteAmount) {
        return NextResponse.json(
            {
                error:
                    "Missing required query parameters: userId and voteAmount",
            },
            { status: 400 },
        );
    }

    const voteAmountNum = parseInt(voteAmount);
    if (isNaN(voteAmountNum) || voteAmountNum <= 0) {
        return NextResponse.json(
            { error: "Invalid voteAmount: must be a positive integer" },
            { status: 400 },
        );
    }

    // POST 메서드와 동일한 로직 재사용
    const mockRequest = {
        json: () => Promise.resolve({ userId, voteAmount: voteAmountNum }),
    } as NextRequest;

    return POST(mockRequest);
}
