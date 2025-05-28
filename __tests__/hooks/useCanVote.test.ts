import { act, renderHook } from "@testing-library/react";
import { useCanVote } from "@/hooks/useCanVote";

// fetch 모킹
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("useCanVote", () => {
    beforeEach(() => {
        mockFetch.mockClear();
        // 콘솔 에러 모킹 (테스트 출력 정리)
        jest.spyOn(console, "error").mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const validCanVoteData = {
        userId: "user123",
        voteAmount: 100,
    };

    const mockSuccessResponse = {
        canVote: true,
        userBalance: {
            starCandy: 300,
            starCandyBonus: 200,
            totalAvailable: 500,
        },
    };

    it("초기 상태가 올바르게 설정됨", () => {
        const { result } = renderHook(() => useCanVote());

        expect(result.current.isChecking).toBe(false);
        expect(result.current.error).toBe(null);
        expect(typeof result.current.checkCanVote).toBe("function");
        expect(typeof result.current.checkCanVoteByQuery).toBe("function");
        expect(typeof result.current.clearError).toBe("function");
    });

    it("성공적인 투표 가능 여부 확인 (POST)", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockSuccessResponse),
        } as any);

        const { result } = renderHook(() => useCanVote());

        let checkResult: any;
        await act(async () => {
            checkResult = await result.current.checkCanVote(validCanVoteData);
        });

        expect(result.current.isChecking).toBe(false);
        expect(result.current.error).toBe(null);
        expect(checkResult).toEqual(mockSuccessResponse);

        // fetch가 올바른 파라미터로 호출되었는지 확인
        expect(mockFetch).toHaveBeenCalledWith("/api/vote/can-vote", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(validCanVoteData),
        });
    });

    it("성공적인 투표 가능 여부 확인 (GET)", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockSuccessResponse),
        } as any);

        const { result } = renderHook(() => useCanVote());

        let checkResult: any;
        await act(async () => {
            checkResult = await result.current.checkCanVoteByQuery(
                "user123",
                100,
            );
        });

        expect(result.current.isChecking).toBe(false);
        expect(result.current.error).toBe(null);
        expect(checkResult).toEqual(mockSuccessResponse);

        // fetch가 올바른 URL로 호출되었는지 확인
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/vote/can-vote?userId=user123&voteAmount=100",
        );
    });

    it("잔액 부족 시 canVote false 응답", async () => {
        const insufficientBalanceResponse = {
            canVote: false,
            error: "Insufficient balance",
            details: "Insufficient balance: requested = 500, available = 300",
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(insufficientBalanceResponse),
        } as any);

        const { result } = renderHook(() => useCanVote());

        let checkResult: any;
        await act(async () => {
            checkResult = await result.current.checkCanVote({
                userId: "user123",
                voteAmount: 500,
            });
        });

        expect(result.current.isChecking).toBe(false);
        expect(result.current.error).toBe(null);
        expect(checkResult).toEqual(insufficientBalanceResponse);
    });

    it("API 에러 응답 처리", async () => {
        const errorResponse = {
            error: "User not found",
        };

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: jest.fn().mockResolvedValue(errorResponse),
        } as any);

        const { result } = renderHook(() => useCanVote());

        let checkResult: any;
        await act(async () => {
            checkResult = await result.current.checkCanVote(validCanVoteData);
        });

        expect(result.current.isChecking).toBe(false);
        expect(result.current.error).toBe("User not found");
        expect(checkResult).toBe(null);
    });

    it("네트워크 에러 처리", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const { result } = renderHook(() => useCanVote());

        let checkResult: any;
        await act(async () => {
            checkResult = await result.current.checkCanVote(validCanVoteData);
        });

        expect(result.current.isChecking).toBe(false);
        expect(result.current.error).toBe("Network error");
        expect(checkResult).toBe(null);
    });

    it("로딩 상태 관리", async () => {
        // 느린 응답을 시뮬레이션
        let resolvePromise: (value: any) => void;
        const slowPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });

        mockFetch.mockReturnValueOnce(slowPromise as any);

        const { result } = renderHook(() => useCanVote());

        // 확인 시작
        act(() => {
            result.current.checkCanVote(validCanVoteData);
        });

        // 로딩 상태 확인
        expect(result.current.isChecking).toBe(true);
        expect(result.current.error).toBe(null);

        // 응답 완료
        await act(async () => {
            resolvePromise!({
                ok: true,
                json: jest.fn().mockResolvedValue(mockSuccessResponse),
            });
        });

        expect(result.current.isChecking).toBe(false);
    });

    it("에러 클리어 기능", async () => {
        // 먼저 에러 상태 만들기
        mockFetch.mockRejectedValueOnce(new Error("Test error"));

        const { result } = renderHook(() => useCanVote());

        await act(async () => {
            await result.current.checkCanVote(validCanVoteData);
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

        const { result } = renderHook(() => useCanVote());

        await act(async () => {
            await result.current.checkCanVote(validCanVoteData);
        });

        expect(result.current.error).toBe("Failed to check vote eligibility");
    });

    it("알 수 없는 에러 타입 처리", async () => {
        mockFetch.mockRejectedValueOnce("String error");

        const { result } = renderHook(() => useCanVote());

        await act(async () => {
            await result.current.checkCanVote(validCanVoteData);
        });

        expect(result.current.error).toBe("Unknown error");
    });

    it("연속된 확인 요청 처리", async () => {
        const mockResponse1 = {
            canVote: true,
            userBalance: {
                starCandy: 300,
                starCandyBonus: 200,
                totalAvailable: 500,
            },
        };
        const mockResponse2 = { canVote: false, error: "Insufficient balance" };

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse1),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse2),
            } as any);

        const { result } = renderHook(() => useCanVote());

        // 첫 번째 확인
        let result1: any;
        await act(async () => {
            result1 = await result.current.checkCanVote(validCanVoteData);
        });

        expect(result1).toEqual(mockResponse1);
        expect(result.current.error).toBe(null);

        // 두 번째 확인
        let result2: any;
        await act(async () => {
            result2 = await result.current.checkCanVote({
                ...validCanVoteData,
                voteAmount: 600,
            });
        });

        expect(result2).toEqual(mockResponse2);
        expect(result.current.error).toBe(null);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("GET 방식으로 특수 문자가 포함된 userId 처리", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockSuccessResponse),
        } as any);

        const { result } = renderHook(() => useCanVote());

        await act(async () => {
            await result.current.checkCanVoteByQuery("user@example.com", 100);
        });

        // URL 인코딩이 적용되었는지 확인
        expect(mockFetch).toHaveBeenCalledWith(
            "/api/vote/can-vote?userId=user%40example.com&voteAmount=100",
        );
    });
});
