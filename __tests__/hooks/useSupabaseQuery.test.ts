/**
 * useSupabaseQuery 훅 테스트
 *
 * 이 테스트는 useSupabaseQuery와 useSupabaseMutation 훅의 기능을 검증합니다.
 * 테스트 대상: 상태 관리, 에러 처리, 데이터 변환
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import {
    useSupabaseMutation,
    useSupabaseQuery,
} from "@/hooks/useSupabaseQuery";
import { handleError } from "@/lib/supabase/error";

// Supabase 컴포넌트 모킹
jest.mock("@/components/providers/SupabaseProvider", () => ({
    useSupabase: jest.fn(() => ({
        supabase: "mocked-supabase-client",
        transformers: {
            transform: jest.fn((data) => {
                // 간단한 snake_case -> camelCase 변환 모킹
                if (Array.isArray(data)) {
                    return data.map((item) => {
                        if (item.user_id) {
                            return {
                                ...item,
                                userId: item.user_id,
                                user_id: undefined,
                            };
                        }
                        return item;
                    });
                } else if (data && typeof data === "object") {
                    if (data.user_id) {
                        return {
                            ...data,
                            userId: data.user_id,
                            user_id: undefined,
                        };
                    }
                }
                return data;
            }),
        },
    })),
}));

// 에러 핸들러 모킹
jest.mock("@/lib/supabase/error", () => ({
    handleError: jest.fn((error) => ({
        code: "TEST_ERROR",
        message: error.message || "Test error message",
        details: error,
        status: 400,
    })),
}));

describe("useSupabaseQuery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("쿼리 훅 (useSupabaseQuery)", () => {
        it("성공적으로 데이터를 로드하고 변환해야 한다", async () => {
            // 모의 응답 데이터
            const mockData = [
                { id: 1, user_id: "user-1", name: "홍길동" },
                { id: 2, user_id: "user-2", name: "김철수" },
            ];

            // 모의 쿼리 함수
            const queryFn = jest.fn().mockResolvedValue({
                data: mockData,
                error: null,
            });

            // 훅 렌더링 (옵션 추가)
            const { result } = renderHook(() => useSupabaseQuery(queryFn, { queryKey: 'test-query' }));

            // 초기 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.data).toBeNull();
            expect(result.current.error).toBeNull();

            // 쿼리 실행
            await act(async () => {
                await result.current.execute();
            });

            // 로딩 완료 후 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();

            // 데이터가 올바르게 로드되었는지 확인
            expect(result.current.data).toEqual(mockData);

            // 쿼리 함수가 호출되었는지 확인
            expect(queryFn).toHaveBeenCalled();
        });

        it("API 에러를 올바르게 처리해야 한다", async () => {
            // 모의 에러 객체
            const mockError = {
                message: "Database connection error",
                code: "PGRST_ERROR",
            };

            // 모의 쿼리 함수 (에러 반환)
            const queryFn = jest.fn().mockResolvedValue({
                data: null,
                error: mockError,
            });

            // 훅 렌더링 (옵션 추가)
            const { result } = renderHook(() => useSupabaseQuery(queryFn, { queryKey: 'test-query' }));

            // 쿼리 실행
            await act(async () => {
                await result.current.execute();
            });

            // 에러 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.data).toBeNull();

            // 에러 객체 확인
            expect(result.current.error).toBeDefined();
            expect(result.current.error?.message).toBe(
                "Database connection error",
            );

            // handleError 함수가 호출되었는지 확인
            expect(handleError).toHaveBeenCalledWith(mockError);
        });

        it("예외가 발생하면 에러 상태로 설정해야 한다", async () => {
            // 예외를 발생시키는 모의 쿼리 함수
            const queryFn = jest.fn().mockImplementation(() => {
                throw new Error("Network error");
            });

            // 훅 렌더링 (옵션 추가)
            const { result } = renderHook(() => useSupabaseQuery(queryFn, { queryKey: 'test-query' }));

            // 쿼리 실행
            await act(async () => {
                await result.current.execute();
            });

            // 에러 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.data).toBeNull();

            // 에러 객체 확인
            expect(result.current.error).toBeDefined();
            expect(result.current.error?.message).toBe("Network error");

            // handleError 함수가 호출되었는지 확인
            expect(handleError).toHaveBeenCalled();
        });
    });

    describe("뮤테이션 훅 (useSupabaseMutation)", () => {
        it("성공적으로 데이터를 변경하고 결과를 반환해야 한다", async () => {
            // 모의 입력 데이터
            const inputData = { name: "홍길동", email: "hong@example.com" };

            // 모의 응답 데이터
            const mockResponse = {
                id: 1,
                user_id: "new-user-id",
                ...inputData,
            };

            // 모의 뮤테이션 함수
            const mutationFn = jest.fn().mockResolvedValue({
                data: mockResponse,
                error: null,
            });

            // 훅 렌더링
            const { result } = renderHook(() =>
                useSupabaseMutation(mutationFn)
            );

            // 초기 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isSuccess).toBe(false);
            expect(result.current.isError).toBe(false);
            expect(result.current.data).toBeNull();

            // 뮤테이션 실행
            let mutationResult;
            await act(async () => {
                mutationResult = await result.current.execute(inputData);
            });

            // 로딩 완료 후 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isSuccess).toBe(true);
            expect(result.current.isError).toBe(false);
            expect(result.current.error).toBeNull();

            // 반환값 확인
            expect(mutationResult.success).toBe(true);
            expect(mutationResult.data).toBeDefined();

            // 데이터 변환 확인 (snake_case -> camelCase)
            expect(result.current.data).toEqual({
                id: 1,
                userId: "new-user-id",
                user_id: undefined,
                name: "홍길동",
                email: "hong@example.com",
            });

            // 뮤테이션 함수가 호출되었는지 확인
            expect(mutationFn).toHaveBeenCalledWith(
                "mocked-supabase-client",
                inputData,
            );
        });

        it("API 에러를 올바르게 처리하고 에러 결과를 반환해야 한다", async () => {
            // 모의 입력 데이터
            const inputData = { name: "홍길동", email: "invalid-email" };

            // 모의 에러 객체
            const mockError = {
                message: "Invalid email format",
                code: "VALIDATION_ERROR",
            };

            // 모의 뮤테이션 함수 (에러 반환)
            const mutationFn = jest.fn().mockResolvedValue({
                data: null,
                error: mockError,
            });

            // 훅 렌더링
            const { result } = renderHook(() =>
                useSupabaseMutation(mutationFn)
            );

            // 뮤테이션 실행
            let mutationResult;
            await act(async () => {
                mutationResult = await result.current.execute(inputData);
            });

            // 에러 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isSuccess).toBe(false);
            expect(result.current.isError).toBe(true);
            expect(result.current.data).toBeNull();

            // 반환값 확인
            expect(mutationResult.success).toBe(false);
            expect(mutationResult.error).toBeDefined();

            // 에러 객체 확인
            expect(result.current.error).toBeDefined();
            expect(result.current.error?.message).toBe("Invalid email format");

            // handleError 함수가 호출되었는지 확인
            expect(handleError).toHaveBeenCalledWith(mockError);
        });

        it("예외가 발생하면 에러 상태로 설정하고 에러 결과를 반환해야 한다", async () => {
            // 모의 입력 데이터
            const inputData = { name: "홍길동", email: "hong@example.com" };

            // 예외를 발생시키는 모의 뮤테이션 함수
            const mutationFn = jest.fn().mockImplementation(() => {
                throw new Error("Server is down");
            });

            // 훅 렌더링
            const { result } = renderHook(() =>
                useSupabaseMutation(mutationFn)
            );

            // 뮤테이션 실행
            let mutationResult;
            await act(async () => {
                mutationResult = await result.current.execute(inputData);
            });

            // 에러 상태 확인
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isSuccess).toBe(false);
            expect(result.current.isError).toBe(true);
            expect(result.current.data).toBeNull();

            // 반환값 확인
            expect(mutationResult.success).toBe(false);
            expect(mutationResult.error).toBeDefined();

            // 에러 객체 확인
            expect(result.current.error).toBeDefined();
            expect(result.current.error?.message).toBe("Server is down");

            // handleError 함수가 호출되었는지 확인
            expect(handleError).toHaveBeenCalled();
        });
    });
});
