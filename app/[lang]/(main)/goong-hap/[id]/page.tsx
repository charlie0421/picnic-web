'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function GoongHapDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const { tDynamic: t } = useTranslations();
  const { userProfile, isInitialized } = useAuth();
  const isAdmin = userProfile?.is_admin === true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [invokeStatus, setInvokeStatus] = useState<{ ok: boolean; message?: string } | null>(null);
  const invokedRef = useRef(false);

  const refreshDetail = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from('compatibility_results')
        .select('*, compatibility_results_i18n(*)')
        .eq('id', id)
        .limit(1)
        .single();
      if (error) throw error;
      setData(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh');
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!id) { setError('Invalid id'); setLoading(false); return; }
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from('compatibility_results')
          .select('*, compatibility_results_i18n(*)')
          .eq('id', id)
          .limit(1)
          .single();
        if (error) throw error;
        if (!mounted) return;
        setData(data);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const localized = useMemo(() => (data?.compatibility_results_i18n?.[0] || null), [data]);

  // 앱 로직을 따라: pending이면 edge function 호출 후 일정 시간 뒤 재조회
  useEffect(() => {
    (async () => {
      if (!id || !data) return;
      if (data.status === 'pending' && !invokedRef.current) {
        invokedRef.current = true;
        setProcessing(true);
        try {
          const supabase = createBrowserSupabaseClient();
          const { data: fnData, error: fnError } = await supabase.functions.invoke('compatibility', { body: { compatibility_id: id } });
          if (fnError) setInvokeStatus({ ok: false, message: fnError.message });
          else setInvokeStatus({ ok: true });
        } catch (e: any) {
          setInvokeStatus({ ok: false, message: e?.message });
        }
        // 15초마다 재조회, 최대 4회 (총 ~1분) - 앱은 30초 대기 후 재조회
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          await refreshDetail();
          if (attempts >= 4 || (data && data.status !== 'pending')) {
            clearInterval(interval);
            setProcessing(false);
          }
        }, 15000);
      }
    })();
  }, [id, data]);

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
        {!loading && !error && data?.status === 'pending' && (
          <div className='rounded-xl border border-amber-200 p-6 bg-amber-50 shadow-sm text-amber-800 mb-4'>
            처리 중입니다. 잠시만 기다려 주세요...
          </div>
        )}
        {!loading && !error && data?.status === 'pending' && invokeStatus && (
          <div className={`rounded-xl p-4 mb-4 shadow-sm ${invokeStatus.ok ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
            {invokeStatus.ok ? '처리 요청 전달 완료' : `처리 요청 중 문제가 발생했습니다: ${invokeStatus.message || ''}`}
          </div>
        )}
        {!loading && !error && data && (
          <div className='space-y-6'>
            <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm'>
              <div className='flex items-baseline justify-between'>
                <div>
                  <p className='text-sm text-gray-500'>#{data.id?.slice?.(0, 8)}</p>
                  <p className='text-xl font-bold text-gray-900'>{localized?.score_title || 'Compatibility'}</p>
                </div>
                <div className='text-right'>
                  <p className='text-2xl font-extrabold text-primary'>{data.score ?? '-'}<span className='text-sm font-medium text-gray-500 ml-1'>pt</span></p>
                  <p className='text-xs text-gray-500'>{new Date(data.created_at).toLocaleString()}</p>
                </div>
              </div>
              {localized?.compatibility_summary && (
                <p className='text-gray-700 mt-3'>{localized.compatibility_summary}</p>
              )}
            </div>

            {/* 상세 tips/activities/style 등이 i18n.details에 포함되어 있으면 표시 */}
            {localized?.details && (
              <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm space-y-6'>
                {localized.details.style && (
                  <div>
                    <h2 className='text-lg font-bold text-gray-900 mb-2'>{t('compatibility_style_title') || '스타일'}</h2>
                    <div className='text-gray-700 space-y-1'>
                      <p>{localized.details.style.idol_style}</p>
                      <p>{localized.details.style.user_style}</p>
                      <p>{localized.details.style.couple_style}</p>
                    </div>
                  </div>
                )}
                {localized.details.activities && (
                  <div>
                    <h2 className='text-lg font-bold text-gray-900 mb-2'>{t('compatibility_activities_title') || '추천 활동'}</h2>
                    <div className='text-gray-700 space-y-1'>
                      {(localized.details.activities.recommended || []).map((it: string, idx: number) => (
                        <p key={idx}>• {it}</p>
                      ))}
                      {!!localized.details.activities.description && (
                        <p className='text-gray-600 mt-2'>{localized.details.activities.description}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


