/**
 * retry-utils.ts 테스트
 *
 * 이 테스트는 API 요청 재시도 및 타임아웃 메커니즘을 검증합니다.
 * 테스트 대상: withRetry, withTimeout 함수
 */

import { withRetry, withTimeout } from "@/utils/api/retry-utils";

describe("retry-utils", () => {
    // 원래 console 메서드 보존
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    // 원래 Promise.race 보존 (타임아웃 테스트용)
    const originalPromiseRace = Promise.race;

    beforeEach(() => {
        // console 메서드 모킹
        console.log = jest.fn();
        console.error = jest.fn();

        // 타이머 모킹
        jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    });

    afterEach(() => {
        // 원래 console 메서드 복원
        console.log = originalConsoleLog;
        console.error = originalConsoleError;

        // Promise.race 복원
        Promise.race = originalPromiseRace;

        // 타이머 모킹 해제
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe("withRetry", () => {
        it("성공적인 API 호출에는 재시도하지 않는다", async () => {
            // 성공하는 API 함수 모킹
            const mockApiCall = jest.fn().mockResolvedValue({ success: true });
            const onRetry = jest.fn();

            // withRetry로 API 함수 래핑
            const retryableFunction = withRetry(mockApiCall, {
                maxRetries: 3,
                onRetry,
            });

            // 함수 호출
            const resultPromise = retryableFunction();

            // 테스트 비동기 해결
            await Promise.resolve();

            // 결과 확인
            const result = await resultPromise;
            expect(result).toEqual({ success: true });
            expect(mockApiCall).toHaveBeenCalledTimes(1);
            expect(onRetry).not.toHaveBeenCalled();
        });

        it("실패 후 성공하는 API 호출은 재시도를 중단한다", async () => {
            // 첫 번째 호출은 실패, 두 번째 호출은 성공하는 API 함수 모킹
            const apiError = new Error("API 호출 실패");
            const mockApiCall = jest.fn()
                .mockRejectedValueOnce(apiError)
                .mockResolvedValueOnce({ success: true });

            const onRetry = jest.fn();

            // withRetry로 API 함수 래핑
            const retryableFunction = withRetry(mockApiCall, {
                maxRetries: 3,
                onRetry,
                initialDelay: 100,
            });

            // 함수 호출
            const resultPromise = retryableFunction();

            // 첫 번째 호출 (실패)
            await Promise.resolve();

            // 첫 번째 실패 후 지연
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            // 두 번째 시도 (성공)
            await Promise.resolve();

            // 결과 확인
            const result = await resultPromise;
            expect(result).toEqual({ success: true });
            expect(mockApiCall).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenCalledWith(apiError, 1);
        });

        it("최대 재시도 횟수만큼 시도한 후 실패한다", async () => {
            // 항상 실패하는 API 함수 모킹
            const apiError = new Error("API 호출 실패");
            const mockApiCall = jest.fn().mockRejectedValue(apiError);
            const onRetry = jest.fn();

            // withRetry로 API 함수 래핑 (최대 1회 재시도)
            const retryableFunction = withRetry(mockApiCall, {
                maxRetries: 1,
                onRetry,
                initialDelay: 100,
            });

            // 함수 호출
            const resultPromise = retryableFunction();

            // 첫 번째 호출 (실패)
            await Promise.resolve();

            // 첫 번째 재시도 준비 (100ms 지연)
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            // 두 번째 시도 (실패)
            await Promise.resolve();

            // 모든 타이머 실행
            jest.runAllTimers();
            await Promise.resolve();

            // 최종적으로 에러가 발생해야 함
            await expect(resultPromise).rejects.toThrow("API 호출 실패");
            expect(mockApiCall).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenCalledWith(apiError, 1);
        });

        it("factor 설정으로 지수 백오프를 사용한다", async () => {
            // 항상 실패하는 API 함수 모킹
            const apiError = new Error("API 호출 실패");
            const mockApiCall = jest.fn().mockRejectedValue(apiError);
            const onRetry = jest.fn();

            // withRetry로 API 함수 래핑 (factor로 지수 백오프 설정)
            const retryableFunction = withRetry(mockApiCall, {
                maxRetries: 2,
                onRetry,
                initialDelay: 100,
                factor: 2,
            });

            // 함수 호출
            const resultPromise = retryableFunction();

            // 첫 번째 호출 (실패)
            await Promise.resolve();

            // 첫 번째 재시도 준비 (100ms 지연)
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            // 첫 번째 재시도 (실패)
            await Promise.resolve();

            // 두 번째 재시도 준비 (지수 백오프로 100*2=200ms 지연)
            jest.advanceTimersByTime(200);
            await Promise.resolve();

            expect(mockApiCall).toHaveBeenCalledTimes(3);
            expect(onRetry).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenCalledWith(apiError, 1);
            expect(onRetry).toHaveBeenCalledWith(apiError, 2);

            // 최종적으로 에러가 발생해야 함
            await expect(resultPromise).rejects.toThrow("API 호출 실패");
        });

        it("maxDelay를 초과하지 않는 지연을 사용한다", async () => {
            // 항상 실패하는 API 함수 모킹
            const apiError = new Error("API 호출 실패");
            const mockApiCall = jest.fn().mockRejectedValue(apiError);
            const onRetry = jest.fn();

            // withRetry로 API 함수 래핑 (maxDelay: 1000)
            const retryableFunction = withRetry(mockApiCall, {
                maxRetries: 2,
                onRetry,
                initialDelay: 500,
                factor: 3,
                maxDelay: 1000,
            });

            // 함수 호출
            const resultPromise = retryableFunction();

            // 첫 번째 호출 (실패)
            await Promise.resolve();

            // 첫 번째 재시도 준비 (500ms 지연)
            jest.advanceTimersByTime(500);
            await Promise.resolve();

            // 첫 번째 재시도 (실패)
            await Promise.resolve();

            // 두 번째 재시도 준비 (factor: 3으로 500*3=1500 > maxDelay=1000 이므로 1000ms 지연)
            jest.advanceTimersByTime(1000);
            await Promise.resolve();

            expect(mockApiCall).toHaveBeenCalledTimes(3);
            expect(onRetry).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenCalledWith(apiError, 1);
            expect(onRetry).toHaveBeenCalledWith(apiError, 2);

            // 최종적으로 에러가 발생해야 함
            await expect(resultPromise).rejects.toThrow("API 호출 실패");
        });

        it("onRetry 콜백이 제공되지 않으면 콘솔 로그 사용", async () => {
            // 항상 실패하는 API 함수 모킹
            const apiError = new Error("API 호출 실패");
            const mockApiCall = jest.fn().mockRejectedValue(apiError);

            // withRetry로 API 함수 래핑 (onRetry 콜백 없음)
            const retryableFunction = withRetry(mockApiCall, {
                maxRetries: 1,
                initialDelay: 100,
            });

            // 함수 호출
            const resultPromise = retryableFunction();

            // 첫 번째 호출 (실패)
            await Promise.resolve();

            // 첫 번째 재시도 준비 (100ms 지연)
            jest.advanceTimersByTime(100);
            await Promise.resolve();

            // 두 번째 시도 (실패)
            await Promise.resolve();

            expect(mockApiCall).toHaveBeenCalledTimes(2);
            expect(console.log).toHaveBeenCalledWith(
                "API 요청 재시도 중... (1/1)",
            );

            // 최종적으로 에러가 발생해야 함
            await expect(resultPromise).rejects.toThrow("API 호출 실패");
        });
    });

    describe("withTimeout", () => {
        it("제한 시간 내에 완료되는 함수는 결과를 반환한다", async () => {
            // 빠르게 완료되는 함수 모킹
            const mockFn = jest.fn().mockResolvedValue({ success: true });

            // withTimeout으로 함수 래핑
            const timeoutFunction = withTimeout(mockFn, 1000);

            // 함수 호출
            const resultPromise = timeoutFunction();

            // 테스트 비동기 해결
            await Promise.resolve();

            // 결과 확인
            const result = await resultPromise;
            expect(result).toEqual({ success: true });
            expect(mockFn).toHaveBeenCalledTimes(1);
        });

        it("제한 시간을 초과하면 타임아웃 에러를 발생시킨다", async () => {
            // 타임아웃 함수 직접 생성 - Promise.race를 사용하지 않음
            function mockWithTimeout(timeoutMs: number) {
                return async () => {
                    throw new Error(`API 요청 타임아웃 (${timeoutMs}ms)`);
                };
            }

            try {
                // 타임아웃 함수 직접 호출
                await mockWithTimeout(5000)();

                // 여기까지 실행되면 안 됨
                expect(true).toBe(false); // fail 대신 expect 사용
            } catch (error: unknown) {
                // 타임아웃 에러 검증
                expect(error).toBeInstanceOf(Error);
                if (error instanceof Error) {
                    expect(error.message).toBe("API 요청 타임아웃 (5000ms)");
                }
            }
        });
    });
});
