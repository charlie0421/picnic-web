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

async function canVoteHandler(request: NextRequest) {
    try {
        const body: CanVoteRequest = await request.json();
        const { userId, voteAmount } = body;

        // 입력 검증
        if (!userId || voteAmount === undefined) {
            return NextResponse.json(
                { error: "필수 필드가 누락되었습니다: userId, voteAmount" },
                { status: 400 }
            );
        }

        if (voteAmount <= 0) {
            return NextResponse.json(
                { error: "투표 금액은 0보다 커야 합니다" },
                { status: 400 }
            );
        }

        const supabase = await createClient();
        
        // can_vote 함수 호출
        const { data, error } = await supabase.rpc("can_vote", {
            p_user_id: userId,
            p_vote_amount: voteAmount,
        });

        if (error) {
            console.error('투표 가능 여부 확인 실패:', error);
            
            // 특정 에러 메시지에 따른 분류
            if (error.message?.includes("Insufficient balance")) {
                return NextResponse.json(
                    { error: "잔액이 부족합니다" },
                    { status: 400 }
                );
            }

            if (error.message?.includes("User not found")) {
                return NextResponse.json(
                    { error: "사용자를 찾을 수 없습니다" },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { error: `투표 가능 여부 확인 실패: ${error.message}` },
                { status: 500 }
            );
        }

        // 사용자 잔액 정보도 함께 조회
        const { data: userProfile, error: profileError } = await supabase
            .from("user_profiles")
            .select("star_candy, star_candy_bonus")
            .eq("id", userId)
            .single();

        if (profileError) {
            console.error('사용자 프로필 조회 실패:', profileError);
            return NextResponse.json(
                { error: `사용자 프로필 조회 실패: ${profileError.message}` },
                { status: 500 }
            );
        }

        const response: CanVoteResponse = {
            canVote: data === true,
            userBalance: userProfile ? {
                starCandy: userProfile.star_candy || 0,
                starCandyBonus: userProfile.star_candy_bonus || 0,
                totalAvailable: (userProfile.star_candy || 0) + (userProfile.star_candy_bonus || 0),
            } : undefined
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('투표 가능 여부 확인 처리 중 오류:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

async function canVoteGetHandler(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get("userId");
        const voteAmount = searchParams.get("voteAmount");

        if (!userId || !voteAmount) {
            return NextResponse.json(
                { error: "필수 쿼리 파라미터가 누락되었습니다: userId, voteAmount" },
                { status: 400 }
            );
        }

        const voteAmountNum = parseInt(voteAmount);
        if (isNaN(voteAmountNum) || voteAmountNum <= 0) {
            return NextResponse.json(
                { error: "잘못된 voteAmount: 양의 정수여야 합니다" },
                { status: 400 }
            );
        }

        // POST 메서드와 동일한 로직 재사용
        const mockRequest = {
            ...request,
            json: () => Promise.resolve({ userId, voteAmount: voteAmountNum }),
        } as NextRequest;

        return canVoteHandler(mockRequest);
    } catch (error) {
        console.error('투표 가능 여부 GET 처리 중 오류:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    return canVoteHandler(request);
}

export async function GET(request: NextRequest) {
    return canVoteGetHandler(request);
}
