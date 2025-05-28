import { NextRequest } from "next/server";
import { GET } from "@/app/api/vote/results/route";
import { createClient } from "@/utils/supabase-server-client";

// Supabase 클라이언트 모킹
jest.mock("@/utils/supabase-server-client");
const mockCreateClient = createClient as jest.MockedFunction<
    typeof createClient
>;

// NextRequest 모킹을 위한 헬퍼 함수
function createMockRequest(searchParams: Record<string, string>): NextRequest {
    const url = new URL("http://localhost:3000/api/vote/results");
    Object.entries(searchParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    return {
        url: url.toString(),
    } as unknown as NextRequest;
}

describe("/api/vote/results", () => {
    let mockSupabase: any;

    beforeEach(() => {
        // Supabase 클라이언트 모킹 설정
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            single: jest.fn(),
            order: jest.fn().mockReturnThis(),
        };
        mockCreateClient.mockResolvedValue(mockSupabase);

        // 콘솔 로그 모킹 (테스트 출력 정리)
        jest.spyOn(console, "log").mockImplementation();
        jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("GET /api/vote/results", () => {
        const mockVoteData = {
            id: 1,
            title: { ko: "테스트 투표", en: "Test Vote" },
            start_at: "2024-01-01T00:00:00Z",
            stop_at: "2024-12-31T23:59:59Z",
            deleted_at: null,
        };

        const mockVoteItems = [
            {
                id: 1,
                vote_id: 1,
                artist_id: 1,
                group_id: 1,
                vote_total: 150,
                artist: {
                    id: 1,
                    name: "Artist 1",
                    image: "artist1.jpg",
                    artist_group: {
                        id: 1,
                        name: "Group 1",
                    },
                },
            },
            {
                id: 2,
                vote_id: 1,
                artist_id: 2,
                group_id: 2,
                vote_total: 100,
                artist: {
                    id: 2,
                    name: "Artist 2",
                    image: "artist2.jpg",
                    artist_group: {
                        id: 2,
                        name: "Group 2",
                    },
                },
            },
        ];

        it("성공적인 투표 결과 조회", async () => {
            // 투표 데이터 조회 모킹
            mockSupabase.single.mockResolvedValueOnce({
                data: mockVoteData,
                error: null,
            });

            // 투표 아이템 조회 모킹 (체이닝 메서드 재설정)
            const mockItemsQuery = {
                from: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({
                    data: mockVoteItems,
                    error: null,
                }),
            };

            // 두 번째 from 호출을 위한 새로운 체인 설정
            mockSupabase.from.mockReturnValueOnce(mockSupabase)
                .mockReturnValueOnce(mockItemsQuery);

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.success).toBe(true);
            expect(responseData.data.voteId).toBe(1);
            expect(responseData.data.title).toEqual(mockVoteData.title);
            expect(responseData.data.totalVotes).toBe(250);
            expect(responseData.data.results).toHaveLength(2);

            // 첫 번째 결과 검증 (가장 높은 득표)
            expect(responseData.data.results[0].voteTotal).toBe(150);
            expect(responseData.data.results[0].percentage).toBe(60);
            expect(responseData.data.results[0].rank).toBe(1);

            // 두 번째 결과 검증
            expect(responseData.data.results[1].voteTotal).toBe(100);
            expect(responseData.data.results[1].percentage).toBe(40);
            expect(responseData.data.results[1].rank).toBe(2);
        });

        it("voteId 파라미터 누락 시 400 에러", async () => {
            const request = createMockRequest({});
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(400);
            expect(responseData.error).toBe("Vote ID is required");
        });

        it("존재하지 않는 투표 ID로 404 에러", async () => {
            mockSupabase.single.mockResolvedValue({
                data: null,
                error: {
                    code: "PGRST116",
                    message:
                        "JSON object requested, multiple (or no) rows returned",
                },
            });

            const request = createMockRequest({ voteId: "999" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(404);
            expect(responseData.error).toBe("Vote not found");
        });

        it("삭제된 투표 조회 시 404 에러", async () => {
            // 삭제된 투표는 쿼리에서 제외되므로 데이터가 없음
            mockSupabase.single.mockResolvedValue({
                data: null,
                error: {
                    code: "PGRST116",
                    message:
                        "JSON object requested, multiple (or no) rows returned",
                },
            });

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(404);
            expect(responseData.error).toBe("Vote not found");
        });

        it("투표 아이템 조회 에러 시 500 에러", async () => {
            // 투표 데이터는 성공
            mockSupabase.single.mockResolvedValue({
                data: mockVoteData,
                error: null,
            });

            // 투표 아이템 조회는 실패
            const mockItemsQuery = {
                from: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({
                    data: null,
                    error: {
                        message: "Database connection error",
                        code: "PGRST301",
                    },
                }),
            };

            mockSupabase.from.mockReturnValueOnce(mockSupabase)
                .mockReturnValueOnce(mockItemsQuery);

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(500);
            expect(responseData.error).toBe("Failed to fetch vote items");
        });

        it("투표 상태 계산 - upcoming", async () => {
            const futureVoteData = {
                ...mockVoteData,
                start_at: "2030-01-01T00:00:00Z",
                stop_at: "2030-12-31T23:59:59Z",
            };

            mockSupabase.single.mockResolvedValue({
                data: futureVoteData,
                error: null,
            });

            const mockItemsQuery = {
                from: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                }),
            };

            mockSupabase.from.mockReturnValueOnce(mockSupabase)
                .mockReturnValueOnce(mockItemsQuery);

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.data.status).toBe("upcoming");
        });

        it("투표 상태 계산 - ended", async () => {
            const pastVoteData = {
                ...mockVoteData,
                start_at: "2020-01-01T00:00:00Z",
                stop_at: "2020-12-31T23:59:59Z",
            };

            mockSupabase.single.mockResolvedValue({
                data: pastVoteData,
                error: null,
            });

            const mockItemsQuery = {
                from: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                }),
            };

            mockSupabase.from.mockReturnValueOnce(mockSupabase)
                .mockReturnValueOnce(mockItemsQuery);

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.data.status).toBe("ended");
        });

        it("투표 아이템이 없는 경우 처리", async () => {
            mockSupabase.single.mockResolvedValue({
                data: mockVoteData,
                error: null,
            });

            const mockItemsQuery = {
                from: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({
                    data: [],
                    error: null,
                }),
            };

            mockSupabase.from.mockReturnValueOnce(mockSupabase)
                .mockReturnValueOnce(mockItemsQuery);

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.data.totalVotes).toBe(0);
            expect(responseData.data.results).toHaveLength(0);
        });

        it("퍼센티지 계산 정확성 검증", async () => {
            const itemsWithSpecificVotes = [
                { ...mockVoteItems[0], vote_total: 667 }, // 첫 번째가 더 높은 득표
                { ...mockVoteItems[1], vote_total: 333 }, // 두 번째가 낮은 득표
            ];

            mockSupabase.single.mockResolvedValue({
                data: mockVoteData,
                error: null,
            });

            const mockItemsQuery = {
                from: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                is: jest.fn().mockReturnThis(),
                order: jest.fn().mockResolvedValue({
                    data: itemsWithSpecificVotes,
                    error: null,
                }),
            };

            mockSupabase.from.mockReturnValueOnce(mockSupabase)
                .mockReturnValueOnce(mockItemsQuery);

            const request = createMockRequest({ voteId: "1" });
            const response = await GET(request);
            const responseData = await response.json();

            expect(response.status).toBe(200);
            expect(responseData.data.totalVotes).toBe(1000);
            // 첫 번째는 667/1000 = 66.7%
            expect(responseData.data.results[0].percentage).toBe(66.7);
            // 두 번째는 333/1000 = 33.3%
            expect(responseData.data.results[1].percentage).toBe(33.3);
        });
    });
});
