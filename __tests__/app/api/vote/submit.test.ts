import { NextRequest } from "next/server";
import { POST } from "@/app/api/vote/submit/route";
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

describe("/api/vote/submit", () => {
    let mockSupabase: any;

    beforeEach(() => {
        // Supabase 클라이언트 모킹 설정
        mockSupabase = {
            rpc: jest.fn(),
        };
        mockCreateClient.mockResolvedValue(mockSupabase);

        // 콘솔 로그 모킹 (테스트 출력 정리)
        jest.spyOn(console, "log").mockImplementation();
        jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("POST /api/vote/submit", () => {
        const validRequestBody = {
            voteId: 1,
            voteItemId: 2,
            amount: 100,
            userId: "user123",
            totalBonusRemain: 500,
        };

        it("성공적인 투표 제출", async () => {
            // process_vote 함수 성공 응답 모킹
            mockSupabase.rpc.mockResolvedValue({
                data: [{ vote_total: 150 }],
                error: null,
            });

            const request = createMockRequest(validRequestBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.success).toBe(true);
            expect(responseData.data).toEqual([{ vote_total: 150 }]);
            expect(responseData.message).toBe("Vote submitted successfully");

            // process_vote 함수가 올바른 파라미터로 호출되었는지 확인
            expect(mockSupabase.rpc).toHaveBeenCalledWith("process_vote", {
                p_vote_id: 1,
                p_vote_item_id: 2,
                p_amount: 100,
                p_user_id: "user123",
                p_total_bonus_remain: 500,
            });
        });

        it("필수 필드 누락 시 400 에러", async () => {
            const incompleteBody = {
                voteId: 1,
                voteItemId: 2,
                // amount, userId, totalBonusRemain 누락
            };

            const request = createMockRequest(incompleteBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe("Missing required fields");
        });

        it("amount가 0 이하일 때 400 에러", async () => {
            const invalidAmountBody = {
                ...validRequestBody,
                amount: 0,
            };

            const request = createMockRequest(invalidAmountBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe("Amount must be greater than 0");
        });

        it("process_vote 함수 에러 시 500 에러", async () => {
            // can_vote 함수는 성공으로 모킹 (먼저 호출됨)
            mockSupabase.rpc
                .mockResolvedValueOnce({
                    data: true, // can_vote 성공
                    error: null,
                })
                .mockResolvedValueOnce({
                    data: null,
                    error: {
                        message: "Database error",
                        code: "PGRST301",
                    },
                });

            const request = createMockRequest(validRequestBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(500);
            expect(responseData.error).toBe("Failed to process vote");
            expect(responseData.details).toBe("Database error");
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

        it("totalBonusRemain이 0일 때 정상 처리", async () => {
            const zeroRemainBody = {
                ...validRequestBody,
                totalBonusRemain: 0,
            };

            mockSupabase.rpc.mockResolvedValue({
                data: [{ vote_total: 100 }],
                error: null,
            });

            const request = createMockRequest(zeroRemainBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.success).toBe(true);
        });

        it("음수 amount 값 검증", async () => {
            const negativeAmountBody = {
                ...validRequestBody,
                amount: -50,
            };

            const request = createMockRequest(negativeAmountBody);
            const response = await POST(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe("Amount must be greater than 0");
        });
    });
});
