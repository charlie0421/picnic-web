'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SafeAvatar } from '@/components/ui/SafeAvatar';

export default function GoongHapDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);
  const langParam = Array.isArray(params?.lang) ? params?.lang[0] : (params?.lang as string);
  const { tDynamic: t } = useTranslations();
  const { userProfile, isInitialized } = useAuth();
  const isAdmin = userProfile?.is_admin === true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [artist, setArtist] = useState<{ id: number; name: any; image?: string | null } | null>(null);
  const artistImageUrl = useMemo(() => {
    const raw =
      (artist?.image as string) || (data?.artist_image as string) || null;
    return raw;
  }, [artist?.image, data?.artist_image]);
  const [processing, setProcessing] = useState(false);
  const [invokeStatus, setInvokeStatus] = useState<{ ok: boolean; message?: string } | null>(null);
  const invokedRef = useRef(false);
  const [i18nLoading, setI18nLoading] = useState(false);

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

  // artist_id 기반 아티스트 정보 로드
  useEffect(() => {
    (async () => {
      try {
        if (!data?.artist_id) { setArtist(null); return; }
        const supabase = createBrowserSupabaseClient();
        const { data: artistRow } = await supabase
          .from('artist')
          .select('id,name,image')
          .eq('id', data.artist_id)
          .single();
        setArtist((artistRow as any) || null);
      } catch {
        setArtist(null);
      }
    })();
  }, [data?.artist_id]);

  const getLangCandidates = (lang: string | undefined): string[] => {
    const raw = String(lang || '').trim();
    if (!raw) return [];
    const lc = raw.toLowerCase();
    const base = lc.split('-')[0].split('_')[0];
    if (base === 'zh') {
      if (lc.includes('tw')) return ['zh-tw', 'zh', 'zh-cn'];
      if (lc.includes('cn') || lc.includes('hans')) return ['zh-cn', 'zh', 'zh-tw'];
      return ['zh', 'zh-cn', 'zh-tw'];
    }
    // 일반 케이스: 정확히 일치 > 베이스 언어
    if (lc !== base) return [lc, base];
    return [base];
  };

  const normalizeForServer = (lang: string | undefined): string => {
    const lc = String(lang || '').toLowerCase();
    const base = lc.split('-')[0].split('_')[0];
    if (base === 'zh') {
      if (lc.includes('tw')) return 'zh-TW';
      if (lc.includes('cn') || lc.includes('hans')) return 'zh-CN';
      return 'zh';
    }
    return base;
  };

  const localized = useMemo(() => {
    const rows = data?.compatibility_results_i18n || [];
    const cands = getLangCandidates(langParam);
    const byLang = rows.find((r: any) => cands.includes(String(r.language || '').toLowerCase()));
    // 언어 후보가 주어진 경우에는 임의 첫 번째(대개 ko)로 폴백하지 않음
    if (cands.length > 0) return byLang || null;
    // 초기 로딩 등 langParam이 없을 때만 첫 번째로 폴백
    return byLang || rows[0] || null;
  }, [data, langParam]);

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

  // i18n 지연 로딩: 현재 로케일 번역이 없으면 생성 요청 후 재조회
  const i18nInvokedRef = useRef(false);
  const i18nAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    (async () => {
      if (!id || !data) return;
      if (data.status !== 'completed') return;
      const rows = data?.compatibility_results_i18n || [];
      // 서버 호환 로케일 정규화 (Edge: zh, zh-CN, zh-TW, en, ja 등)
      const normalizedForServer = normalizeForServer(langParam);

      const exists = rows.some((r: any) => String(r.language || '').toLowerCase() === String(normalizedForServer).toLowerCase());
      const attemptKey = `${id}:${normalizedForServer}:initial`;
      if (!exists && !i18nInvokedRef.current && normalizedForServer && !i18nAttemptedRef.current.has(attemptKey)) {
        i18nInvokedRef.current = true;
        setI18nLoading(true);
        try {
          // 공통 글로벌 로딩 시작 (오버레이)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: { source: 'compatibility-i18n' } }));
          }
          const supabase = createBrowserSupabaseClient();
          await supabase.functions.invoke('compatibility-i18n', { body: { compatibility_id: id, language: String(normalizedForServer) } });
          await refreshDetail();
        } catch (e) {
          // 무시하고 원문 표시 유지
          i18nAttemptedRef.current.add(attemptKey);
        } finally {
          i18nInvokedRef.current = false;
          setI18nLoading(false);
          // 공통 글로벌 로딩 종료
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: { source: 'compatibility-i18n' } }));
          }
        }
      }
    })();
  }, [id, data, langParam]);

  // 번역이 존재하지만 비한글 로케일에서 한글이 남아있는 경우 강제 재번역(overwrite)
  const i18nFixRef = useRef(false);
  useEffect(() => {
    (async () => {
      if (!id || !data) return;
      if (data.status !== 'completed') return;
      if (!localized) return;
      const target = normalizeForServer(langParam);
      if (!target || target.toLowerCase() === 'ko') return;
      const hasHangul = /[\u3131-\uD79D]/.test(JSON.stringify(localized));
      const attemptKey = `${id}:${target}:overwrite`;
      if (hasHangul && !i18nFixRef.current && !i18nAttemptedRef.current.has(attemptKey)) {
        i18nFixRef.current = true;
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: { source: 'compatibility-i18n-overwrite' } }));
          }
          const supabase = createBrowserSupabaseClient();
          await supabase.functions.invoke('compatibility-i18n', { body: { compatibility_id: id, language: String(target), overwrite: true } });
          await refreshDetail();
        } catch {}
        finally {
          i18nAttemptedRef.current.add(attemptKey);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: { source: 'compatibility-i18n-overwrite' } }));
          }
          i18nFixRef.current = false;
        }
      }
    })();
  }, [id, data, langParam, localized]);

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
            <div className='mt-4'>
              <div className='w-full h-2 bg-amber-100 rounded'>
                <div className='h-2 w-1/2 bg-amber-400 rounded animate-pulse' />
              </div>
            </div>
          </div>
        )}
        {!loading && !error && data?.status === 'pending' && invokeStatus && (
          <div className={`rounded-xl p-4 mb-4 shadow-sm ${invokeStatus.ok ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
            {invokeStatus.ok ? '처리 요청 전달 완료' : `처리 요청 중 문제가 발생했습니다: ${invokeStatus.message || ''}`}
          </div>
        )}
        {!loading && !error && data && (
          <div className='space-y-6'>
            {/* 펜시 헤더: 사용자/아티스트 아바타 + 점수 */}
            <div className='relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 via-secondary/80 to-rose-500/80 text-white shadow-md'>
              <div className='absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_35%),radial-gradient(circle_at_70%_80%,white,transparent_35%)]' />
              <div className='relative px-6 py-8 sm:px-8 sm:py-10'>
                <div className='flex items-center justify-center gap-5 sm:gap-8'>
                  <div className='flex flex-col items-center'>
                    <SafeAvatar src={userProfile?.avatar_url || ''} size='xl' className='rounded-full ring-4 ring-white/30 shadow-lg' />
                    <span className='mt-2 text-xs sm:text-sm text-white/80'>{userProfile?.nickname || 'You'}</span>
                  </div>
                  <div className='text-3xl sm:text-4xl animate-pulse'>❤️</div>
                  <div className='flex flex-col items-center'>
                    <SafeAvatar src={artistImageUrl} size='xl' className='rounded-full ring-4 ring-white/30 shadow-lg' />
                    <span className='mt-2 text-xs sm:text-sm text-white/80'>
                      {(() => {
                        const n = artist?.name ?? (data?.artist_name as any);
                        if (!n) return t('artist_name_fallback') || 'Artist';
                        if (typeof n === 'string') return n;
                        const cands = getLangCandidates(langParam);
                        for (const c of cands) {
                          const key = c.includes('-') ? c.split('-')[0] : c;
                          if (n?.[c]) return n[c];
                          if (n?.[key]) return n[key];
                        }
                        return n?.ko || n?.en || n?.ja || t('artist_name_fallback') || 'Artist';
                      })()}
                    </span>
                  </div>
                </div>
                <div className='mt-6 flex items-center justify-between'>
                  <p className='text-xl sm:text-2xl font-extrabold drop-shadow'>{localized?.score_title || 'Compatibility'}</p>
                  <div className='text-right'>
                    <p className='text-3xl sm:text-4xl font-extrabold drop-shadow'>{data.score ?? '-'}<span className='text-base sm:text-lg font-medium ml-1 opacity-90'>pt</span></p>
                    <p className='text-[10px] sm:text-xs opacity-90'>{new Date(data.created_at).toLocaleString()}</p>
                  </div>
                </div>
                {localized?.compatibility_summary && (
                  <p className='mt-3 sm:mt-4 text-sm sm:text-base text-white/95'>{localized.compatibility_summary}</p>
                )}
              </div>
            </div>

            {/* 공통 글로벌 로딩 오버레이로 대체 (별도 페이지 내 오버레이 제거) */}

            {/* 궁합 스타일 카드 */}
            {localized?.details?.style && (
              <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm'>
                <h2 className='text-lg font-bold text-gray-900 mb-2'>{t('compatibility_style_title') || '스타일'}</h2>
                <div className='text-gray-700 space-y-1'>
                  <p>{localized.details.style.idol_style}</p>
                  <p>{localized.details.style.user_style}</p>
                  <p>{localized.details.style.couple_style}</p>
                </div>
              </div>
            )}

            {/* 추천 활동 카드 */}
            {localized?.details?.activities && (
              <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm'>
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

            {/* 팁 섹션: i18n.tips 배열이 있으면 렌더링 */}
            {Array.isArray(localized?.tips) && (localized?.tips?.length ?? 0) > 0 && (
              <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm'>
                <h2 className='text-lg font-bold text-gray-900 mb-2'>{t('compatibility_tips_title') || '팁'}</h2>
                <div className='text-gray-700 space-y-1'>
                  {localized.tips.map((tip: string, idx: number) => (
                    <p key={idx}>• {tip}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


