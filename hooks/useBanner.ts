'use client';

import { useState, useEffect, useCallback } from 'react';
import { Banner } from '@/types/interfaces';
import { getBanners } from '@/utils/api/queries';

interface UseBannerReturn {
  banners: Banner[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * 배너 데이터를 관리하는 단순화된 훅
 */
export function useBanner(): UseBannerReturn {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBanners = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await getBanners();
      setBanners(data);
    } catch (err) {
      console.error('배너 데이터 로드 오류:', err);
      setError('배너를 불러오는 중 오류가 발생했습니다.');
      setBanners([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  return {
    banners,
    isLoading,
    error,
    refetch: fetchBanners,
  };
} 