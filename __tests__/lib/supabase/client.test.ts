/**
 * client.ts에 대한 테스트
 *
 * 이 테스트는 Supabase 클라이언트 관련 함수들을 테스트합니다.
 * 싱글톤 패턴으로 구현된 client.ts의 특성을 고려하여 설계되었습니다.
 */

// @supabase/ssr에서 실제 모듈을 가져옵니다.
// 전체 모듈을 모킹하기 전에 실제 타입을 활용할 수 있습니다.
import { createBrowserClient } from "@supabase/ssr";

// 1. 모킹할 함수들 직접 정의
const mockGetUser = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();

// 2. @supabase/ssr 모듈 모킹
jest.mock("@supabase/ssr", () => {
  // 모킹된 클라이언트 반환
  return {
    createBrowserClient: jest.fn(() => ({
      auth: {
        getUser: mockGetUser,
        getSession: mockGetSession,
        signOut: mockSignOut,
      },
    })),
  };
});

// 3. 모듈 캐싱 변수에 대한 모킹
jest.mock("@/lib/supabase/client", () => {
  // 실제 모듈 코드를 가져옵니다
  const actualModule = jest.requireActual("@/lib/supabase/client");

  // 원래 함수들을 유지하되, 싱글톤 변수를 리셋할 수 있게 합니다
  return {
    ...actualModule,
    // 내부 함수나 변수를 추가로 노출시켜 테스트에서 조작할 수 있게 합니다
    __resetBrowserSupabase: () => {
      // 이 코드는 실제로 모듈 내부 변수에 접근하지 않지만,
      // jest.resetModules()와 함께 사용됩니다
    },
  };
});

describe("Supabase 클라이언트 유틸리티", () => {
  // 4. 테스트 전에 환경 설정 및 초기화
  beforeEach(() => {
    // 모든 모킹 함수 초기화
    mockGetUser.mockReset();
    mockGetSession.mockReset();
    mockSignOut.mockReset();

    // 기본 성공 응답으로 모킹 함수 설정
    mockGetUser.mockResolvedValue({
      data: { user: { id: "test-user-id" } },
      error: null,
    });

    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "test-user-id" } } },
      error: null,
    });

    mockSignOut.mockResolvedValue({ error: null });

    // 환경 변수 설정
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-supabase-url.com";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    // localStorage 모킹
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });

    // 테스트 간에 모듈을 새로 로드하기 위한 모듈 캐시 초기화
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createBrowserSupabaseClient 함수", () => {
    it("Supabase 클라이언트를 생성하고 캐싱한다", () => {
      // 모듈을 테스트마다 새로 로드
      const { createBrowserSupabaseClient } = require("@/lib/supabase/client");

      // 첫 번째 호출
      const client1 = createBrowserSupabaseClient();
      expect(client1).toBeDefined();

      // 클라이언트가 auth 객체를 가지고 있는지 확인
      expect(client1.auth).toBeDefined();

      // 두 번째 호출 - 캐싱으로 동일한 인스턴스 반환되어야 함
      const client2 = createBrowserSupabaseClient();
      expect(client2).toBe(client1); // 캐싱으로 동일한 객체 참조가 반환되는지 확인
    });

    it("URL 환경 변수가 없으면 에러를 발생시킨다", () => {
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "";

      const { createBrowserSupabaseClient } = require("@/lib/supabase/client");

      expect(() => {
        createBrowserSupabaseClient();
      }).toThrow("환경 변수 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");

      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    });

    it("API 키 환경 변수가 없으면 에러를 발생시킨다", () => {
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

      const { createBrowserSupabaseClient } = require("@/lib/supabase/client");

      expect(() => {
        createBrowserSupabaseClient();
      }).toThrow(
        "환경 변수 NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.",
      );

      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    });
  });

  describe("getCurrentUser 함수", () => {
    it("인증된 사용자 정보를 반환한다", async () => {
      const mockUser = { id: "test-user-id" };
      mockGetUser.mockResolvedValueOnce({
        data: { user: mockUser },
        error: null,
      });

      const { getCurrentUser } = require("@/lib/supabase/client");
      const user = await getCurrentUser();

      expect(user).toEqual(mockUser);
      expect(mockGetUser).toHaveBeenCalled();
    });

    it("인증된 사용자가 없으면 null을 반환한다", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const { getCurrentUser } = require("@/lib/supabase/client");
      const user = await getCurrentUser();

      expect(user).toBeNull();
    });
  });

  describe("getCurrentSession 함수", () => {
    it("현재 세션 정보를 반환한다", async () => {
      const mockSession = { user: { id: "test-user-id" } };
      mockGetSession.mockResolvedValueOnce({
        data: { session: mockSession },
        error: null,
      });

      const { getCurrentSession } = require("@/lib/supabase/client");
      const session = await getCurrentSession();

      expect(session).toEqual(mockSession);
      expect(mockGetSession).toHaveBeenCalled();
    });

    it("활성 세션이 없으면 null을 반환한다", async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const { getCurrentSession } = require("@/lib/supabase/client");
      const session = await getCurrentSession();

      expect(session).toBeNull();
    });
  });

  describe("signOut 함수", () => {
    it("로그아웃에 성공하면 success: true를 반환한다", async () => {
      mockSignOut.mockResolvedValueOnce({
        error: null,
      });

      const { signOut } = require("@/lib/supabase/client");
      const result = await signOut();

      expect(result).toEqual({ success: true });
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        "auth_session_active",
      );
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        "auth_provider",
      );
    });

    it("로그아웃 중 에러가 발생하면 success: false와 에러를 반환한다", async () => {
      const mockError = new Error("로그아웃 실패");
      mockSignOut.mockResolvedValueOnce({
        error: mockError,
      });

      const { signOut } = require("@/lib/supabase/client");
      const result = await signOut();

      expect(result).toEqual({
        success: false,
        error: mockError,
      });
    });
  });
});
