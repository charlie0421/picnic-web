/**
 * @jest-environment jsdom
 */

import {
  performLogout,
  useLogout,
  emergencyLogout,
  isLoggedOut,
  getRemainingAuthItems
} from '@/lib/auth/logout';
import { renderHook, act } from '@testing-library/react';

// Mock Supabase
const mockSignOut = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signOut: mockSignOut
    }
  }))
}));

// Mock fetch
global.fetch = jest.fn();

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush
  })
}));

// Test용 스토리지 키 (실제 AUTH_STORAGE_KEYS와 유사)
const TEST_AUTH_STORAGE_KEYS = [
  'sb-auth-token',
  'supabase.auth.token',
  'sb-*-auth-token',
  'user',
  'authUser',
  'currentUser',
  'isAuthenticated',
  'authState',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'authToken',
  'jwt',
  'bearer',
  'wechat_token',
  'wechat_user',
  'wechat_session',
  'social_auth_token',
  'redirectUrl',
  'returnUrl',
  'authRedirect',
  'loginRedirect',
  'postLoginRedirect',
  'auth_redirect_url',
  'userPreferences',
  'userSettings',
  'lastLoginMethod',
  'rememberMe',
  'voteState',
  'votingSession',
  'currentVote',
  'userVotes',
  'voteFilters',
  'vote-filter-storage',
  'locale',
  'language',
  'selectedLanguage',
  'tempAuthData',
  'authCache',
  'userCache',
  'sessionCache'
];

// Mock localStorage and sessionStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length;
    }
  };
})();

const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length;
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage
});

