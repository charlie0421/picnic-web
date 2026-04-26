import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotificationInboxService,
  getLocalizedText,
} from '@/lib/data-fetching/client/notification-service';

// Mock Supabase client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  }),
}));

// Helper to set up chain mocks
function setupChain(data: any, error: any = null, count: number | null = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({ data, error, count }),
    update: vi.fn().mockReturnThis(),
  };
  return chain;
}

describe('getLocalizedText', () => {
  it('returns text for current language', () => {
    expect(getLocalizedText({ ko: '한국어', en: 'English' }, 'ko')).toBe('한국어');
  });

  it('returns text for en language', () => {
    expect(getLocalizedText({ ko: '한국어', en: 'English' }, 'en')).toBe('English');
  });

  it('falls back to ko when current language is missing', () => {
    expect(getLocalizedText({ ko: '한국어', en: 'English' }, 'ja')).toBe('한국어');
  });

  it('falls back to en when ko is also missing', () => {
    expect(getLocalizedText({ en: 'English' } as any, 'ja')).toBe('English');
  });

  it('falls back to first value when ko and en are missing', () => {
    expect(getLocalizedText({ ja: '日本語' } as any, 'zh')).toBe('日本語');
  });

  it('returns empty string for empty object', () => {
    expect(getLocalizedText({}, 'ko')).toBe('');
  });

  it('defaults to ko when no currentLang provided', () => {
    expect(getLocalizedText({ ko: '기본', en: 'Default' })).toBe('기본');
  });
});

// normalizeMultilangField is tested indirectly through fetchNotifications transform tests above and below.

