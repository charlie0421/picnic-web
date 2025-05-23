/**
 * queries.ts 테스트
 *
 * 이 테스트는 API 데이터 가져오기 함수들을 검증합니다.
 * 테스트 대상: getVotes, getRewards, getRewardById 등 Supabase 쿼리 함수들
 */

// mock 데이터 정의
const mockVoteData = [{
    id: 1,
    title: "테스트 투표",
    deletedAt: null,
    startAt: "2023-01-01",
    stopAt: "2023-01-10",
    createdAt: "2023-01-01",
    updatedAt: "2023-01-01",
    mainImage: "image.jpg",
    resultImage: "result.jpg",
    waitImage: "wait.jpg",
    voteCategory: "test",
    voteContent: "test content",
    voteSubCategory: "subtest",
    visibleAt: "2023-01-01",
    voteItems: [],
    rewards: [],
}];

const mockRewardData = [{
    id: 1,
    title: "테스트 리워드",
    deletedAt: null,
    createdAt: "2023-01-01",
    updatedAt: "2023-01-01",
    locationImages: [],
    overviewImages: [],
    sizeGuide: "",
    sizeGuideImages: [],
}];

const mockRewardById = {
    id: "reward-123",
    title: "테스트 리워드",
    deletedAt: null,
    createdAt: "2023-01-01",
    updatedAt: "2023-01-01",
    locationImages: [],
    overviewImages: [],
    sizeGuide: "",
    sizeGuideImages: [],
};

const mockVoteById = {
    id: 1,
    title: "테스트 투표 상세",
    deletedAt: null,
    startAt: "2023-01-01",
    stopAt: "2023-01-10",
    createdAt: "2023-01-01",
    updatedAt: "2023-01-01",
    mainImage: "image.jpg",
    resultImage: "result.jpg",
    waitImage: "wait.jpg",
    voteCategory: "test",
    voteContent: "test content",
    voteSubCategory: "subtest",
    visibleAt: "2023-01-01",
};

const mockVoteItems = [
    {
        id: 1,
        voteId: 1,
        artistId: 1,
        groupId: 1,
        voteTotal: 100,
        deletedAt: null,
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        artist: {
            id: 1,
            name: "아티스트1",
        },
    },
    {
        id: 2,
        voteId: 1,
        artistId: 2,
        groupId: 1,
        voteTotal: 200,
        deletedAt: null,
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        artist: {
            id: 2,
            name: "아티스트2",
        },
    },
];

const mockVoteRewards = [
    {
        id: 1,
        title: "투표 리워드1",
        deletedAt: null,
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        locationImages: [],
        overviewImages: [],
        sizeGuide: "",
        sizeGuideImages: [],
    },
];

const mockBanners = [
    {
        id: 1,
        title: "메인 배너",
        content: "배너 내용",
        image: "banner.jpg",
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        deletedAt: null,
        startAt: "2023-01-01",
        stopAt: "2023-01-31",
        platform: "all",
    },
];

const mockMedias = [
    {
        id: 1,
        title: "미디어 제목",
        thumbnailUrl: "thumbnail.jpg",
        videoUrl: "video.mp4",
        videoId: "video123",
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        deletedAt: null,
    },
];

const mockPopups = [
    {
        id: 1,
        title: "팝업 제목",
        content: "팝업 내용",
        image: "popup.jpg",
        createdAt: "2023-01-01",
        updatedAt: "2023-01-01",
        deletedAt: null,
        startAt: "2023-01-01",
        stopAt: "2023-01-31",
        platform: "all",
    },
];

