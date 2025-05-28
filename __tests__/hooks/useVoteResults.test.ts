import { act, renderHook } from "@testing-library/react";
import { useVoteResults } from "@/hooks/useVoteResults";

// fetch 모킹
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("useVoteResults", () => {
    beforeEach(() => {
        mockFetch.mockClear();
        // 콘솔 에러 모킹 (테스트 출력 정리)
        jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const mockVoteResultsData = {
        voteId: 1,
        title: { ko: "테스트 투표", en: "Test Vote" },
        status: "ongoing" as const,
        totalVotes: 250,
        results: [
            {
                id: 1,
                voteId: 1,
                artistId: 1,
                groupId: 1,
                voteTotal: 150,
                artist: {
                    id: 1,
                    name: "Artist 1",
                    image: "artist1.jpg",
                    artistGroup: {
                        id: 1,
                        name: "Group 1",
                    },
                },
                percentage: 60,
                rank: 1,
            },
            {
                id: 2,
                voteId: 1,
                artistId: 2,
                groupId: 2,
                voteTotal: 100,
                artist: {
                    id: 2,
                    name: "Artist 2",
                    image: "artist2.jpg",
                    artistGroup: {
                        id: 2,
                        name: "Group 2",
                    },
                },
                percentage: 40,
                rank: 2,
            },
        ],
    };

    it("초기 상태가 올바르게 설정됨", () => {
        const { result } = renderHook(() => useVoteResults(null));

        expect(result.current.data).toBe(null);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe(null);
        expect(typeof result.current.refetch).toBe("function");
        expect(typeof result.current.clearError).toBe("function");
    });

    it("voteId가 제공되면 자동으로 데이터 페칭", async () => {
        const mockResponse = {
            success: true,
            data: mockVoteResultsData,
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        const { result } = renderHook(() => useVoteResults(1));

        // 초기 로딩 상태 확인
        expect(result.current.isLoading).toBe(true);

        // 데이터 로딩 완료 대기
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe(null);
        expect(result.current.data).toEqual(mockVoteResultsData);

        // fetch가 올바른 URL로 호출되었는지 확인
        expect(mockFetch).toHaveBeenCalledWith("/api/vote/results?voteId=1");
    });

    it("voteId가 null이면 데이터 페칭하지 않음", () => {
        renderHook(() => useVoteResults(null));

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("API 에러 응답 처리", async () => {
        const errorResponse = {
            error: "Vote not found",
        };

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: jest.fn().mockResolvedValue(errorResponse),
        } as any);

        const { result } = renderHook(() => useVoteResults(999));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe("Vote not found");
        expect(result.current.data).toBe(null);
    });

    it("네트워크 에러 처리", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const { result } = renderHook(() => useVoteResults(1));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe("Network error");
        expect(result.current.data).toBe(null);
    });

    it("잘못된 응답 형식 처리", async () => {
        const invalidResponse = {
            success: false,
            // data 필드 누락
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(invalidResponse),
        } as any);

        const { result } = renderHook(() => useVoteResults(1));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe("Invalid response format");
        expect(result.current.data).toBe(null);
    });

    it("refetch 기능", async () => {
        const mockResponse = {
            success: true,
            data: mockVoteResultsData,
        };

        mockFetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        const { result } = renderHook(() => useVoteResults(1));

        // 초기 로딩 완료 대기
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);

        // refetch 호출
        await act(async () => {
            await result.current.refetch();
        });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.current.data).toEqual(mockVoteResultsData);
    });

    it("voteId가 null일 때 refetch는 아무것도 하지 않음", async () => {
        const { result } = renderHook(() => useVoteResults(null));

        const refetchResult = await act(async () => {
            return await result.current.refetch();
        });

        expect(refetchResult).toBe(null);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("에러 클리어 기능", async () => {
        // 먼저 에러 상태 만들기
        mockFetch.mockRejectedValueOnce(new Error("Test error"));

        const { result } = renderHook(() => useVoteResults(1));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.error).toBe("Test error");

        // 에러 클리어
        act(() => {
            result.current.clearError();
        });

        expect(result.current.error).toBe(null);
    });

    it("voteId 변경 시 새로운 데이터 페칭", async () => {
        const mockResponse1 = {
            success: true,
            data: { ...mockVoteResultsData, voteId: 1 },
        };

        const mockResponse2 = {
            success: true,
            data: { ...mockVoteResultsData, voteId: 2 },
        };

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse1),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse2),
            } as any);

        const { result, rerender } = renderHook(
            ({ voteId }) => useVoteResults(voteId),
            { initialProps: { voteId: 1 } },
        );

        // 첫 번째 데이터 로딩 완료 대기
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.data?.voteId).toBe(1);
        expect(mockFetch).toHaveBeenCalledWith("/api/vote/results?voteId=1");

        // voteId 변경
        rerender({ voteId: 2 });

        // 두 번째 데이터 로딩 완료 대기
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.data?.voteId).toBe(2);
        expect(mockFetch).toHaveBeenCalledWith("/api/vote/results?voteId=2");
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("로딩 상태 관리", async () => {
        // 느린 응답을 시뮬레이션
        let resolvePromise: (value: any) => void;
        const slowPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });

        mockFetch.mockReturnValueOnce(slowPromise as any);

        const { result } = renderHook(() => useVoteResults(1));

        // 로딩 상태 확인
        expect(result.current.isLoading).toBe(true);
        expect(result.current.data).toBe(null);
        expect(result.current.error).toBe(null);

        // 응답 완료
        await act(async () => {
            resolvePromise!({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    success: true,
                    data: mockVoteResultsData,
                }),
            });
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.data).toEqual(mockVoteResultsData);
    });

    it("알 수 없는 에러 타입 처리", async () => {
        mockFetch.mockRejectedValueOnce("String error");

        const { result } = renderHook(() => useVoteResults(1));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.error).toBe("Unknown error");
    });

    it("응답에 에러 메시지가 없을 때 기본 에러 메시지 사용", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: jest.fn().mockResolvedValue({}),
        } as any);

        const { result } = renderHook(() => useVoteResults(1));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.error).toBe("Failed to fetch vote results");
    });
});
