// Jest DOM 확장을 가져와 테스트에서 DOM 어설션을 사용할 수 있게 합니다
import '@testing-library/jest-dom';

// Web API 모킹 (Node.js 환경에서 브라우저 API 사용을 위해)
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Request, Response, Headers 모킹
global.Request = class Request {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = init.method || 'GET';
    this.headers = new Headers(init.headers);
    this.body = init.body;
    this._bodyInit = init.body;
  }

  async json() {
    if (this._bodyInit) {
      return JSON.parse(this._bodyInit);
    }
    return {};
  }

  async text() {
    return this._bodyInit || '';
  }
};

global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.statusText = init.statusText || 'OK';
    this.headers = new Headers(init.headers);
    this.ok = this.status >= 200 && this.status < 300;
  }

  async json() {
    return JSON.parse(this.body);
  }

  async text() {
    return this.body;
  }
};

global.Headers = class Headers {
  constructor(init = {}) {
    this._headers = {};
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this._headers[key.toLowerCase()] = value;
      });
    }
  }

  get(name) {
    return this._headers[name.toLowerCase()];
  }

  set(name, value) {
    this._headers[name.toLowerCase()] = value;
  }

  has(name) {
    return name.toLowerCase() in this._headers;
  }
};

// URL 모킹 (Node.js에는 이미 있지만 확실히 하기 위해)
if (!global.URL) {
  global.URL = URL;
}

// Next.js 내장 함수와 컴포넌트 모킹
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
    query: {},
  })),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
  useParams: jest.fn(() => ({})),
}));

// NextResponse 모킹
jest.mock('next/server', () => ({
  NextRequest: class NextRequest {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.headers = new Headers(init.headers);
      this.body = init.body;
      this._bodyInit = init.body;
    }

    async json() {
      if (this._bodyInit) {
        return JSON.parse(this._bodyInit);
      }
      return {};
    }

    async text() {
      return this._bodyInit || '';
    }
  },
  NextResponse: {
    json: jest.fn((data, init = {}) => {
      const response = new Response(JSON.stringify(data), {
        status: init.status || 200,
        statusText: init.statusText || 'OK',
        headers: {
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      response.json = jest.fn().mockResolvedValue(data);
      return response;
    }),
    redirect: jest.fn((url, status = 302) => {
      return new Response(null, {
        status,
        headers: { Location: url },
      });
    }),
  },
}));

// Supabase SSR 모킹 (@supabase/ssr)
jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => ({ data: { user: null }, error: null })),
      getSession: jest.fn(() => ({ data: { session: null }, error: null })),
      signInWithOAuth: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
    })),
  })),
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn(() => ({ data: { user: null }, error: null })),
      getSession: jest.fn(() => ({ data: { session: null }, error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
    })),
  })),
}));

// Supabase 클라이언트 모킹
jest.mock('@/lib/supabase/client', () => {
  const mockClient = {
    auth: {
      getUser: jest.fn(() => ({ data: { user: null }, error: null })),
      getSession: jest.fn(() => ({ data: { session: null }, error: null })),
      signInWithOAuth: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
    })),
  };

  return {
    createBrowserSupabaseClient: jest.fn(() => mockClient),
    getCurrentUser: jest.fn(() => Promise.resolve(null)),
    getCurrentSession: jest.fn(() => Promise.resolve(null)),
    signOut: jest.fn(),
  };
});

// Supabase 서버 모킹
jest.mock('@/lib/supabase/server', () => {
  const mockServerClient = {
    auth: {
      getUser: jest.fn(() => ({ data: { user: null }, error: null })),
      getSession: jest.fn(() => ({ data: { session: null }, error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          data: [],
          error: null,
        })),
      })),
    })),
  };

  return {
    createServerSupabaseClient: jest.fn(() => mockServerClient),
    getServerUser: jest.fn(() => Promise.resolve(null)),
    getServerSession: jest.fn(() => Promise.resolve(null)),
    withAuth: jest.fn((handler) => handler),
  };
});

// next-intl 모킹
jest.mock('next-intl', () => ({
  useTranslations: jest.fn(() => (key) => key),
  useLocale: jest.fn(() => 'ko'),
}));

// 로컬 스토리지 모킹
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }
}

global.localStorage = new LocalStorageMock();

// 쿠키 모킹
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));
