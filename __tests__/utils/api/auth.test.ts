/**
 * Auth API 유틸리티 테스트
 */

import { 
  isUserLoggedIn, 
  getUserProfile, 
  getStorageUrl, 
  getCdnUrl, 
  uploadFile,
  supabase 
} from '../../../utils/api/auth';

// Supabase 클라이언트 모킹
jest.mock('../../../utils/supabase-client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('Auth API Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // console.error 모킹
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // 환경 변수 설정
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isUserLoggedIn', () => {
    it('returns true when user has active session', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' },
            access_token: 'token-123',
          },
        },
        error: null,
      } as any);

      const result = await isUserLoggedIn();
      expect(result).toBe(true);
      expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1);
    });

    it('returns false when user has no session', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      } as any);

      const result = await isUserLoggedIn();
      expect(result).toBe(false);
      expect(mockSupabase.auth.getSession).toHaveBeenCalledTimes(1);
    });

    it('returns false when session is undefined', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: undefined },
        error: null,
      } as any);

      const result = await isUserLoggedIn();
      expect(result).toBe(false);
    });

    it('handles auth errors gracefully', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Auth error' },
      } as any);

      const result = await isUserLoggedIn();
      expect(result).toBe(false);
    });
  });

  describe('getUserProfile', () => {
    const mockFrom = jest.fn();
    const mockSelect = jest.fn();
    const mockEq = jest.fn();
    const mockSingle = jest.fn();

    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      } as any);
      mockSelect.mockReturnValue({
        eq: mockEq,
      } as any);
      mockEq.mockReturnValue({
        single: mockSingle,
      } as any);
    });

    it('returns user profile data successfully', async () => {
      const mockProfile = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      mockSingle.mockResolvedValue({
        data: mockProfile,
        error: null,
      });

      const result = await getUserProfile('user-123');
      
      expect(result).toEqual(mockProfile);
      expect(mockSupabase.from).toHaveBeenCalledWith('user_profiles');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123');
      expect(mockSingle).toHaveBeenCalledTimes(1);
    });

    it('throws error when profile not found', async () => {
      const mockError = { message: 'Profile not found' };
      mockSingle.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(getUserProfile('nonexistent-user')).rejects.toEqual(mockError);
    });

    it('throws error when database query fails', async () => {
      const mockError = { message: 'Database connection failed' };
      mockSingle.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(getUserProfile('user-123')).rejects.toEqual(mockError);
    });
  });

  describe('getStorageUrl', () => {
    const mockStorageFrom = jest.fn();
    const mockGetPublicUrl = jest.fn();

    beforeEach(() => {
      mockSupabase.storage.from.mockReturnValue({
        getPublicUrl: mockGetPublicUrl,
      } as any);
    });

    it('returns public URL for storage file', () => {
      const mockUrl = 'https://storage.example.com/bucket/path/file.jpg';
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: mockUrl },
      });

      const result = getStorageUrl('avatars', 'user/profile.jpg');
      
      expect(result).toBe(mockUrl);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('avatars');
      expect(mockGetPublicUrl).toHaveBeenCalledWith('user/profile.jpg');
    });

    it('handles different bucket and path combinations', () => {
      const mockUrl = 'https://storage.example.com/images/banner.png';
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: mockUrl },
      });

      const result = getStorageUrl('images', 'banners/banner.png');
      
      expect(result).toBe(mockUrl);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
      expect(mockGetPublicUrl).toHaveBeenCalledWith('banners/banner.png');
    });
  });

  describe('getCdnUrl', () => {
    it('returns CDN URL with path', () => {
      const result = getCdnUrl('/images/logo.png');
      expect(result).toBe('https://cdn.example.com/images/logo.png');
    });

    it('handles path without leading slash', () => {
      const result = getCdnUrl('images/logo.png');
      expect(result).toBe('https://cdn.example.comimages/logo.png');
    });

    it('handles empty path', () => {
      const result = getCdnUrl('');
      expect(result).toBe('https://cdn.example.com');
    });

    it('handles undefined CDN URL environment variable', () => {
      delete process.env.NEXT_PUBLIC_CDN_URL;
      const result = getCdnUrl('/images/logo.png');
      expect(result).toBe('undefined/images/logo.png');
    });
  });

  describe('uploadFile', () => {
    const mockStorageFrom = jest.fn();
    const mockUpload = jest.fn();

    beforeEach(() => {
      mockSupabase.storage.from.mockReturnValue({
        upload: mockUpload,
      } as any);
    });

    it('uploads file successfully', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const mockUploadData = {
        path: 'uploads/test.txt',
        id: 'file-123',
        fullPath: 'bucket/uploads/test.txt',
      };

      mockUpload.mockResolvedValue({
        data: mockUploadData,
        error: null,
      });

      const result = await uploadFile('uploads', 'test.txt', mockFile);
      
      expect(result).toEqual(mockUploadData);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('uploads');
      expect(mockUpload).toHaveBeenCalledWith('test.txt', mockFile);
    });

    it('throws error when upload fails', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const mockError = { message: 'Upload failed' };

      mockUpload.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(uploadFile('uploads', 'test.txt', mockFile)).rejects.toEqual(mockError);
    });

    it('handles different file types', async () => {
      const mockImageFile = new File(['image data'], 'image.jpg', { type: 'image/jpeg' });
      const mockUploadData = {
        path: 'images/image.jpg',
        id: 'image-123',
      };

      mockUpload.mockResolvedValue({
        data: mockUploadData,
        error: null,
      });

      const result = await uploadFile('images', 'profile/image.jpg', mockImageFile);
      
      expect(result).toEqual(mockUploadData);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('images');
      expect(mockUpload).toHaveBeenCalledWith('profile/image.jpg', mockImageFile);
    });

    it('handles storage quota exceeded error', async () => {
      const mockFile = new File(['large content'], 'large.txt', { type: 'text/plain' });
      const mockError = { message: 'Storage quota exceeded' };

      mockUpload.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(uploadFile('uploads', 'large.txt', mockFile)).rejects.toEqual(mockError);
    });
  });

  describe('supabase export', () => {
    it('exports supabase client', () => {
      expect(supabase).toBeDefined();
      expect(supabase.auth).toBeDefined();
      expect(supabase.from).toBeDefined();
      expect(supabase.storage).toBeDefined();
    });
  });
});