describe('NotificationInboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('fetchNotifications', () => {
    it('returns empty array when user is not logged in and broadcast query fails', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const broadcastChain = setupChain(null, { message: 'error' });
      mockFrom.mockReturnValue(broadcastChain);

      const result = await NotificationInboxService.fetchNotifications();
      expect(result).toEqual([]);
    });

    it('fetches and merges user and broadcast notifications', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: { id: 'user-1' },
        },
      });

      const userRows = [
        {
          id: 1,
          user_id: 'user-1',
          title: { ko: 'User Title', en: 'User Title' },
          body: { ko: 'User Body', en: 'User Body' },
          data: null,
          action_url: '/test',
          type: 'info',
          is_read: false,
          created_at: '2024-01-02T00:00:00Z',
          read_at: null,
        },
      ];

      const broadcastRows = [
        {
          id: 2,
          title: { ko: 'Broadcast Title', en: 'Broadcast Title' },
          body: { ko: 'Broadcast Body', en: 'Broadcast Body' },
          data: null,
          action_url: '/broadcast',
          type: 'announcement',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      // First call: user_notifications, Second call: broadcast_notifications
      const userChain = setupChain(userRows);
      const broadcastChain = setupChain(broadcastRows);

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        if (table === 'broadcast_notifications') return broadcastChain;
        return userChain;
      });

      const result = await NotificationInboxService.fetchNotifications();

      expect(result.length).toBe(2);
      // Should be sorted by created_at desc (user notification is newer)
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('applies pagination with from and limit', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const rows = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        user_id: 'user-1',
        title: `Title ${i}`,
        body: `Body ${i}`,
        data: null,
        action_url: null,
        type: 'default',
        is_read: false,
        created_at: `2024-01-0${5 - i}T00:00:00Z`,
        read_at: null,
      }));

      const userChain = setupChain(rows);
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications({ from: 1, limit: 2 });
      expect(result.length).toBe(2);
    });

    it('handles user notification query error gracefully', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userChain = setupChain(null, { message: 'DB error' });
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      expect(result).toEqual([]);
    });

    it('handles broadcast notification query error gracefully', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userChain = setupChain([]);
      const broadcastChain = setupChain(null, { message: 'DB error' });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      expect(result).toEqual([]);
    });

    it('handles exception during fetch gracefully', async () => {
      mockGetUser.mockRejectedValue(new Error('Auth error'));

      const result = await NotificationInboxService.fetchNotifications();
      expect(result).toEqual([]);
    });

    it('handles string title (normalizeMultilangField converts to object)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userRows = [
        {
          id: 1,
          user_id: 'user-1',
          title: 'Simple string title',
          body: 'Simple string body',
          data: { custom: 'data' },
          action_url: '/test',
          type: null,
          is_read: true,
          created_at: '2024-01-01T00:00:00Z',
          read_at: '2024-01-02T00:00:00Z',
        },
      ];

      const userChain = setupChain(userRows);
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      expect(result[0].title).toEqual({ ko: 'Simple string title', en: 'Simple string title' });
      expect(result[0].type).toBe('default'); // null type falls back to 'default'
      expect(result[0].data).toEqual({ custom: 'data' });
    });

    it('handles JSON string title', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userRows = [
        {
          id: 1,
          user_id: 'user-1',
          title: '{"ko": "JSON 제목", "en": "JSON Title"}',
          body: null,
          data: null,
          action_url: null,
          type: 'default',
          is_read: false,
          created_at: '2024-01-01T00:00:00Z',
          read_at: null,
        },
      ];

      const userChain = setupChain(userRows);
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      expect(result[0].title).toEqual({ ko: 'JSON 제목', en: 'JSON Title' });
    });

    it('handles null title and body (normalizeMultilangField returns defaults)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const broadcastRows = [
        {
          id: 1,
          title: null,
          body: null,
          data: null,
          action_url: null,
          type: null,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const broadcastChain = setupChain(broadcastRows);
      mockFrom.mockReturnValue(broadcastChain);

      const result = await NotificationInboxService.fetchNotifications();
      expect(result[0].title).toEqual({ ko: '', en: '' });
      expect(result[0].body).toEqual({ ko: '', en: '' });
    });

    it('sorts by created_at desc and uses id as tiebreaker', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userRows = [
        {
          id: 1,
          user_id: 'user-1',
          title: 'A',
          body: 'A',
          data: null,
          action_url: null,
          type: 'default',
          is_read: false,
          created_at: '2024-01-01T00:00:00Z',
          read_at: null,
        },
        {
          id: 3,
          user_id: 'user-1',
          title: 'C',
          body: 'C',
          data: null,
          action_url: null,
          type: 'default',
          is_read: false,
          created_at: '2024-01-01T00:00:00Z',
          read_at: null,
        },
      ];

      const userChain = setupChain(userRows);
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      // Same created_at, higher id first
      expect(result[0].id).toBe(3);
      expect(result[1].id).toBe(1);
    });

    it('handles user_notifications query throwing an exception', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('Query error')),
      };
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      expect(result).toEqual([]);
    });

    it('handles broadcast query throwing an exception', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const broadcastChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('Broadcast query error')),
      };

      mockFrom.mockReturnValue(broadcastChain);

      const result = await NotificationInboxService.fetchNotifications();
      expect(result).toEqual([]);
    });

    it('handles invalid JSON string in title field', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const userRows = [
        {
          id: 1,
          user_id: 'user-1',
          title: '{invalid json',
          body: '[also invalid',
          data: null,
          action_url: null,
          type: 'default',
          is_read: false,
          created_at: '2024-01-01T00:00:00Z',
          read_at: null,
        },
      ];

      const userChain = setupChain(userRows);
      const broadcastChain = setupChain([]);

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_notifications') return userChain;
        return broadcastChain;
      });

      const result = await NotificationInboxService.fetchNotifications();
      // Invalid JSON should fall back to treating it as a plain string
      expect(result[0].title).toEqual({ ko: '{invalid json', en: '{invalid json' });
    });
  });

  describe('markAsRead', () => {
    it('marks notification as read successfully', async () => {
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ error: null }),
      };

      mockFrom.mockReturnValue(updateChain);

      const result = await NotificationInboxService.markAsRead(1);
      expect(result).toBe(true);
    });

    it('returns false when update fails with error', async () => {
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ error: { message: 'Update failed' } }),
      };

      mockFrom.mockReturnValue(updateChain);

      const result = await NotificationInboxService.markAsRead(1);
      expect(result).toBe(false);
    });

    it('returns false when exception occurs', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Connection error');
      });

      const result = await NotificationInboxService.markAsRead(1);
      expect(result).toBe(false);
    });
  });

  describe('getUnreadCount', () => {
    it('returns 0 when user is not logged in', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      const result = await NotificationInboxService.getUnreadCount();
      expect(result).toBe(0);
    });

    it('returns count of unread notifications', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          count: 5,
          error: null,
        }),
      };

      // Need to handle chained eq calls
      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return { count: 5, error: null };
        }
        return chain;
      });

      mockFrom.mockReturnValue(chain);

      const result = await NotificationInboxService.getUnreadCount();
      expect(result).toBe(5);
    });

    it('returns 0 when count query fails', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({
          count: null,
          error: { message: 'Count error' },
        }),
      };

      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return { count: null, error: { message: 'Count error' } };
        }
        return chain;
      });

      mockFrom.mockReturnValue(chain);

      const result = await NotificationInboxService.getUnreadCount();
      expect(result).toBe(0);
    });

    it('returns 0 on exception', async () => {
      mockGetUser.mockRejectedValue(new Error('Auth error'));

      const result = await NotificationInboxService.getUnreadCount();
      expect(result).toBe(0);
    });

    it('returns 0 when count is null (no unread)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ count: null, error: null }),
      };

      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return { count: null, error: null };
        }
        return chain;
      });

      mockFrom.mockReturnValue(chain);

      const result = await NotificationInboxService.getUnreadCount();
      expect(result).toBe(0);
    });
  });
});
