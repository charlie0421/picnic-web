import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useGoonghapStore, GoonghapResult as StoreGoonghapResult } from '@/stores/goonghapStore';

export type GoonghapStatus = 'pending' | 'completed' | 'failed';

export interface GoonghapListItem {
  id: string;
  artist_id: number;
  score: number | null;
  status: GoonghapStatus;
  is_ads: boolean | null;
  created_at: string;
  artist?: {
    id: number;
    name: any;
    image: string | null;
  } | null;
  i18n: Array<{
    score_title: string | null;
    goonghap_summary: string | null;
    language: string;
  }>;
}

// 로케일을 DB language 코드로 변환
export function localeToDbLanguage(locale: string): string {
  const mapping: Record<string, string> = {
    'ko': 'ko',
    'en': 'en',
    'ja': 'ja',
    'zh-cn': 'zh',
    'zh-tw': 'zh-TW',
    'vi': 'vi',
    'th': 'th',
    'id': 'id',
    'es': 'es',
    'bn': 'bn',
    'my': 'my',
    'tl': 'fil',
  };
  return mapping[locale] || 'en';
}

export function useGoongHapList() {
  const { currentLocale } = useLocaleRouter();
  const { userProfile, isAuthenticated, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GoonghapListItem[]>([]);
  const setListResults = useGoonghapStore((state) => state.setListResults);

  const dbLanguage = useMemo(() => localeToDbLanguage(currentLocale), [currentLocale]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        // 비로그인 시 에러 없이 빈 결과로 처리
        if (!user) {
          setResults([]);
          setLoading(false);
          return;
        }

        // 궁합 결과 가져오기
        const { data, error } = await supabase
          .from('goonghap_results')
          .select(`
            id,
            artist_id,
            score,
            status,
            is_ads,
            created_at,
            goonghap_results_i18n(score_title, goonghap_summary, language)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        if (!mounted) return;

        // 아티스트 ID 목록 추출
        const artistIds = Array.from(new Set((data || []).map((row: any) => row.artist_id).filter(Boolean)));

        // 아티스트 정보 별도 조회
        let artistMap: Record<number, { id: number; name: any; image: string | null }> = {};
        if (artistIds.length > 0) {
          const { data: artists } = await supabase
            .from('artist')
            .select('id, name, image')
            .in('id', artistIds);

          if (artists) {
            artistMap = Object.fromEntries(artists.map((a: any) => [a.id, a]));
          }
        }

        if (!mounted) return;

        const mappedResults = (data || []).map((row: any) => ({
          id: row.id,
          artist_id: row.artist_id,
          score: row.score,
          status: row.status,
          is_ads: row.is_ads,
          created_at: row.created_at,
          artist: artistMap[row.artist_id] || null,
          i18n: row.goonghap_results_i18n || [],
        }));

        setResults(mappedResults);

        // 스토어에 캐싱 (상세 페이지에서 즉시 사용)
        const storeResults: StoreGoonghapResult[] = mappedResults.map((r: GoonghapListItem) => ({
          id: r.id,
          artist_id: r.artist_id,
          score: r.score,
          status: r.status as StoreGoonghapResult['status'],
          is_paid: false, // 목록에서는 알 수 없음, 상세에서 업데이트
          is_ads: r.is_ads ?? false,
          created_at: r.created_at,
          artist_name: r.artist?.name,
          artist_image: r.artist?.image,
          artist: r.artist,
          goonghap_results_i18n: r.i18n.map((i) => ({
            ...i,
            details: null,
            tips: null,
          })),
        }));
        setListResults(storeResults);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 현재 로케일에 맞는 i18n 데이터 가져오기
  const getLocalizedI18n = (i18nList: GoonghapListItem['i18n']) => {
    // 현재 로케일 우선
    let result = i18nList.find(item => item.language === dbLanguage);
    // 없으면 영어
    if (!result) result = i18nList.find(item => item.language === 'en');
    // 그것도 없으면 첫 번째
    if (!result) result = i18nList[0];
    return result;
  };

  // 아티스트 이름 가져오기 (로케일 적용)
  const getArtistName = (artist: GoonghapListItem['artist']) => {
    if (!artist?.name) return 'Unknown';
    if (typeof artist.name === 'string') return artist.name;
    // name이 객체인 경우 (다국어)
    return artist.name[currentLocale] || artist.name['en'] || artist.name['ko'] || Object.values(artist.name)[0] || 'Unknown';
  };

  const hasResults = useMemo(() => (results?.length || 0) > 0, [results]);

  return {
    loading,
    error,
    results,
    hasResults,
    getLocalizedI18n,
    getArtistName,
    dbLanguage,
    userProfile,
    isAuthenticated,
    authLoading,
    currentLocale,
  };
}
