import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/vote/can-vote/route";
import { createClient } from "@/utils/supabase-server-client";

// Supabase 클라이언트 모킹
jest.mock("@/utils/supabase-server-client");
const mockCreateClient = createClient as jest.MockedFunction<
    typeof createClient
>;

// NextRequest 모킹을 위한 헬퍼 함수
function createMockRequest(body: any): NextRequest {
    return {
        json: jest.fn().mockResolvedValue(body),
    } as unknown as NextRequest;
}

function createMockGetRequest(
    searchParams: Record<string, string>,
): NextRequest {
    const url = new URL("http://localhost:3000/api/vote/can-vote");
    Object.entries(searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    return {
        url: url.toString(),
    } as unknown as NextRequest;
}

describe("/api/vote/can-vote", () => {
    let mockSupabase: any;

    beforeEach(() => {
        // Supabase 클라이언트 모킹 설정
        mockSupabase = {
            rpc: jest.fn(),
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
        };
        mockCreateClient.mockResolvedValue(mockSupabase);

        // 콘솔 로그 모킹 (테스트 출력 정리)
        jest.spyOn(console, "log").mockImplementation();
        jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("POST /api/vote/can-vote", () => {
        const validRequestBody = {
            userId: "user123",
            voteAmount: 100,
        };

        const mockUserProfile = {
            star_candy: 300,
            star_candy_bonus: 200,
        };

        it("투표 가능한 경우 성공 응답", async () => {
            // can_vote 함수 성공 응답 모킹
            mockSupabase.rpc.mockResolvedValue({
                data: true,
                error: null,
            });

            // 사용자 프로필 조회 성공 모킹
            mockSupabase.single.mockResolvedValue({
                data: mockUserProfile,
                error: null,
            });

            const request = createMockRequest(validRequestBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.canVote).toBe(true);
            expect(responseData.userBalance).toEqual({
                starCandy: 300,
                starCandyBonus: 200,
                totalAvailable: 500,
            });

            // can_vote 함수가 올바른 파라미터로 호출되었는지 확인
            expect(mockSupabase.rpc).toHaveBeenCalledWith("can_vote", {
                p_user_id: "user123",
                p_vote_amount: 100,
            });
        });

        it("필수 필드 누락 시 400 에러", async () => {
            const incompleteBody = {
                userId: "user123",
                // voteAmount 누락
            };

            const request = createMockRequest(incompleteBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe(
                "Missing required fields: userId and voteAmount",
            );
        });

        it("voteAmount가 0 이하일 때 400 에러", async () => {
            const invalidAmountBody = {
                ...validRequestBody,
                voteAmount: 0,
            };

            const request = createMockRequest(invalidAmountBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe(
                "Vote amount must be greater than 0",
            );
        });

        it("잔액 부족 시 canVote false 응답", async () => {
            // can_vote 함수에서 잔액 부족 에러 응답 모킹
            mockSupabase.rpc.mockResolvedValue({
                data: null,
                error: {
                    message:
                        "Insufficient balance: requested = 500, available = 300 (star_candy = 200, bonus = 100)",
                },
            });

            const request = createMockRequest({
                ...validRequestBody,
                voteAmount: 500,
            });
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.canVote).toBe(false);
            expect(responseData.error).toBe("Insufficient balance");
            expect(responseData.details).toContain(
                "requested = 500, available = 300",
            );
        });

        it("사용자를 찾을 수 없을 때 404 에러", async () => {
            // can_vote 함수에서 사용자 없음 에러 응답 모킹
            mockSupabase.rpc.mockResolvedValue({
                data: null,
                error: {
                    message: "User not found in user_profiles: user999",
                },
            });

            const request = createMockRequest({
                userId: "user999",
                voteAmount: 100,
            });
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(404);
            expect(responseData.canVote).toBe(false);
            expect(responseData.error).toBe("User not found");
        });

        it("can_vote 함수 예외 발생 시 처리", async () => {
            // can_vote 함수 예외 모킹
            mockSupabase.rpc.mockRejectedValue(
                new Error("Insufficient balance: test error"),
            );

            const request = createMockRequest(validRequestBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.canVote).toBe(false);
            expect(responseData.error).toBe("Insufficient balance");
        });

        it("사용자 프로필 조회 실패 시에도 canVote 결과는 반환", async () => {
            // can_vote 함수 성공
            mockSupabase.rpc.mockResolvedValue({
                data: true,
                error: null,
            });

            // 사용자 프로필 조회 실패
            mockSupabase.single.mockResolvedValue({
                data: null,
                error: { message: "Profile not found" },
            });

            const request = createMockRequest(validRequestBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.canVote).toBe(true);
            expect(responseData.userBalance).toBeUndefined();
        });

        it("JSON 파싱 에러 시 500 에러", async () => {
            const request = {
                json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
            } as unknown as NextRequest;

            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(500);
            expect(responseData.error).toBe("Internal server error");
        });
    });

    describe("GET /api/vote/can-vote", () => {
        it("쿼리 파라미터로 성공적인 요청", async () => {
            // can_vote 함수 성공 응답 모킹
            mockSupabase.rpc.mockResolvedValue({
                data: true,
                error: null,
            });

            // 사용자 프로필 조회 성공 모킹
            mockSupabase.single.mockResolvedValue({
                data: { star_candy: 300, star_candy_bonus: 200 },
                error: null,
            });

            const request = createMockGetRequest({
                userId: "user123",
                voteAmount: "100",
            });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.canVote).toBe(true);
        });

        it("쿼리 파라미터 누락 시 400 에러", async () => {
            const request = createMockGetRequest({
                userId: "user123",
                // voteAmount 누락
            });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe(
                "Missing required query parameters: userId and voteAmount",
            );
        });

        it("잘못된 voteAmount 형식 시 400 에러", async () => {
            const request = createMockGetRequest({
                userId: "user123",
                voteAmount: "invalid",
            });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe(
                "Invalid voteAmount: must be a positive integer",
            );
        });
    });
});
