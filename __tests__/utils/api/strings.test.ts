/**
 * strings.ts 테스트
 *
 * 이 테스트는 다국어 문자열 처리 유틸리티 함수를 검증합니다.
 * 테스트 대상: getLocalizedString, getLocalizedJson 함수
 */

import { getLocalizedJson, getLocalizedString } from "@/utils/api/strings";

// 모듈 모킹은 반드시 import 문 아래, 다른 코드 위에 위치해야 함
jest.mock("@/stores/languageStore", () => ({
    useLanguageStore: {
        getState: jest.fn(() => ({
            currentLanguage: "ko",
        })),
    },
}));

// 모킹된 모듈 가져오기
const mockedLanguageStore = jest.requireMock("@/stores/languageStore");

describe("strings 유틸리티 함수", () => {
    const originalWindow = global.window;
    const originalConsoleError = console.error;

    beforeEach(() => {
        // 콘솔 에러 모킹
        console.error = jest.fn();

        // window 객체 모킹 (브라우저 환경은 기본값으로 설정)
        global.window = {} as Window & typeof globalThis;

        // 기본 언어를 '한국어'로 설정
        mockedLanguageStore.useLanguageStore.getState.mockReturnValue({
            currentLanguage: "ko",
        });
    });

    afterEach(() => {
        // window 객체와 console.error 복원
        global.window = originalWindow;
        console.error = originalConsoleError;
        jest.clearAllMocks();
    });

    describe("getLocalizedString", () => {
        it("null 또는 undefined 값은 빈 문자열을 반환한다", () => {
            expect(getLocalizedString(null)).toBe("");
            expect(getLocalizedString(undefined)).toBe("");
        });

        it("문자열이 입력되면 그대로 반환한다", () => {
            expect(getLocalizedString("테스트")).toBe("테스트");
        });

        it("숫자가 입력되면 문자열로 변환하여 반환한다", () => {
            expect(getLocalizedString(123)).toBe("123");
        });

        it("객체가 입력되면 현재 언어에 맞는 문자열을 반환한다", () => {
            const multiLangObj = {
                ko: "안녕하세요",
                en: "Hello",
                ja: "こんにちは",
            };
            expect(getLocalizedString(multiLangObj, "ko")).toBe("안녕하세요");
            expect(getLocalizedString(multiLangObj, "en")).toBe("Hello");
            expect(getLocalizedString(multiLangObj, "ja")).toBe("こんにちは");
        });

        it("언어 파라미터가 없으면 store에서 언어 설정을 가져온다", () => {
            const multiLangObj = {
                ko: "안녕하세요",
                en: "Hello",
                ja: "こんにちは",
            };

            // useLanguageStore.getState()에서 ko를 반환하도록 이미 모킹됨
            expect(getLocalizedString(multiLangObj)).toBe("안녕하세요");
        });

        it("서버 사이드 렌더링 환경에서는 기본 영어로 설정된다", () => {
            // SSR 환경 시뮬레이션 (window 없음)
            global.window = undefined as any;

            // SSR 환경에서는 store에 접근하면 안되므로 getState 호출에 대한 모킹 재설정
            // 기존 getState가 호출되어 currentLanguage="ko"를 반환하지 않도록
            mockedLanguageStore.useLanguageStore.getState
                .mockImplementationOnce(() => {
                    // SSR 환경에서는 window 체크 때문에 이 함수가 호출되지 말아야 함
                    // 혹시라도 호출되면 undefined를 반환하여 기본값 'en'이 사용되도록 함
                    return { currentLanguage: undefined };
                });

            const multiLangObj = {
                ko: "안녕하세요",
                en: "Hello",
                ja: "こんにちは",
            };

            expect(getLocalizedString(multiLangObj)).toBe("Hello");
        });

        it("현재 언어에 번역이 없으면 영어로 폴백한다", () => {
            const multiLangObj = {
                en: "Hello",
                ja: "こんにちは",
                // ko 키가 없음
            };

            expect(getLocalizedString(multiLangObj, "ko")).toBe("Hello");
        });

        it("영어 번역도 없으면 빈 문자열을 반환한다", () => {
            const multiLangObj = {
                ja: "こんにちは",
                // en 키가 없음
                // ko 키가 없음
            };

            expect(getLocalizedString(multiLangObj, "ko")).toBe("");
        });

        it("언어 스토어에 접근하는 중 에러가 발생하면 영어로 폴백한다", () => {
            // getState가 에러를 던지도록 설정
            mockedLanguageStore.useLanguageStore.getState
                .mockImplementationOnce(() => {
                    throw new Error("테스트 에러");
                });

            const multiLangObj = {
                ko: "안녕하세요",
                en: "Hello",
            };

            expect(getLocalizedString(multiLangObj)).toBe("Hello");
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("getLocalizedJson", () => {
        it("null 또는 undefined 값은 null을 반환한다", () => {
            expect(getLocalizedJson(null)).toBeNull();
            expect(getLocalizedJson(undefined)).toBeNull();
        });

        it("문자열 또는 숫자가 입력되면 그대로 반환한다", () => {
            expect(getLocalizedJson("테스트")).toBe("테스트");
            expect(getLocalizedJson(123)).toBe(123);
        });

        it("객체가 입력되면 현재 언어에 맞는 객체를 반환한다", () => {
            const multiLangObj = {
                ko: { title: "안녕하세요", description: "한국어 설명" },
                en: { title: "Hello", description: "English description" },
                ja: { title: "こんにちは", description: "日本語の説明" },
            };

            expect(getLocalizedJson(multiLangObj, "ko")).toEqual({
                title: "안녕하세요",
                description: "한국어 설명",
            });

            expect(getLocalizedJson(multiLangObj, "en")).toEqual({
                title: "Hello",
                description: "English description",
            });
        });

        it("언어 파라미터가 없으면 store에서 언어 설정을 가져온다", () => {
            const multiLangObj = {
                ko: { title: "안녕하세요", description: "한국어 설명" },
                en: { title: "Hello", description: "English description" },
            };

            // useLanguageStore.getState()에서 ko를 반환하도록 이미 모킹됨
            expect(getLocalizedJson(multiLangObj)).toEqual({
                title: "안녕하세요",
                description: "한국어 설명",
            });
        });

        it("서버 사이드 렌더링 환경에서는 기본 영어로 설정된다", () => {
            // SSR 환경 시뮬레이션 (window 없음)
            global.window = undefined as any;

            // SSR 환경에서는 store에 접근하면 안되므로 getState 호출에 대한 모킹 재설정
            mockedLanguageStore.useLanguageStore.getState
                .mockImplementationOnce(() => {
                    // SSR 환경에서는 window 체크 때문에 이 함수가 호출되지 말아야 함
                    // 혹시라도 호출되면 undefined를 반환하여 기본값 'en'이 사용되도록 함
                    return { currentLanguage: undefined };
                });

            const multiLangObj = {
                ko: { title: "안녕하세요", description: "한국어 설명" },
                en: { title: "Hello", description: "English description" },
            };

            expect(getLocalizedJson(multiLangObj)).toEqual({
                title: "Hello",
                description: "English description",
            });
        });

        it("현재 언어에 번역이 없으면 영어로 폴백한다", () => {
            const multiLangObj = {
                en: { title: "Hello", description: "English description" },
                ja: { title: "こんにちは", description: "日本語の説明" },
                // ko 키가 없음
            };

            expect(getLocalizedJson(multiLangObj, "ko")).toEqual({
                title: "Hello",
                description: "English description",
            });
        });

        it("영어 번역도 없으면 null을 반환한다", () => {
            const multiLangObj = {
                ja: { title: "こんにちは", description: "日本語の説明" },
                // en 키가 없음
                // ko 키가 없음
            };

            expect(getLocalizedJson(multiLangObj, "ko")).toBeNull();
        });

        it("언어 스토어에 접근하는 중 에러가 발생하면 영어로 폴백한다", () => {
            // getState가 에러를 던지도록 설정
            mockedLanguageStore.useLanguageStore.getState
                .mockImplementationOnce(() => {
                    throw new Error("테스트 에러");
                });

            const multiLangObj = {
                ko: { title: "안녕하세요", description: "한국어 설명" },
                en: { title: "Hello", description: "English description" },
            };

            expect(getLocalizedJson(multiLangObj)).toEqual({
                title: "Hello",
                description: "English description",
            });
            expect(console.error).toHaveBeenCalled();
        });
    });
});
