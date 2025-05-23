/**
 * auth.ts 유틸리티 테스트
 *
 * 이 테스트는 인증 관련 유틸리티 함수를 검증합니다.
 * 테스트 대상: isUserLoggedIn, getUserProfile, getStorageUrl, getCdnUrl, uploadFile
 */

// Supabase 클라이언트를 먼저 모킹한 후 불러오기
// 1. 모킹 함수들 생성
const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockStorageFrom = jest.fn();

// 2. Supabase 클라이언트 모킹
jest.mock("@/utils/supabase-client", () => ({
    supabase: {
        auth: {
            getSession: mockGetSession,
        },
        from: mockFrom,
        storage: {
            from: mockStorageFrom,
        },
    },
}));

// 3. 환경 변수 모킹
const originalEnv = process.env;

describe("auth utilities", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // 환경 변수 설정
        process.env = {
            ...originalEnv,
            NEXT_PUBLIC_CDN_URL: "https://cdn.example.com/",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("isUserLoggedIn", () => {
        it("세션이 있으면 true를 반환한다", async () => {
            // 세션이 있는 경우 모킹
            mockGetSession.mockReturnValue(Promise.resolve({
                data: { session: { user: { id: "user123" } } },
            }));

            const { isUserLoggedIn } = require("@/utils/api/auth");
            const result = await isUserLoggedIn();

            expect(result).toBe(true);
            expect(mockGetSession).toHaveBeenCalled();
        });

        it("세션이 없으면 false를 반환한다", async () => {
            // 세션이 없는 경우 모킹
            mockGetSession.mockReturnValue(Promise.resolve({
                data: { session: null },
            }));

            const { isUserLoggedIn } = require("@/utils/api/auth");
            const result = await isUserLoggedIn();

            expect(result).toBe(false);
            expect(mockGetSession).toHaveBeenCalled();
        });
    });

    describe("getUserProfile", () => {
        it("사용자 프로필을 가져온다", async () => {
            // 모의 사용자 프로필 데이터
            const mockUserProfile = {
                id: "user123",
                username: "testuser",
                email: "test@example.com",
            };

            // 중첩된 모킹 체인 준비
            const mockSingle = jest.fn().mockReturnValue(Promise.resolve({
                data: mockUserProfile,
                error: null,
            }));

            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });

            // supabase.from() 함수 체인 모킹
            mockFrom.mockReturnValue({ select: mockSelect });

            const { getUserProfile } = require("@/utils/api/auth");
            const userId = "user123";
            const result = await getUserProfile(userId);

            expect(result).toEqual(mockUserProfile);
            expect(mockFrom).toHaveBeenCalledWith("user_profiles");
            expect(mockSelect).toHaveBeenCalledWith("*");
            expect(mockEq).toHaveBeenCalledWith("id", userId);
            expect(mockSingle).toHaveBeenCalled();
        });

        it("에러가 발생하면 예외를 던진다", async () => {
            // 에러 응답 모킹
            const mockError = new Error("Database error");

            const mockSingle = jest.fn().mockReturnValue(Promise.resolve({
                data: null,
                error: mockError,
            }));

            const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
            const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });

            // supabase.from() 함수 체인 모킹
            mockFrom.mockReturnValue({ select: mockSelect });

            const { getUserProfile } = require("@/utils/api/auth");
            const userId = "user123";

            // 예외가 발생하는지 테스트
            await expect(getUserProfile(userId)).rejects.toThrow(
                "Database error",
            );
        });
    });

    describe("getStorageUrl", () => {
        it("공개 스토리지 URL을 반환한다", () => {
            // 스토리지 URL 모킹
            const mockGetPublicUrl = jest.fn().mockReturnValue({
                data: {
                    publicUrl: "https://example.com/storage/avatars/image.jpg",
                },
            });

            // supabase.storage.from() 함수 모킹
            mockStorageFrom.mockReturnValue({
                getPublicUrl: mockGetPublicUrl,
            });

            const { getStorageUrl } = require("@/utils/api/auth");
            const bucket = "avatars";
            const path = "image.jpg";
            const result = getStorageUrl(bucket, path);

            expect(result).toBe(
                "https://example.com/storage/avatars/image.jpg",
            );
            expect(mockStorageFrom).toHaveBeenCalledWith(bucket);
            expect(mockGetPublicUrl).toHaveBeenCalledWith(path);
        });
    });

    describe("getCdnUrl", () => {
        it("CDN URL을 반환한다", () => {
            const { getCdnUrl } = require("@/utils/api/auth");

            // 슬래시로 시작하는 경로
            const path = "images/logo.png"; // 슬래시를 제거하여 중복 슬래시 방지
            const result = getCdnUrl(path);

            // CDN_URL은 이미 끝에 '/'가 있으므로 경로에서는 앞의 '/'를 제거
            expect(result).toBe("https://cdn.example.com/images/logo.png");
        });
    });

    describe("uploadFile", () => {
        it("파일을 업로드한다", async () => {
            // 업로드 성공 응답 모킹
            const mockUploadResponse = {
                path: "avatars/image.jpg",
            };

            const mockUpload = jest.fn().mockReturnValue(Promise.resolve({
                data: mockUploadResponse,
                error: null,
            }));

            // supabase.storage.from() 함수 모킹
            mockStorageFrom.mockReturnValue({
                upload: mockUpload,
            });

            const { uploadFile } = require("@/utils/api/auth");
            const bucket = "avatars";
            const path = "image.jpg";
            const file = new File(["file content"], "image.jpg", {
                type: "image/jpeg",
            });

            const result = await uploadFile(bucket, path, file);

            expect(result).toEqual(mockUploadResponse);
            expect(mockStorageFrom).toHaveBeenCalledWith(bucket);
            expect(mockUpload).toHaveBeenCalledWith(path, file);
        });

        it("업로드 실패 시 에러를 던진다", async () => {
            // 업로드 에러 응답 모킹
            const mockError = new Error("Upload failed");

            const mockUpload = jest.fn().mockReturnValue(Promise.resolve({
                data: null,
                error: mockError,
            }));

            // supabase.storage.from() 함수 모킹
            mockStorageFrom.mockReturnValue({
                upload: mockUpload,
            });

            const { uploadFile } = require("@/utils/api/auth");
            const bucket = "avatars";
            const path = "image.jpg";
            const file = new File(["file content"], "image.jpg", {
                type: "image/jpeg",
            });

            // 예외가 발생하는지 테스트
            await expect(uploadFile(bucket, path, file)).rejects.toThrow(
                "Upload failed",
            );
        });
    });
});
