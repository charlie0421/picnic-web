import { act, renderHook } from "@testing-library/react";
import { useVoteSubmit } from "@/hooks/useVoteSubmit";

// fetch 모킹
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("useVoteSubmit", () => {
    beforeEach(() => {
        mockFetch.mockClear();
        // 콘솔 에러 모킹 (테스트 출력 정리)
        jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const validVoteData = {
        voteId: 1,
        voteItemId: 2,
        amount: 100,
        userId: "user123",
        totalBonusRemain: 500,
    };

    it("초기 상태가 올바르게 설정됨", () => {
        const { result } = renderHook(() => useVoteSubmit());

        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.error).toBe(null);
        expect(typeof result.current.submitVote).toBe("function");
        expect(typeof result.current.clearError).toBe("function");
    });

    it("성공적인 투표 제출", async () => {
        const mockResponse = {
            success: true,
            data: [{ vote_total: 150 }],
            message: "Vote submitted successfully",
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockResponse),
        } as any);

        const { result } = renderHook(() => useVoteSubmit());

        let submitResult: any;
        await act(async () => {
            submitResult = await result.current.submitVote(validVoteData);
        });

        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.error).toBe(null);
        expect(submitResult).toEqual(mockResponse);

        // fetch가 올바른 파라미터로 호출되었는지 확인
        expect(mockFetch).toHaveBeenCalledWith("/api/vote/submit", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(validVoteData),
        });
    });

    it("API 에러 응답 처리", async () => {
        const errorResponse = {
            error: "Missing required fields",
        };

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: jest.fn().mockResolvedValue(errorResponse),
        } as any);

        const { result } = renderHook(() => useVoteSubmit());

        let submitResult: any;
        await act(async () => {
            submitResult = await result.current.submitVote(validVoteData);
        });

        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.error).toBe("Missing required fields");
        expect(submitResult).toBe(null);
    });

    it("네트워크 에러 처리", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const { result } = renderHook(() => useVoteSubmit());

        let submitResult: any;
        await act(async () => {
            submitResult = await result.current.submitVote(validVoteData);
        });

        expect(result.current.isSubmitting).toBe(false);
        expect(result.current.error).toBe("Network error");
        expect(submitResult).toBe(null);
    });

    it("로딩 상태 관리", async () => {
        // 느린 응답을 시뮬레이션
        let resolvePromise: (value: any) => void;
        const slowPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });

        mockFetch.mockReturnValueOnce(slowPromise as any);

        const { result } = renderHook(() => useVoteSubmit());

        // 제출 시작
        act(() => {
            result.current.submitVote(validVoteData);
        });

        // 로딩 상태 확인
        expect(result.current.isSubmitting).toBe(true);
        expect(result.current.error).toBe(null);

        // 응답 완료
        await act(async () => {
            resolvePromise!({
                ok: true,
                json: jest.fn().mockResolvedValue({ success: true }),
            });
        });

        expect(result.current.isSubmitting).toBe(false);
    });

    it("에러 클리어 기능", async () => {
        // 먼저 에러 상태 만들기
        mockFetch.mockRejectedValueOnce(new Error("Test error"));

        const { result } = renderHook(() => useVoteSubmit());

        await act(async () => {
            await result.current.submitVote(validVoteData);
        });

        expect(result.current.error).toBe("Test error");

        // 에러 클리어
        act(() => {
            result.current.clearError();
        });

        expect(result.current.error).toBe(null);
    });

    it("응답에 에러 메시지가 없을 때 기본 에러 메시지 사용", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: jest.fn().mockResolvedValue({}),
        } as any);

        const { result } = renderHook(() => useVoteSubmit());

        await act(async () => {
            await result.current.submitVote(validVoteData);
        });

        expect(result.current.error).toBe("Failed to submit vote");
    });

    it("알 수 없는 에러 타입 처리", async () => {
        mockFetch.mockRejectedValueOnce("String error");

        const { result } = renderHook(() => useVoteSubmit());

        await act(async () => {
            await result.current.submitVote(validVoteData);
        });

        expect(result.current.error).toBe("Unknown error");
    });

    it("연속된 제출 요청 처리", async () => {
        const mockResponse1 = { success: true, data: [{ vote_total: 100 }] };
        const mockResponse2 = { success: true, data: [{ vote_total: 200 }] };

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse1),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse2),
            } as any);

        const { result } = renderHook(() => useVoteSubmit());

        // 첫 번째 제출
        let result1: any;
        await act(async () => {
            result1 = await result.current.submitVote(validVoteData);
        });

        expect(result1).toEqual(mockResponse1);
        expect(result.current.error).toBe(null);

        // 두 번째 제출
        let result2: any;
        await act(async () => {
            result2 = await result.current.submitVote({
                ...validVoteData,
                amount: 200,
            });
        });

        expect(result2).toEqual(mockResponse2);
        expect(result.current.error).toBe(null);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});