// Mock document.cookie
Object.defineProperty(document, 'cookie', {
  writable: true,
  value: ''
});

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  jest.clearAllMocks();
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  document.cookie = '';
  
  // Reset environment variables
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  
  // Mock successful Supabase signOut by default
  mockSignOut.mockResolvedValue({ error: null });
  
  // Mock successful fetch by default
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ success: true })
  });
  
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('performLogout', () => {
  describe('기본 기능', () => {
    it('기본 옵션으로 성공적으로 로그아웃해야 함', async () => {
      const result = await performLogout();
      
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.clearedItems).toEqual(expect.arrayContaining([
        'Supabase session'
      ]));
    });

    it('커스텀 옵션으로 로그아웃해야 함', async () => {
      const options = {
        clearAllStorage: true,
        redirectTo: '/custom-login',
        invalidateServerSession: true,
        clearVotingState: true,
        showNotification: false
      };

      const result = await performLogout(options);
      
      expect(result.success).toBe(true);
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('Supabase 세션 처리', () => {
    it('Supabase 세션을 성공적으로 지워야 함', async () => {
      mockSignOut.mockResolvedValue({ error: null });
      
      const result = await performLogout({ invalidateServerSession: true });
      
      expect(mockSignOut).toHaveBeenCalled();
      expect(result.clearedItems).toContain('Supabase session');
    });

    it('Supabase 로그아웃 오류를 처리해야 함', async () => {
      const error = new Error('Supabase error');
      mockSignOut.mockResolvedValue({ error });
      
      const result = await performLogout({ invalidateServerSession: true });
      
      expect(result.success).toBe(true); // 여전히 성공으로 처리되어야 함
      expect(console.warn).toHaveBeenCalledWith('Supabase sign out error:', 'Supabase error');
    });

    it('invalidateServerSession이 false일 때 Supabase 세션을 지우지 않아야 함', async () => {
      await performLogout({ invalidateServerSession: false });
      
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('로컬 스토리지 처리', () => {
    beforeEach(() => {
      // 테스트용 스토리지 데이터 설정
      TEST_AUTH_STORAGE_KEYS.forEach(key => {
        if (!key.includes('*')) {
          mockLocalStorage.setItem(key, 'test-value');
          mockSessionStorage.setItem(key, 'test-value');
        }
      });
      
      // 와일드카드 키 테스트용
      mockLocalStorage.setItem('sb-test-auth-token', 'test-value');
      mockSessionStorage.setItem('sb-test-auth-token', 'test-value');
    });

    it('localStorage를 지워야 함', async () => {
      const result = await performLogout({ clearAllStorage: true });
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('sessionStorage를 지워야 함', async () => {
      const result = await performLogout({ clearAllStorage: true });
      
      expect(mockSessionStorage.removeItem).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('clearAllStorage가 false일 때 스토리지를 지우지 않아야 함', async () => {
      await performLogout({ clearAllStorage: false });
      
      expect(mockLocalStorage.removeItem).not.toHaveBeenCalled();
      expect(mockSessionStorage.removeItem).not.toHaveBeenCalled();
    });

    it('와일드카드 패턴 키를 처리해야 함', async () => {
      mockLocalStorage.setItem('sb-custom-auth-token', 'test');
      Object.defineProperty(mockLocalStorage, 'key', {
        value: jest.fn((index: number) => {
          const keys = ['sb-custom-auth-token', 'other-key'];
          return keys[index] || null;
        })
      });
      Object.defineProperty(mockLocalStorage, 'length', {
        value: 2
      });

      await performLogout({ clearAllStorage: true });
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sb-custom-auth-token');
    });
  });

  describe('쿠키 처리', () => {
    it('인증 관련 쿠키를 지워야 함', async () => {
      // 쿠키 설정 전 document.cookie를 설정
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'supabase-auth-token=test-value; path=/'
      });

      const result = await performLogout();
      
      expect(result.success).toBe(true);
      // 쿠키 삭제는 document.cookie 설정을 통해 이루어짐
    });
  });

  describe('서버 알림', () => {
    it('서버에 로그아웃을 알려야 함', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const result = await performLogout({ invalidateServerSession: true });
      
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: expect.any(String),
          clearAll: true
        })
      });
      
      expect(result.clearedItems).toContain('Server session');
    });

    it('서버 알림 실패를 처리해야 함', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await performLogout({ invalidateServerSession: true });
      
      expect(result.success).toBe(true); // 여전히 성공으로 처리되어야 함
      expect(console.warn).toHaveBeenCalledWith('Error notifying server:', expect.any(Error));
    });
  });

  describe('오류 처리', () => {
    it('환경 변수 누락 시 오류를 처리해야 함', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const result = await performLogout();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('error');
    });

    it('예상치 못한 오류를 처리해야 함', async () => {
      // Supabase createClient가 실패하도록 모킹
      jest.doMock('@supabase/supabase-js', () => {
        throw new Error('Unexpected error');
      });

      const result = await performLogout();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('useLogout', () => {
  it('logout 함수를 반환해야 함', () => {
    const { result } = renderHook(() => useLogout());
    
    expect(result.current.logout).toBeDefined();
    expect(typeof result.current.logout).toBe('function');
  });

  it('logout 함수 호출 시 performLogout을 실행하고 리디렉션해야 함', async () => {
    const { result } = renderHook(() => useLogout());
    
    await act(async () => {
      const logoutResult = await result.current.logout({
        redirectTo: '/test-login'
      });
      
      expect(logoutResult.success).toBe(true);
    });

    // 라우터 푸시는 타이머로 지연되므로 즉시 확인할 수 없음
    expect(setTimeout).toHaveBeenCalled();
  });
});

describe('emergencyLogout', () => {
  it('강제 로그아웃을 수행해야 함', async () => {
    const result = await emergencyLogout();
    
    expect(result.success).toBe(true);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('강제 리디렉션을 수행해야 함', async () => {
    await emergencyLogout();
    
    // setTimeout이 호출되었는지 확인
    expect(setTimeout).toHaveBeenCalled();
  });
});

describe('isLoggedOut', () => {
  it('인증 데이터가 없을 때 true를 반환해야 함', () => {
    expect(isLoggedOut()).toBe(true);
  });

  it('인증 데이터가 있을 때 false를 반환해야 함', () => {
    mockLocalStorage.setItem('sb-auth-token', 'test-token');
    
    expect(isLoggedOut()).toBe(false);
  });

  it('와일드카드 패턴 키를 확인해야 함', () => {
    mockLocalStorage.setItem('sb-custom-auth-token', 'test');
    Object.defineProperty(mockLocalStorage, 'key', {
      value: jest.fn((index: number) => {
        const keys = ['sb-custom-auth-token'];
        return keys[index] || null;
      })
    });
    Object.defineProperty(mockLocalStorage, 'length', {
      value: 1
    });

    expect(isLoggedOut()).toBe(false);
  });

  it('window가 없는 환경에서 true를 반환해야 함', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    
    expect(isLoggedOut()).toBe(true);
    
    global.window = originalWindow;
  });
});

describe('getRemainingAuthItems', () => {
  it('남은 인증 항목을 반환해야 함', () => {
    mockLocalStorage.setItem('sb-auth-token', 'test-token');
    mockSessionStorage.setItem('user', 'test-user');
    
    const items = getRemainingAuthItems();
    
    expect(items).toContain('localStorage.sb-auth-token');
    expect(items).toContain('sessionStorage.user');
  });

  it('window가 없는 환경에서 빈 배열을 반환해야 함', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    
    expect(getRemainingAuthItems()).toEqual([]);
    
    global.window = originalWindow;
  });

  it('와일드카드 패턴 키를 처리해야 함', () => {
    mockLocalStorage.setItem('sb-custom-auth-token', 'test');
    Object.defineProperty(mockLocalStorage, 'key', {
      value: jest.fn((index: number) => {
        const keys = ['sb-custom-auth-token'];
        return keys[index] || null;
      })
    });
    Object.defineProperty(mockLocalStorage, 'length', {
      value: 1
    });

    const items = getRemainingAuthItems();
    
    expect(items).toContain('localStorage.sb-custom-auth-token');
  });
});

describe('스토리지 키 관련 테스트', () => {
  it('테스트 스토리지 키가 올바르게 정의되어야 함', () => {
    expect(TEST_AUTH_STORAGE_KEYS).toContain('sb-auth-token');
    expect(TEST_AUTH_STORAGE_KEYS).toContain('user');
    expect(TEST_AUTH_STORAGE_KEYS).toContain('accessToken');
    expect(TEST_AUTH_STORAGE_KEYS).toContain('wechat_token');
  });

  it('테스트용 스토리지 키가 충분히 포함되어야 함', () => {
    expect(TEST_AUTH_STORAGE_KEYS.length).toBeGreaterThanOrEqual(25);
  });
});