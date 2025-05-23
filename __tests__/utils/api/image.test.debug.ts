/**
 * image.ts 테스트 디버깅
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

describe("image.ts 디버깅", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_CDN_URL = "https://cdn.example.com";
        jest.spyOn(console, "error").mockImplementation((...args) => {
            console.log("MOCK CONSOLE ERROR:", ...args);
        });
        jest.spyOn(console, "log").mockImplementation((...args) => {
            console.log("MOCK CONSOLE LOG:", ...args);
        });
        global.window = {} as any;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("전체 URL 테스트", () => {
        const url = "https://example.com/image.jpg";
        console.log("INPUT:", url);
        console.log("OUTPUT:", getCdnImageUrl(url));
    });

    it("공백이 있는 URL 테스트", () => {
        const url = " https://example.com/image.jpg ";
        console.log("INPUT:", url);
        console.log("OUTPUT:", getCdnImageUrl(url));
    });

    it("JSON 파싱 실패 테스트", () => {
        const invalidJson = "{invalid json string";
        console.log("INPUT:", invalidJson);
        console.log("OUTPUT:", getCdnImageUrl(invalidJson));
    });
});