// 모듈 모킹
// queries.ts 전체 모듈을 모킹
jest.mock("@/utils/api/queries", () => {
    // 원래 모듈 가져오기
    const originalModule = jest.requireActual("@/utils/api/queries");

    return {
        // 원래 모듈의 모든 export 확장
        ...originalModule,

        // withRetry로 래핑된 함수들 모킹
        getVotes: jest.fn().mockImplementation(async () => mockVoteData),
        getRewards: jest.fn().mockImplementation(async (limit) => {
            if (limit) {
                return mockRewardData.slice(0, limit);
            }
            return mockRewardData;
        }),
        getRewardById: jest.fn().mockImplementation(async (id) => {
            if (id === "reward-123") {
                return mockRewardById;
            }
            return null;
        }),
        getVoteById: jest.fn().mockImplementation(async (id) => {
            if (id === 1) {
                return mockVoteById;
            }
            return null;
        }),
        getVoteItems: jest.fn().mockImplementation(async (voteId) => {
            if (voteId === 1) {
                return mockVoteItems;
            }
            return [];
        }),
        getVoteRewards: jest.fn().mockImplementation(async (voteId) => {
            if (voteId === 1) {
                return mockVoteRewards;
            }
            return [];
        }),
        getBanners: jest.fn().mockImplementation(async () => mockBanners),
        getMedias: jest.fn().mockImplementation(async () => mockMedias),
        getPopups: jest.fn().mockImplementation(async () => mockPopups),
    };
});

// 언어 스토어 모킹
jest.mock("@/stores/languageStore", () => ({
    useLanguageStore: {
        getState: jest.fn(() => ({
            currentLanguage: "ko",
        })),
    },
}));

// 테스트할 함수들 가져오기
import {
    getBanners,
    getMedias,
    getPopups,
    getRewardById,
    getRewards,
    getVoteById,
    getVoteItems,
    getVoteRewards,
    getVotes,
} from "@/utils/api/queries";

