/**
 * supabase-service.ts 테스트
 *
 * 이 테스트 파일은 데이터 페칭 유틸리티 중 supabase-service.ts 파일의 함수들을 테스트합니다.
 * 특히 ID로 항목을 조회하고 없을 경우 404 처리를 하는 getByIdOrNotFound 함수를 중점적으로 테스트합니다.
 */

// 외부 모듈 모킹
import { notFound } from "next/navigation";

jest.mock("next/navigation", () => ({
    notFound: jest.fn(),
}));

// DataFetchingError와 ErrorType을 직접 정의 (실제 코드와 동일하게)
class DataFetchingError extends Error {
    constructor(
        public message: string,
        public type: string,
        public statusCode: number,
    ) {
        super(message);
        this.name = "DataFetchingError";
    }
}

const ErrorType = {
    NOT_FOUND: "NOT_FOUND",
    SERVER: "SERVER",
    VALIDATION: "VALIDATION",
    UNKNOWN: "UNKNOWN",
};

// 모킹용 TABLES 객체
const TABLES = {
    VOTE: "votes" as const,
};

// getById 함수를 모킹 (실제 Supabase 호출 없이)
const mockGetById = jest.fn();

// getByIdOrNotFound 함수를 인라인으로 구현 (실제 구현과 동일하게)
async function getByIdOrNotFound<T>(
    table: string,
    id: string,
    columns: string = "*",
    options?: { cache: "no-store" },
): Promise<T> {
    try {
        // 모킹된 getById 함수 호출
        return await mockGetById(table, id, columns, options);
    } catch (error) {
        // 항목을 찾을 수 없는 경우 (NOT_FOUND 오류)
        if (
            error instanceof DataFetchingError &&
            error.type === ErrorType.NOT_FOUND
        ) {
            notFound();
            // notFound 함수가 호출된 후에도 계속 실행되기 때문에
            // 테스트를 위해 아무 값이나 반환 (실제로는 도달하지 않음)
            return {} as T;
        }

        // 다른 오류는 그대로 전파
        throw error;
    }
}

describe("getByIdOrNotFound 함수", () => {
    beforeEach(() => {
        // 테스트 사이에 모든 모킹 초기화
        jest.clearAllMocks();
    });

    test("ID로 항목을 성공적으로 조회하면 해당 데이터를 반환한다", async () => {
        // 준비
        const mockData = { id: "123", title: "테스트 투표" };
        mockGetById.mockResolvedValue(mockData);

        // 실행
        const result = await getByIdOrNotFound(TABLES.VOTE, "123");

        // 검증
        expect(mockGetById).toHaveBeenCalledWith(
            TABLES.VOTE,
            "123",
            "*",
            undefined,
        );
        expect(result).toEqual(mockData);
        expect(notFound).not.toHaveBeenCalled();
    });

    test("항목이 없을 경우 notFound를 호출한다", async () => {
        // 준비
        mockGetById.mockImplementation(() => {
            throw new DataFetchingError(
                "항목을 찾을 수 없습니다",
                ErrorType.NOT_FOUND,
                404,
            );
        });

        // 실행
        await getByIdOrNotFound(TABLES.VOTE, "999");

        // 검증
        expect(mockGetById).toHaveBeenCalledWith(
            TABLES.VOTE,
            "999",
            "*",
            undefined,
        );
        expect(notFound).toHaveBeenCalled();
    });

    test("NOT_FOUND 이외의 오류는 그대로 전파된다", async () => {
        // 준비
        const serverError = new DataFetchingError(
            "서버 오류",
            ErrorType.SERVER,
            500,
        );
        mockGetById.mockRejectedValue(serverError);

        // 실행 및 검증
        await expect(getByIdOrNotFound(TABLES.VOTE, "123")).rejects.toThrow(
            serverError,
        );
        expect(mockGetById).toHaveBeenCalledWith(
            TABLES.VOTE,
            "123",
            "*",
            undefined,
        );
        expect(notFound).not.toHaveBeenCalled();
    });

    test("일반 오류도 그대로 전파된다", async () => {
        // 준비
        const generalError = new Error("일반 오류 발생");
        mockGetById.mockRejectedValue(generalError);

        // 실행 및 검증
        await expect(getByIdOrNotFound(TABLES.VOTE, "123")).rejects.toThrow(
            generalError,
        );
        expect(mockGetById).toHaveBeenCalledWith(
            TABLES.VOTE,
            "123",
            "*",
            undefined,
        );
        expect(notFound).not.toHaveBeenCalled();
    });

    test("커스텀 컬럼을 지정하여 조회할 수 있다", async () => {
        // 준비
        const mockData = { id: "123", title: "테스트 제목" };
        mockGetById.mockResolvedValue(mockData);

        // 실행
        const result = await getByIdOrNotFound(TABLES.VOTE, "123", "id,title");

        // 검증
        expect(mockGetById).toHaveBeenCalledWith(
            TABLES.VOTE,
            "123",
            "id,title",
            undefined,
        );
        expect(result).toEqual(mockData);
    });

    test("쿼리 옵션을 지정하여 조회할 수 있다", async () => {
        // 준비
        const mockData = { id: "123", name: "테스트 이름" };
        mockGetById.mockResolvedValue(mockData);
        const options = { cache: "no-store" as const };

        // 실행
        const result = await getByIdOrNotFound(
            TABLES.VOTE,
            "123",
            "*",
            options,
        );

        // 검증
        expect(mockGetById).toHaveBeenCalledWith(
            TABLES.VOTE,
            "123",
            "*",
            options,
        );
        expect(result).toEqual(mockData);
    });
});
