'use client';

import React from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import NavigationLink from '@/components/client/NavigationLink';
import { useEffect, useMemo, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function GoongHapPage() {
  const { tDynamic: t } = useTranslations();
  const { getLocalizedPath } = useLocaleRouter();
  const { userProfile, isInitialized } = useAuth();
  const isAdmin = userProfile?.is_admin === true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{
    id: string;
    artist_id: number;
    score: number | null;
    status: Database['public']['Enums']['compatibility_status'];
    created_at: string;
    i18n?: Array<{ score_title: string | null; compatibility_summary: string | null; language: string }>;
  }>>([]);

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

        const { data, error } = await supabase
          .from('compatibility_results')
          .select('id, artist_id, score, status, created_at, compatibility_results_i18n(score_title,compatibility_summary,language)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        if (!mounted) return;
        setResults(
          (data || []).map((row: any) => ({
            id: row.id,
            artist_id: row.artist_id,
            score: row.score,
            status: row.status,
            created_at: row.created_at,
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

  const hasResults = useMemo(() => (results?.length || 0) > 0, [results]);

  if (isInitialized && !isAdmin) {
    return (
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-2xl mx-auto'>
          <div className='rounded-xl border border-amber-200 p-6 bg-amber-50 text-amber-800'>
            관리자 전용 메뉴입니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='px-4 py-6 sm:py-10'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4'>Goong-Hap</h1>
        <p className='text-gray-600 mb-6'>
          {t('compatibility_page_title') || '궁합'}
        </p>

        {/* 신규 궁합 버튼 */}
        <div className='mb-4'>
          <NavigationLink
            href={getLocalizedPath('/goong-hap/new')}
            className='inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition shadow-sm'
          >
            {t('compatibility_new_compatibility') || '새 Goong-Hap 계산하기'}
          </NavigationLink>
        </div>

        {/* 로딩/에러 상태 */}
        {loading && (
          <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm text-gray-600'>
            {t('common.loading') || '불러오는 중...'}
          </div>
        )}
        {(!loading && error) && (
          <div className='rounded-xl border border-red-200 p-6 bg-red-50 shadow-sm text-red-700'>
            {t('compatibility_snackbar_error') || '오류가 발생했습니다.'}
          </div>
        )}

        {/* 결과 목록 또는 빈 상태 */}
        {!loading && !error && hasResults && (
          <div className='space-y-3'>
            {results.map((r) => {
              const summary = r.i18n?.[0]?.compatibility_summary || null;
              const scoreTitle = r.i18n?.[0]?.score_title || null;
              return (
                <NavigationLink key={r.id} href={getLocalizedPath(`/goong-hap/${r.id}`)} className='block rounded-xl border border-gray-200 p-4 bg-white shadow-sm hover:bg-gray-50 transition-colors'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm text-gray-500'>#{r.id.slice(0, 8)}</p>
                      <p className='text-base font-semibold text-gray-900'>{scoreTitle || (t('compatibility_share_hashtag') || 'Goong-Hap')}</p>
                    </div>
                    <div className='text-right'>
                      <p className='text-lg font-extrabold text-primary'>{r.score ?? '-'}<span className='text-sm font-medium text-gray-500 ml-1'>pt</span></p>
                      <p className='text-xs text-gray-500'>{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  {summary && <p className='text-gray-700 mt-2'>{summary}</p>}
                </NavigationLink>
              );
            })}
          </div>
        )}

        {!loading && !error && !hasResults && (
          <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm'>
            <p className='text-gray-700 mb-4'>
              {t('compatibility_new_compatibility_ask') || '새로운 Goong-Hap을 확인해 보시겠어요?'}
            </p>
            <div className='flex flex-wrap gap-3'>
              <NavigationLink
                href={getLocalizedPath('/goong-hap/new')}
                className='inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition shadow-sm'
              >
                {t('compatibility_new_compatibility') || '새 Goong-Hap 계산하기'}
              </NavigationLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


