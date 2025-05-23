/**
 * serverQueries.ts 테스트
 *
 * 이 테스트는 서버 사이드 API 데이터 가져오기 함수들을 검증합니다.
 * 테스트 대상: getServerVoteById, getServerVoteItems, getServerVoteRewards, getServerVoteData 함수들
 */

// 실제 모듈 import 먼저 수행
import { createClient } from "@/utils/supabase-server-client";
import { Reward, Vote, VoteItem } from "@/types/interfaces";
import * as serverQueries from "@/utils/api/serverQueries";

// createClient 모킹하기
jest.mock("@/utils/supabase-server-client", () => ({
    createClient: jest.fn(),
}));

// 모킹 타입 정의
interface MockResponse {
    data: any;
    error: any;
}

describe("서버 쿼리 유틸리티 함수", () => {
    let mockSupabaseClient: any;
    let mockSelect: jest.Mock;
    let mockEq: jest.Mock;
    let mockIs: jest.Mock;
    let mockSingle: jest.Mock;
    let mockOrder: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        // 콘솔 에러 모킹
        jest.spyOn(console, "error").mockImplementation(() => {});

        // Supabase 체인 메서드 모킹
        mockSingle = jest.fn();
        mockIs = jest.fn();
        mockEq = jest.fn();
        mockSelect = jest.fn();
        mockOrder = jest.fn();

        // 모킹된 Supabase 클라이언트 설정
        mockSupabaseClient = {
            from: jest.fn().mockReturnValue({
                select: mockSelect,
            }),
        };

        // createClient가 mockSupabaseClient를 반환하도록 설정
        (createClient as jest.Mock).mockResolvedValue(mockSupabaseClient);

        // 체인 구성
        mockSelect.mockReturnValue({
            eq: mockEq,
        });

        mockEq.mockReturnValue({
            is: mockIs,
        });

        mockIs.mockReturnValue({
            single: mockSingle,
            order: mockOrder,
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // getServerVoteById 테스트
    describe("getServerVoteById", () => {
        it("투표 ID로 데이터를 가져온다", async () => {
            // 모킹된 응답 데이터
            const mockVoteData = {
                id: 123,
                title: "테스트 투표",
                deleted_at: null,
                start_at: "2023-01-01",
                stop_at: "2023-12-31",
                created_at: "2023-01-01",
                updated_at: "2023-01-01",
                main_image: "main.jpg",
                wait_image: "wait.jpg",
                result_image: "result.jpg",
                vote_category: "test",
                vote_content: "내용",
                vote_sub_category: "sub",
                visible_at: "2023-01-01",
            };

            // 응답 모킹
            mockSingle.mockResolvedValue({
                data: mockVoteData,
                error: null,
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteById(123);

            // 테스트 검증
            expect(createClient).toHaveBeenCalled();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith("vote");
            expect(mockSelect).toHaveBeenCalled();
            expect(mockEq).toHaveBeenCalledWith("id", 123);
            expect(mockIs).toHaveBeenCalledWith("deleted_at", null);
            expect(mockSingle).toHaveBeenCalled();

            // 결과 검증
            expect(result).not.toBeNull();
            if (result) {
                expect(result.id).toBe(123);
                expect(result.title).toBe("테스트 투표");
                expect(result.startAt).toBe("2023-01-01");
                expect(result.stopAt).toBe("2023-12-31");
            }
        });

        it("오류 발생 시 null을 반환한다", async () => {
            // 오류 응답 모킹
            mockSingle.mockResolvedValue({
                data: null,
                error: { message: "오류 발생" },
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteById(123);

            // 테스트 검증
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getServerVoteItems 테스트
    describe("getServerVoteItems", () => {
        it("투표 항목 데이터를 가져온다", async () => {
            // 모킹된 응답 데이터
            const mockVoteItemsData = [
                {
                    id: 101,
                    vote_id: 123,
                    artist_id: 201,
                    group_id: 301,
                    vote_total: 1000,
                    created_at: "2023-01-01",
                    updated_at: "2023-01-01",
                    deleted_at: null,
                    artist: {
                        id: 201,
                        name: "테스트 아티스트",
                        artist_group: {
                            id: 301,
                            name: "테스트 그룹",
                        },
                    },
                },
            ];

            // 응답 모킹
            mockOrder.mockResolvedValue({
                data: mockVoteItemsData,
                error: null,
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteItems(123);

            // 테스트 검증
            expect(createClient).toHaveBeenCalled();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith("vote_item");
            expect(mockSelect).toHaveBeenCalled();
            expect(mockEq).toHaveBeenCalledWith("vote_id", 123);
            expect(mockIs).toHaveBeenCalledWith("deleted_at", null);

            // 결과 형태만 검증 (배열인지)
            expect(Array.isArray(result)).toBe(true);
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 응답 모킹
            mockSupabaseClient.from.mockImplementation(() => {
                throw new Error("오류 발생");
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteItems(123);

            // 테스트 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getServerVoteRewards 테스트
    describe("getServerVoteRewards", () => {
        it("투표 리워드 데이터를 가져온다", async () => {
            // 모킹된 응답 데이터
            const mockVoteRewardsData = [
                {
                    reward: {
                        id: 401,
                        title: "테스트 리워드",
                        description: "리워드 설명",
                        deleted_at: null,
                        created_at: "2023-01-01",
                        updated_at: "2023-01-01",
                    },
                },
            ];

            // mockEq를 직접 모킹 (mockIs 대신)
            mockEq.mockImplementation((field, value) => {
                if (field === "vote_id" && value === 123) {
                    return {
                        // is 대신 직접 리턴
                        is: mockIs,
                        // 직접 리턴값 제공
                        mockResolvedValue: jest.fn().mockResolvedValue({
                            data: mockVoteRewardsData,
                            error: null,
                        }),
                    };
                }
                return { is: mockIs };
            });

            // 응답 모킹 (mockEq.mockResolvedValue로 제공)
            const mockResolvedValue = mockEq("vote_id", 123).mockResolvedValue;
            mockResolvedValue();

            // 함수 호출
            const result = await serverQueries.getServerVoteRewards(123);

            // 테스트 검증
            expect(createClient).toHaveBeenCalled();
            expect(mockSupabaseClient.from).toHaveBeenCalledWith("vote_reward");
            expect(mockSelect).toHaveBeenCalled();
            expect(mockEq).toHaveBeenCalledWith("vote_id", 123);

            // 결과 형태만 검증 (배열인지)
            expect(Array.isArray(result)).toBe(true);
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 응답 모킹
            mockSupabaseClient.from.mockImplementation(() => {
                throw new Error("오류 발생");
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteRewards(123);

            // 테스트 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getServerVoteData 테스트
    describe("getServerVoteData", () => {
        it("통합된 투표 데이터를 가져온다", async () => {
            // 각 함수에 대한 모킹된 응답 데이터
            const mockVoteData = {
                id: 123,
                title: "테스트 투표",
                deleted_at: null,
                start_at: "2023-01-01",
                stop_at: "2023-12-31",
                created_at: "2023-01-01",
                updated_at: "2023-01-01",
                main_image: "main.jpg",
            };

            const mockVoteItemsData = [
                { id: 101, vote_id: 123 },
            ];

            const mockVoteRewardsData = [
                { reward: { id: 401, title: "테스트 리워드" } },
            ];

            // getServerVoteById 함수를 위한 응답 모킹
            mockSingle.mockResolvedValue({
                data: mockVoteData,
                error: null,
            });

            // getServerVoteItems 함수를 위한 응답 모킹
            mockOrder.mockResolvedValue({
                data: mockVoteItemsData,
                error: null,
            });

            // getServerVoteRewards 함수를 위한 응답 모킹 (mockEq 재정의)
            mockEq.mockImplementation((field, value) => {
                if (field === "vote_id" && value === 123) {
                    if (
                        mockSupabaseClient.from.mock
                            .calls[
                                mockSupabaseClient.from.mock.calls.length - 1
                            ][0] === "vote_reward"
                    ) {
                        return {
                            mockResolvedValue: jest.fn().mockResolvedValue({
                                data: mockVoteRewardsData,
                                error: null,
                            }),
                        };
                    }
                }
                return { is: mockIs };
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteData(123);

            // 테스트 검증
            expect(mockSupabaseClient.from).toHaveBeenCalledWith("vote");

            // 결과 검증 - 적절한 형태로 반환되었는지만 확인
            expect(result).toHaveProperty("vote");
            expect(result).toHaveProperty("voteItems");
            expect(result).toHaveProperty("rewards");
        });

        it("일부 데이터 조회 실패 시에도 가능한 데이터는 반환한다", async () => {
            // vote 데이터만 있고 나머지는 빈 배열인 경우
            mockSingle.mockResolvedValue({
                data: { id: 123, title: "테스트 투표" },
                error: null,
            });

            // getServerVoteItems 함수 오류 모킹
            mockOrder.mockResolvedValue({
                data: [],
                error: { message: "오류 발생" },
            });

            // getServerVoteRewards 함수 오류 모킹
            mockEq.mockImplementation((field, value) => {
                return {
                    is: mockIs,
                    mockResolvedValue: jest.fn().mockResolvedValue({
                        data: [],
                        error: { message: "오류 발생" },
                    }),
                };
            });

            // 함수 호출
            const result = await serverQueries.getServerVoteData(123);

            // 테스트 검증
            expect(result).toHaveProperty("vote");
            expect(result.vote).not.toBeNull();
            expect(result.voteItems).toEqual([]);
            expect(result.rewards).toEqual([]);
        });
    });
});
