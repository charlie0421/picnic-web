'use client';

import React from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import NavigationLink from '@/components/client/NavigationLink';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import GoongHapIntroPopup from './GoongHapIntroPopup';
import { ProfileImageContainer } from '@/components/ui/ProfileImageContainer';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

type CompatibilityStatus = 'pending' | 'completed' | 'failed';

interface CompatibilityResult {
  id: string;
  artist_id: number;
  score: number | null;
  status: CompatibilityStatus;
  created_at: string;
  artist?: {
    id: number;
    name: any;
    image: string | null;
  } | null;
  i18n: Array<{
    score_title: string | null;
    compatibility_summary: string | null;
    language: string;
  }>;
}

// 로케일을 DB language 코드로 변환
function localeToDbLanguage(locale: string): string {
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

export default function GoongHapPage() {
  const { tDynamic: t } = useTranslations();
  const { getLocalizedPath, currentLocale } = useLocaleRouter();
  const { userProfile, isInitialized } = useAuth();
  const isAdmin = userProfile?.is_admin === true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showIntroPopup, setShowIntroPopup] = useState(false);
  const [results, setResults] = useState<CompatibilityResult[]>([]);

  const dbLanguage = useMemo(() => localeToDbLanguage(currentLocale), [currentLocale]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          setResults([]);
          setLoading(false);
          return;
        }

        // 궁합 결과 가져오기
        const { data, error } = await supabase
          .from('compatibility_results')
          .select(`
            id,
            artist_id,
            score,
            status,
            created_at,
            compatibility_results_i18n(score_title, compatibility_summary, language)
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

        setResults(
          (data || []).map((row: any) => ({
            id: row.id,
            artist_id: row.artist_id,
            score: row.score,
            status: row.status,
            created_at: row.created_at,
            artist: artistMap[row.artist_id] || null,
            i18n: row.compatibility_results_i18n || [],
          }))
        );
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 현재 로케일에 맞는 i18n 데이터 가져오기
  const getLocalizedI18n = (i18nList: CompatibilityResult['i18n']) => {
    // 현재 로케일 우선
    let result = i18nList.find(item => item.language === dbLanguage);
    // 없으면 영어
    if (!result) result = i18nList.find(item => item.language === 'en');
    // 그것도 없으면 첫 번째
    if (!result) result = i18nList[0];
    return result;
  };

  // 아티스트 이름 가져오기 (로케일 적용)
  const getArtistName = (artist: CompatibilityResult['artist']) => {
    if (!artist?.name) return 'Unknown';
    if (typeof artist.name === 'string') return artist.name;
    // name이 객체인 경우 (다국어)
    return artist.name[currentLocale] || artist.name['en'] || artist.name['ko'] || Object.values(artist.name)[0] || 'Unknown';
  };

  const hasResults = useMemo(() => (results?.length || 0) > 0, [results]);

  // 관리자 전용 체크 (클라이언트에서만)
  const showAdminOnlyMessage = isInitialized && !isAdmin;

  return (
    <>
      {/* 궁합 소개 팝업 */}
      <GoongHapIntroPopup
        isOpen={showIntroPopup}
        onClose={() => setShowIntroPopup(false)}
      />

      <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
        <div className='px-4 py-6 sm:py-10'>
          <div className='max-w-2xl mx-auto'>
            {/* 관리자 전용 메시지 */}
            {showAdminOnlyMessage && (
              <div className='rounded-xl border border-amber-200 p-6 bg-amber-50 text-amber-800 mb-6'>
                관리자 전용 메뉴입니다.
              </div>
            )}

            {/* 메인 컨텐츠 (관리자만) */}
            {!showAdminOnlyMessage && (
              <>
            {/* 헤더 영역 */}
            <div className='mb-8'>
              {/* 제목: 한글 → 중국어 → 영어 순서 */}
              <div className='flex items-center gap-4 mb-4'>
                <h1 className='text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                  궁합
                </h1>
                <div className='flex flex-col'>
                  <span className='text-xl font-bold text-gray-600'>宮合</span>
                  <span className='text-sm text-gray-400'>Goong-Hap</span>
                </div>
              </div>

              {/* 버튼 영역 */}
              <div className='flex flex-wrap items-center gap-3'>
                {/* 궁합이란? 버튼 */}
                <button
                  type='button'
                  onClick={() => setShowIntroPopup(true)}
                  className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-600 rounded-full border border-purple-200/50 hover:from-purple-500/20 hover:to-pink-500/20 hover:border-purple-300 transition-all duration-200 hover:shadow-sm'
                >
                  <span className='text-sm'>✨</span>
                  {t('goongHap.whatIsGoongHap', '궁합이란?')}
                </button>

                {/* 신규 궁합 버튼 */}
                <NavigationLink
                  href={getLocalizedPath('/goong-hap/new')}
                  className='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg'
                >
                  <span>✚</span>
                  {t('compatibility_new_compatibility', '새 궁합 계산')}
                </NavigationLink>
              </div>
            </div>

            {/* 로딩 상태 */}
            {loading && (
              <div className='flex justify-center py-12'>
                <div className='animate-spin rounded-full h-10 w-10 border-4 border-purple-200 border-t-purple-500'></div>
              </div>
            )}

            {/* 에러 상태 */}
            {(!loading && error) && (
              <div className='rounded-2xl border border-red-200 p-6 bg-red-50 shadow-sm text-red-700'>
                {t('compatibility_snackbar_error', '오류가 발생했습니다.')}
              </div>
            )}

            {/* 결과 목록 */}
            {!loading && !error && hasResults && (
              <div className='flex flex-col gap-4'>
                {results.map((r) => {
                  const localizedI18n = getLocalizedI18n(r.i18n);
                  const artistName = getArtistName(r.artist);
                  const scoreTitle = localizedI18n?.score_title;
                  const summary = localizedI18n?.compatibility_summary;

                  return (
                    <NavigationLink
                      key={r.id}
                      href={getLocalizedPath(`/goong-hap/${r.id}`)}
                      className='block w-full rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group'
                    >
                      {/* 상단: 점수 배경 */}
                      <div className='relative bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-4'>
                        <div className='flex items-center justify-between'>
                          {/* 이미지들: 아티스트(왼쪽) - 하트 - 사용자(오른쪽) */}
                          <div className='flex items-center -space-x-3'>
                            {/* 아티스트 이미지 (왼쪽) */}
                            <div className='relative z-10 ring-2 ring-white rounded-full overflow-hidden w-12 h-12'>
                              {r.artist?.image ? (
                                <OptimizedImage
                                  src={r.artist.image}
                                  alt={artistName}
                                  width={48}
                                  height={48}
                                  className='w-full h-full object-cover'
                                />
                              ) : (
                                <div className='w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium'>
                                  {artistName.charAt(0)}
                                </div>
                              )}
                            </div>
                            {/* 하트 아이콘 */}
                            <div className='relative z-20 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md'>
                              <span className='text-pink-500 text-sm'>💕</span>
                            </div>
                            {/* 사용자 이미지 (오른쪽) */}
                            <div className='relative z-10 ring-2 ring-white rounded-full'>
                              <ProfileImageContainer
                                avatarUrl={userProfile?.avatar_url || null}
                                width={48}
                                height={48}
                                borderRadius={24}
                              />
                            </div>
                          </div>

                          {/* 점수 */}
                          <div className='text-right'>
                            <p className='text-white/80 text-xs font-medium'>
                              {t('compatibility_score', '궁합 점수')}
                            </p>
                            <p className='text-white text-3xl font-extrabold'>
                              {r.score ?? '-'}
                              <span className='text-lg ml-0.5'>%</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 하단: 정보 */}
                      <div className='px-5 py-4'>
                        <div className='flex items-start justify-between gap-4'>
                          <div className='flex-1 min-w-0'>
                            {/* 아티스트 이름 */}
                            <p className='text-gray-500 text-xs mb-1'>
                              with <span className='font-medium text-gray-700'>{artistName}</span>
                            </p>
                            {/* 점수 제목 */}
                            <h3 className='text-gray-900 font-bold text-lg truncate group-hover:text-purple-600 transition-colors'>
                              {scoreTitle || t('compatibility_share_hashtag', 'Goong-Hap')}
                            </h3>
                            {/* 요약 */}
                            {summary && (
                              <p className='text-gray-600 text-sm mt-1 line-clamp-2'>
                                {summary}
                              </p>
                            )}
                          </div>
                          {/* 화살표 */}
                          <div className='flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-purple-100 transition-colors'>
                            <span className='text-gray-400 group-hover:text-purple-500 transition-colors'>→</span>
                          </div>
                        </div>
                        {/* 날짜 */}
                        <p className='text-gray-400 text-xs mt-3'>
                          {new Date(r.created_at).toLocaleDateString(currentLocale, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </NavigationLink>
                  );
                })}
              </div>
            )}

            {/* 빈 상태 */}
            {!loading && !error && !hasResults && (
              <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg p-8 text-center'>
                <div className='w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center'>
                  <span className='text-4xl'>💫</span>
                </div>
                <h3 className='text-gray-900 font-bold text-lg mb-2'>
                  {t('compatibility_empty_state_title', '아직 궁합 결과가 없어요')}
                </h3>
                <p className='text-gray-600 mb-6'>
                  {t('compatibility_new_compatibility_ask', '새로운 Goong-Hap을 확인해 보시겠어요?')}
                </p>
                <NavigationLink
                  href={getLocalizedPath('/goong-hap/new')}
                  className='inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg'
                >
                  <span>✨</span>
                  {t('compatibility_new_compatibility', '새 궁합 계산하기')}
                </NavigationLink>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