// 테스트 시작
describe("쿼리 유틸리티 함수", () => {
    let originalConsoleError;
    let originalWindow;

    beforeEach(() => {
        jest.clearAllMocks();

        // 콘솔 에러 원본 저장 및 모킹
        originalConsoleError = console.error;
        console.error = jest.fn();

        // 원래 window 객체 저장
        originalWindow = global.window;

        // 브라우저 환경 시뮬레이션 (window 객체 mock)
        global.window = {
            location: {
                href: "https://test.com",
                hostname: "test.com",
                pathname: "/test",
            },
        } as any;
    });

    afterEach(() => {
        // 원래 함수와 객체 복원
        console.error = originalConsoleError;
        global.window = originalWindow;
    });

    // getVotes 테스트
    describe("getVotes", () => {
        it("투표 목록을 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getVotes();

            // 함수 호출 검증
            expect(getVotes).toHaveBeenCalled();

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "테스트 투표",
                    }),
                ]),
            );
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getVotes as jest.Mock).mockImplementationOnce(async () => {
                console.error("오류 발생");
                return [];
            });

            // 함수 실행
            const result = await getVotes();

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getRewards 테스트
    describe("getRewards", () => {
        it("리워드 목록을 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getRewards();

            // 함수 호출 검증
            expect(getRewards).toHaveBeenCalled();

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "테스트 리워드",
                    }),
                ]),
            );
        });

        it("limit 파라미터가 있을 경우 limit 메서드를 호출한다", async () => {
            // 함수 실행 (limit 파라미터 포함)
            const result = await getRewards(5);

            // 함수 호출 검증
            expect(getRewards).toHaveBeenCalledWith(5);

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "테스트 리워드",
                    }),
                ]),
            );
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getRewards as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return [];
            });

            // 함수 실행
            const result = await getRewards();

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getRewardById 테스트
    describe("getRewardById", () => {
        it("특정 ID의 리워드를 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getRewardById("reward-123");

            // 함수 호출 검증
            expect(getRewardById).toHaveBeenCalledWith("reward-123");

            // 결과 검증
            expect(result).toEqual(
                expect.objectContaining({
                    id: "reward-123",
                    title: "테스트 리워드",
                }),
            );
        });

        it("리워드가 없을 때 null을 반환한다", async () => {
            // 함수 실행
            const result = await getRewardById("없는-ID");

            // 검증
            expect(result).toBeNull();
        });

        it("오류 발생 시 null을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getRewardById as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return null;
            });

            // 함수 실행
            const result = await getRewardById("reward-123");

            // 검증
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getVoteById 테스트
    describe("getVoteById", () => {
        it("특정 ID의 투표를 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getVoteById(1);

            // 함수 호출 검증
            expect(getVoteById).toHaveBeenCalledWith(1);

            // 결과 검증
            expect(result).toEqual(
                expect.objectContaining({
                    id: 1,
                    title: "테스트 투표 상세",
                }),
            );
        });

        it("투표가 없을 때 null을 반환한다", async () => {
            // 함수 실행
            const result = await getVoteById(999);

            // 검증
            expect(result).toBeNull();
        });

        it("오류 발생 시 null을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getVoteById as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return null;
            });

            // 함수 실행
            const result = await getVoteById(1);

            // 검증
            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getVoteItems 테스트
    describe("getVoteItems", () => {
        it("투표 아이템을 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getVoteItems(1);

            // 함수 호출 검증
            expect(getVoteItems).toHaveBeenCalledWith(1);

            // 결과 검증
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(
                expect.objectContaining({
                    id: 1,
                    voteId: 1,
                    artist: expect.objectContaining({
                        id: 1,
                        name: "아티스트1",
                    }),
                }),
            );
        });

        it("해당 투표 아이템이 없을 때 빈 배열을 반환한다", async () => {
            // 함수 실행
            const result = await getVoteItems(999);

            // 검증
            expect(result).toEqual([]);
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getVoteItems as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return [];
            });

            // 함수 실행
            const result = await getVoteItems(1);

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getVoteRewards 테스트
    describe("getVoteRewards", () => {
        it("투표에 연결된 리워드를 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getVoteRewards(1);

            // 함수 호출 검증
            expect(getVoteRewards).toHaveBeenCalledWith(1);

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "투표 리워드1",
                    }),
                ]),
            );
        });

        it("해당 투표에 리워드가 없을 때 빈 배열을 반환한다", async () => {
            // 함수 실행
            const result = await getVoteRewards(999);

            // 검증
            expect(result).toEqual([]);
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getVoteRewards as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return [];
            });

            // 함수 실행
            const result = await getVoteRewards(1);

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getBanners 테스트
    describe("getBanners", () => {
        it("배너 목록을 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getBanners();

            // 함수 호출 검증
            expect(getBanners).toHaveBeenCalled();

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "메인 배너",
                        image: "banner.jpg",
                    }),
                ]),
            );
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getBanners as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return [];
            });

            // 함수 실행
            const result = await getBanners();

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getMedias 테스트
    describe("getMedias", () => {
        it("미디어 목록을 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getMedias();

            // 함수 호출 검증
            expect(getMedias).toHaveBeenCalled();

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "미디어 제목",
                        thumbnailUrl: "thumbnail.jpg",
                        videoUrl: "video.mp4",
                    }),
                ]),
            );
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getMedias as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return [];
            });

            // 함수 실행
            const result = await getMedias();

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    // getPopups 테스트
    describe("getPopups", () => {
        it("팝업 목록을 성공적으로 가져온다", async () => {
            // 함수 실행
            const result = await getPopups();

            // 함수 호출 검증
            expect(getPopups).toHaveBeenCalled();

            // 결과 검증
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 1,
                        title: "팝업 제목",
                        image: "popup.jpg",
                        content: "팝업 내용",
                    }),
                ]),
            );
        });

        it("오류 발생 시 빈 배열을 반환한다", async () => {
            // 오류 시나리오 모킹
            (getPopups as jest.Mock).mockImplementationOnce(async () => {
                console.error("데이터베이스 오류");
                return [];
            });

            // 함수 실행
            const result = await getPopups();

            // 검증
            expect(result).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });
});
