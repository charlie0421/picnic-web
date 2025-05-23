/**
 * image.ts 테스트
 *
 * 이 테스트는 이미지 URL 처리 유틸리티 함수를 검증합니다.
 * 테스트 대상: getCdnImageUrl 함수
 */

import { getCdnImageUrl } from "@/utils/api/image";

// useLanguageStore 모킹
jest.mock("@/stores/languageStore", () => ({
    useLanguageStore: {
        getState: jest.fn(() => ({
            currentLanguage: "ko",
        })),
    },
}));

describe("이미지 유틸리티 함수", () => {
    const originalWindow = global.window;
    const originalEnv = process.env;

    beforeEach(() => {
        // Window 객체 모킹 (SSR/CSR 테스트 위함)
        global.window = undefined as any;

        // 환경 변수 설정
        process.env = {
            ...originalEnv,
            NEXT_PUBLIC_CDN_URL: "https://cdn.example.com",
        };

        // 콘솔 에러 모킹
        jest.spyOn(console, "error").mockImplementation(() => {});

        jest.clearAllMocks();
    });

    afterEach(() => {
        // Window 객체 복원
        global.window = originalWindow;
        // 환경 변수 복원
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    describe("getCdnImageUrl", () => {
        it("null 또는 undefined 경로는 빈 문자열을 반환한다", () => {
            expect(getCdnImageUrl(null)).toBe("");
            expect(getCdnImageUrl(undefined)).toBe("");
        });

        it("전체 URL인 경우 그대로 반환한다", () => {
            const httpsUrl = "https://example.com/image.jpg";
            const httpUrl = "http://example.com/image.jpg";

            expect(getCdnImageUrl(httpsUrl)).toBe(httpsUrl);
            expect(getCdnImageUrl(httpUrl)).toBe(httpUrl);

            // 공백이 있는 URL 처리 - 소스 코드의 동작은 검사 전에 trim을 하지 않음
            // URL 검사는 .startsWith()로 하기 때문에 앞에 공백이 있는 경우 체크에 실패하고 일반 경로로 처리됨
            const urlWithSpacesBefore = " https://example.com/image.jpg";
            expect(getCdnImageUrl(urlWithSpacesBefore))
                .toBe("https://cdn.example.com/https://example.com/image.jpg");

            // 뒤에 공백이 있는 URL은 체크에서는 통과하지만 trim 처리되어 반환됨
            const urlWithSpacesAfter = "https://example.com/image.jpg ";
            expect(getCdnImageUrl(urlWithSpacesAfter)).toBe(
                "https://example.com/image.jpg",
            );
        });

        it("일반 경로는 CDN URL과 결합하여 반환한다", () => {
            const path = "images/photo.jpg";
            const expected = "https://cdn.example.com/images/photo.jpg";

            expect(getCdnImageUrl(path)).toBe(expected);
        });

        it("슬래시로 시작하는 경로는 중복 슬래시를 제거한다", () => {
            const path = "/images/photo.jpg";
            const expected = "https://cdn.example.com/images/photo.jpg";

            expect(getCdnImageUrl(path)).toBe(expected);
        });

        it("너비 파라미터가 제공되면 URL에 추가한다", () => {
            const path = "images/photo.jpg";
            const width = 500;
            const expected = "https://cdn.example.com/images/photo.jpg?w=500";

            expect(getCdnImageUrl(path, width)).toBe(expected);
        });

        it("JSON 형식의 다국어 경로에서 현재 언어의 경로를 사용한다", () => {
            // 브라우저 환경 설정
            global.window = {} as any;

            const pathJson = JSON.stringify({
                en: "images/english.jpg",
                ko: "images/korean.jpg",
                ja: "images/japanese.jpg",
            });

            // 현재 언어가 'ko'로 모킹되어 있음
            const expected = "https://cdn.example.com/images/korean.jpg";

            expect(getCdnImageUrl(pathJson)).toBe(expected);
        });

        it("JSON 형식에서 현재 언어가 없으면 영어로 폴백한다", () => {
            // 브라우저 환경 설정
            global.window = {} as any;

            const pathJson = JSON.stringify({
                en: "images/english.jpg",
                ja: "images/japanese.jpg",
            });

            // 'ko' 번역이 없으므로 'en'으로 폴백
            const expected = "https://cdn.example.com/images/english.jpg";

            expect(getCdnImageUrl(pathJson)).toBe(expected);
        });

        it("JSON 형식에서 영어도 없으면 한국어로 폴백한다", () => {
            // 브라우저 환경 설정
            global.window = {} as any;

            const pathJson = JSON.stringify({
                ko: "images/korean.jpg",
                ja: "images/japanese.jpg",
            });

            // 'en'이 없으므로 'ko'로 폴백
            const expected = "https://cdn.example.com/images/korean.jpg";

            expect(getCdnImageUrl(pathJson)).toBe(expected);
        });

        it("JSON 형식에서 어떤 언어도 없으면 첫 번째 값을 사용한다", () => {
            // 브라우저 환경 설정
            global.window = {} as any;

            const pathJson = JSON.stringify({
                ja: "images/japanese.jpg",
                zh: "images/chinese.jpg",
            });

            // 'ko'와 'en'이 모두 없으므로 첫 번째 값으로 폴백
            const expected = "https://cdn.example.com/images/japanese.jpg";

            expect(getCdnImageUrl(pathJson)).toBe(expected);
        });

        it("JSON 형식 아닌 일반 문자열을 처리한다", () => {
            // JSON이 아닌 일반 문자열
            const nonJsonString = "{invalid-non-json}";

            // 일반 경로로 처리됨
            const expected = "https://cdn.example.com/{invalid-non-json}";

            expect(getCdnImageUrl(nonJsonString)).toBe(expected);

            // 콘솔 에러가 호출되지 않음 (JSON 파싱 시도조차 하지 않음)
            expect(console.error).not.toHaveBeenCalled();
        });

        it("JSON 파싱 실패 시 원래 경로를 사용한다", () => {
            // 불완전한 JSON 형식
            const invalidJson = '{"en":"english.jpg", "ko":'; // 닫는 따옴표 없음

            const result = getCdnImageUrl(invalidJson);

            // 에러가 콘솔에 로깅됨
            expect(console.error).toHaveBeenCalled();

            // 원래 경로를 그대로 사용
            expect(result).toBe("https://cdn.example.com/" + invalidJson);
        });

        it("서버 사이드에서도 languageStore가 접근 가능하면 언어를 사용한다", () => {
            // window는 undefined지만, languageStore.getState는 모킹되어 있음

            const pathJson = JSON.stringify({
                en: "images/english.jpg",
                ko: "images/korean.jpg",
            });

            // 모킹된 "ko" 언어로 인해 한국어 경로가 사용됨
            const expected = "https://cdn.example.com/images/korean.jpg";

            expect(getCdnImageUrl(pathJson)).toBe(expected);
        });

        it("언어 스토어 접근 중 에러가 발생하면 영어로 폴백한다", () => {
            // 에러 발생하도록 모킹
            jest.requireMock("@/stores/languageStore").useLanguageStore.getState
                .mockImplementationOnce(() => {
                    throw new Error("Store access error");
                });

            global.window = {} as any;

            const pathJson = JSON.stringify({
                en: "images/english.jpg",
                ko: "images/korean.jpg",
            });

            const expected = "https://cdn.example.com/images/english.jpg";

            expect(getCdnImageUrl(pathJson)).toBe(expected);
            expect(console.error).toHaveBeenCalled();
        });

        it("CDN URL 환경 변수가 없으면 경로만 사용한다", () => {
            // CDN URL 환경 변수 제거
            process.env.NEXT_PUBLIC_CDN_URL = "";

            const path = "images/photo.jpg";
            const expected = "/images/photo.jpg";

            expect(getCdnImageUrl(path)).toBe(expected);
        });
    });
});
