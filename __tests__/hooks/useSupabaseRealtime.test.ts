/**
 * useSupabaseRealtime 훅 테스트
 *
 * 이 테스트는 Supabase Realtime API 관련 훅의 기능을 검증합니다.
 * 테스트 대상: 구독 설정, 이벤트 핸들링, 오류 처리, 정리(cleanup)
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import {
    useRealtimeData,
    useSupabaseSubscription,
} from "@/hooks/useSupabaseRealtime";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { handleError } from "@/lib/supabase/error";

// 모의 채널 객체
const mockChannel = {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockImplementation((callback) => {
        callback("SUBSCRIBED");
        return mockChannel;
    }),
    unsubscribe: jest.fn(),
};

// Supabase 컴포넌트 모킹
jest.mock("@/components/providers/SupabaseProvider", () => ({
    useSupabase: jest.fn(() => ({
        supabase: {
            channel: jest.fn().mockReturnValue(mockChannel),
        },
        transformers: {
            transform: jest.fn((data) => {
                // 간단한 snake_case -> camelCase 변환 모킹
                if (Array.isArray(data)) {
                    return data.map((item) => {
                        if (item.item_id) {
                            return {
                                ...item,
                                itemId: item.item_id,
                                item_id: undefined,
                            };
                        }
                        return item;
                    });
                } else if (data && typeof data === "object") {
                    if (data.item_id) {
                        return {
                            ...data,
                            itemId: data.item_id,
                            item_id: undefined,
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
        code: "REALTIME_ERROR",
        message: error.message || "Realtime error",
        details: error,
        status: 500,
    })),
}));

describe("useSupabaseRealtime", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("useSupabaseSubscription", () => {
        it("성공적으로 구독을 설정해야 한다", async () => {
            const mockOnChange = jest.fn();

            const { result } = renderHook(() =>
                useSupabaseSubscription({
                    table: "votes",
                    event: "UPDATE",
                    filter: "id=eq.123",
                    onChange: mockOnChange,
                })
            );

            await waitFor(() => {
                expect(result.current.isConnected).toBe(true);
            });

            expect(result.current.error).toBeNull();

            // 채널이 올바르게 생성되었는지 확인
            expect(mockChannel.on).toHaveBeenCalledWith(
                "postgres_changes",
                [{
                    event: "UPDATE",
                    schema: "public",
                    table: "votes",
                    filter: "id=eq.123",
                }],
                expect.any(Function),
            );

            // 구독이 설정되었는지 확인
            expect(mockChannel.subscribe).toHaveBeenCalled();
        });

        it("여러 이벤트를 구독할 수 있어야 한다", async () => {
            const { result } = renderHook(() =>
                useSupabaseSubscription({
                    table: "votes",
                    event: ["INSERT", "UPDATE"],
                    filter: "id=eq.123",
                    onChange: jest.fn(),
                })
            );

            await waitFor(() => {
                expect(result.current.isConnected).toBe(true);
            });

            // 여러 이벤트가 올바르게 설정되었는지 확인
            expect(mockChannel.on).toHaveBeenCalledWith(
                "postgres_changes",
                [
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "votes",
                        filter: "id=eq.123",
                    },
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "votes",
                        filter: "id=eq.123",
                    },
                ],
                expect.any(Function),
            );
        });

        it("컴포넌트 언마운트 시 구독이 해제되어야 한다", async () => {
            const { result, unmount } = renderHook(() =>
                useSupabaseSubscription({
                    table: "votes",
                    onChange: jest.fn(),
                })
            );

            await waitFor(() => {
                expect(result.current.isConnected).toBe(true);
            });

            // 구독 해제 함수 호출
            act(() => {
                result.current.unsubscribe();
            });

            expect(mockChannel.unsubscribe).toHaveBeenCalled();

            // 호출된 결과 검증
            await waitFor(() => {
                expect(result.current.isConnected).toBe(false);
            });

            // 컴포넌트 언마운트 시 구독 해제 확인
            unmount();
            expect(mockChannel.unsubscribe).toHaveBeenCalled();
        });

        it("데이터 변경 시 onChange 콜백이 호출되어야 한다", async () => {
            const mockOnChange = jest.fn();

            renderHook(() =>
                useSupabaseSubscription({
                    table: "votes",
                    onChange: mockOnChange,
                })
            );

            // on 메서드에 전달된 콜백 함수 추출
            const onCallback = mockChannel.on.mock.calls[0][2];

            // 모의 페이로드
            const mockPayload = {
                eventType: "UPDATE",
                schema: "public",
                table: "votes",
                new: { id: 123, item_id: "vote-123", count: 10 },
                old: { id: 123, item_id: "vote-123", count: 5 },
            };

            // 콜백 호출
            act(() => {
                onCallback(mockPayload);
            });

            // 변환된 데이터로 콜백이 호출되었는지 확인
            expect(mockOnChange).toHaveBeenCalledWith({
                ...mockPayload,
                new: {
                    id: 123,
                    itemId: "vote-123",
                    item_id: undefined,
                    count: 10,
                },
                old: {
                    id: 123,
                    itemId: "vote-123",
                    item_id: undefined,
                    count: 5,
                },
            });
        });
    });

    describe("useRealtimeData", () => {
        const mockQuery = jest.fn().mockResolvedValue({
            data: { id: 123, item_id: "vote-123", title: "테스트 투표" },
            error: null,
        });

        beforeEach(() => {
            mockQuery.mockClear();
        });

        it("초기 데이터를 로드하고 구독을 설정해야 한다", async () => {
            const { result } = renderHook(() =>
                useRealtimeData({
                    table: "votes",
                    query: mockQuery,
                    subscription: {
                        event: "UPDATE",
                        filter: "id=eq.123",
                    },
                })
            );

            // 초기 상태 확인
            expect(result.current.isLoading).toBe(true);

            // 데이터 로드 완료 대기
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // 쿼리가 호출되었는지 확인
            expect(mockQuery).toHaveBeenCalled();

            // 데이터가 변환되어 설정되었는지 확인
            expect(result.current.data).toEqual({
                id: 123,
                itemId: "vote-123",
                item_id: undefined,
                title: "테스트 투표",
            });

            // 에러가 없는지 확인
            expect(result.current.error).toBeNull();

            // 구독이 설정되었는지 확인
            expect(mockChannel.on).toHaveBeenCalledWith(
                "postgres_changes",
                [{
                    event: "UPDATE",
                    schema: "public",
                    table: "votes",
                    filter: "id=eq.123",
                }],
                expect.any(Function),
            );
        });

        it("구독 설정 없이도 작동해야 한다", async () => {
            const { result } = renderHook(() =>
                useRealtimeData({
                    table: "votes",
                    query: mockQuery,
                })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // 데이터가 로드되었는지 확인
            expect(result.current.data).toBeDefined();

            // 기본 구독 설정이 작동했는지 확인
            expect(mockChannel.on).toHaveBeenCalledWith(
                "postgres_changes",
                [{ event: "*", schema: "public", table: "votes" }],
                expect.any(Function),
            );
        });

        it("쿼리 오류를 처리해야 한다", async () => {
            const mockErrorQuery = jest.fn().mockResolvedValue({
                data: null,
                error: new Error("Data fetch error"),
            });

            const { result } = renderHook(() =>
                useRealtimeData({
                    table: "votes",
                    query: mockErrorQuery,
                })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // 에러 상태 확인
            expect(result.current.error).toBeDefined();
            expect(result.current.error?.message).toBe("Data fetch error");
            expect(result.current.data).toBeNull();

            // handleError가 호출되었는지 확인
            expect(handleError).toHaveBeenCalled();
        });

        it("이벤트에 따라 데이터를 업데이트해야 한다", async () => {
            const { result } = renderHook(() =>
                useRealtimeData({
                    table: "votes",
                    query: mockQuery,
                    subscription: {
                        event: "UPDATE",
                    },
                })
            );

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });

            // 초기 데이터 확인
            expect(result.current.data).toEqual({
                id: 123,
                itemId: "vote-123",
                item_id: undefined,
                title: "테스트 투표",
            });

            // on 메서드에 전달된 콜백 함수 추출
            const onCallback = mockChannel.on.mock.calls[0][2];

            // 업데이트 이벤트 모의
            const mockUpdatePayload = {
                eventType: "UPDATE",
                schema: "public",
                table: "votes",
                new: {
                    id: 123,
                    item_id: "vote-123",
                    title: "수정된 테스트 투표",
                    count: 15,
                },
                old: {
                    id: 123,
                    item_id: "vote-123",
                    title: "테스트 투표",
                    count: 10,
                },
            };

            // 쿼리 모의 함수 업데이트 (업데이트된 데이터 반환)
            mockQuery.mockResolvedValueOnce({
                data: mockUpdatePayload.new,
                error: null,
            });

            // 콜백 호출로 업데이트 트리거
            act(() => {
                onCallback(mockUpdatePayload);
            });

            // 데이터가 다시 로드되었는지 확인
            await waitFor(() => {
                expect(mockQuery).toHaveBeenCalledTimes(2);
            });

            // 업데이트된 데이터 확인
            await waitFor(() => {
                expect(result.current.data).toEqual({
                    id: 123,
                    itemId: "vote-123",
                    item_id: undefined,
                    title: "수정된 테스트 투표",
                    count: 15,
                });
            });
        });
    });
});
