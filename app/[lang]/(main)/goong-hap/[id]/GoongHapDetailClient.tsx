'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SafeAvatar } from '@/components/ui/SafeAvatar';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import AdBanner from '@/components/client/ads/AdBanner';
import NavigationLink from '@/components/client/NavigationLink';
import { useGoonghapStore } from '@/stores/goonghapStore';

// 30초 광고 대기 시간 (앱과 동일)
const AD_WAIT_SECONDS = 30;

// 별사탕 소모량
const STAR_CANDY_COST = 100;

interface GoongHapDetailClientProps {
  initialData: any;
  id: string;
  lang: string;
}

export default function GoongHapDetailClient({ initialData, id, lang: langParam }: GoongHapDetailClientProps) {
  const router = useRouter();
  const { getLocalizedPath } = useLocaleRouter();
  const { tDynamic: t } = useTranslations();
  const { userProfile, isInitialized } = useAuth();

  // Zustand 스토어에서 캐시된 데이터 가져오기
  const cachedResult = useGoonghapStore((state) => state.getCachedResult(id));
  const setCachedResult = useGoonghapStore((state) => state.setCachedResult);

  // 초기 데이터 우선순위: 서버 데이터 > 캐시 데이터
  const effectiveInitialData = initialData || cachedResult;

  // 클라이언트 마운트 상태 (hydration mismatch 방지)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 캐시 또는 서버 데이터가 있으면 즉시 표시
  const [loading, setLoading] = useState(!effectiveInitialData);
  const [error, setError] = useState<string | null>(effectiveInitialData ? null : 'Failed to load');
  const [data, setData] = useState<any>(effectiveInitialData);

  // artist 정보는 이제 RPC에서 함께 반환됨 (artist_name, artist_image)
  const artistImageUrl = useMemo(() => {
    return (data?.artist_image as string) || null;
  }, [data?.artist_image]);
  const [processing, setProcessing] = useState(false);
  const [invokeStatus, setInvokeStatus] = useState<{ ok: boolean; message?: string } | null>(null);
  const invokedRef = useRef(false);
  const [i18nLoading, setI18nLoading] = useState(false);
  const [countdown, setCountdown] = useState(30); // 30초 카운트다운

  // 30초 광고 대기 상태
  const [adWaitSeconds, setAdWaitSeconds] = useState(AD_WAIT_SECONDS);
  const [showAdScreen, setShowAdScreen] = useState(false);
  const adTimerRef = useRef<NodeJS.Timeout | null>(null);
  const adCompletedRef = useRef(false);

  // 별사탕 결제 상태
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [userStarCandy, setUserStarCandy] = useState<number | null>(null);
  const lastPurchaseTime = useRef<number>(0);

  const refreshDetail = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      // 보안을 위해 RPC 함수 사용 (is_paid=false일 때 details, tips 숨김)
      const { data: newData, error } = await supabase.rpc('get_goonghap_result', { p_id: id });
      if (error) throw error;
      setData(newData);
      // 캐시 업데이트 (타입 체크)
      if (newData && typeof newData === 'object' && 'id' in newData) {
        setCachedResult(id, newData as any);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to refresh');
    }
  };

  // 캐시가 있으면 백그라운드에서 최신 데이터 로드, 없으면 즉시 로드
  useEffect(() => {
    // 캐시 데이터가 있으면 즉시 표시하고 백그라운드에서 업데이트
    if (cachedResult && !initialData) {
      setData(cachedResult);
      setLoading(false);
      setError(null);
      // 백그라운드에서 최신 데이터 로드
      refreshDetail();
      return;
    }

    // 서버 데이터가 있으면 스킵
    if (initialData) return;

    // 둘 다 없으면 로드
    let isMounted = true;
    (async () => {
      try {
        if (!id) { setError('Invalid id'); setLoading(false); return; }
        setLoading(true);

        const supabase = createBrowserSupabaseClient();
        const { data: newData, error } = await supabase.rpc('get_goonghap_result', { p_id: id });
        if (error) throw error;
        if (!isMounted) return;
        setData(newData);
        setError(null);
        // 캐시 업데이트 (타입 체크)
        if (newData && typeof newData === 'object' && 'id' in newData) {
          setCachedResult(id, newData as any);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [id, initialData, cachedResult, setCachedResult]);

  // pending 상태일 때 30초 카운트다운
  useEffect(() => {
    if (data?.status !== 'pending') {
      setCountdown(30);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.status]);

  // artist 정보는 이제 get_goonghap_result RPC에서 함께 반환됨
  // 별도의 artist 테이블 조회 불필요

  // 30초 광고 대기 로직: is_ads가 false이면 30초 대기 후 결과 표시
  useEffect(() => {
    if (!data || loading) return;

    // 이미 광고를 본 경우 (is_ads === true) 또는 이미 완료한 경우 스킵
    if (data.is_ads === true || adCompletedRef.current) {
      setShowAdScreen(false);
      return;
    }

    // is_ads가 false이면 30초 대기 화면 표시
    setShowAdScreen(true);
    setAdWaitSeconds(AD_WAIT_SECONDS);

    // 1초마다 카운트다운
    adTimerRef.current = setInterval(() => {
      setAdWaitSeconds((prev) => {
        if (prev <= 1) {
          // 타이머 완료
          if (adTimerRef.current) {
            clearInterval(adTimerRef.current);
            adTimerRef.current = null;
          }
          // is_ads를 true로 업데이트
          (async () => {
            try {
              const supabase = createBrowserSupabaseClient();
              await supabase
                .from('goonghap_results')
                .update({ is_ads: true })
                .eq('id', id);
              adCompletedRef.current = true;
              setShowAdScreen(false);
              // 데이터 새로고침
              await refreshDetail();
            } catch (e) {
              console.error('Failed to update is_ads:', e);
              adCompletedRef.current = true;
              setShowAdScreen(false);
            }
          })();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (adTimerRef.current) {
        clearInterval(adTimerRef.current);
        adTimerRef.current = null;
      }
    };
  }, [data, loading, id]);

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
    const rows = data?.goonghap_results_i18n || [];
    // langParam이 없으면 URL에서 직접 추출 시도
    const effectiveLang = langParam || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : 'ko');
    const cands = getLangCandidates(effectiveLang);
    const byLang = rows.find((r: any) => cands.includes(String(r.language || '').toLowerCase()));
    // 찾은 번역 반환, 없으면 null (한국어 폴백 하지 않음)
    return byLang || null;
  }, [data, langParam]);

  // 아티스트 이름 가져오기 (로케일 적용) - RPC에서 artist_name 반환
  const artistName = useMemo(() => {
    const n = data?.artist_name as any;
    if (!n) return t('artist_name_fallback') || 'Artist';
    if (typeof n === 'string') return n;
    const cands = getLangCandidates(langParam);
    for (const c of cands) {
      const key = c.includes('-') ? c.split('-')[0] : c;
      if (n?.[c]) return n[c];
      if (n?.[key]) return n[key];
    }
    return n?.ko || n?.en || n?.ja || t('artist_name_fallback') || 'Artist';
  }, [data?.artist_name, langParam, t]);

  // is_paid 여부 (결제 완료 시 true)
  const isPaid = data?.is_paid === true;

  // 별사탕 잔액 조회
  const fetchUserStarCandy = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('star_candy')
        .eq('id', user.id)
        .single();
      setUserStarCandy(profile?.star_candy ?? 0);
    } catch {
      setUserStarCandy(0);
    }
  }, []);

  // 구매 확인 다이얼로그 열기
  const handleOpenPurchaseDialog = useCallback(async () => {
    // 연타 방지 (1초)
    const now = Date.now();
    if (now - lastPurchaseTime.current < 1000) return;
    lastPurchaseTime.current = now;

    setPurchaseError(null);
    await fetchUserStarCandy();
    setShowPurchaseDialog(true);
  }, [fetchUserStarCandy]);

  // 구매 처리
  const handlePurchase = useCallback(async () => {
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPurchaseError(t('common.auth.login') || '로그인이 필요합니다');
        return;
      }

      // 별사탕 잔액 확인
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('star_candy')
        .eq('id', user.id)
        .single();

      if (!profile || (profile.star_candy ?? 0) < STAR_CANDY_COST) {
        setPurchaseError(t('fortune_lack_of_star_candy_message') || `별사탕이 부족합니다. (필요: ${STAR_CANDY_COST}개)`);
        return;
      }

      // Edge function 호출하여 결제 처리
      const { error: fnError } = await supabase.functions.invoke('open-goonghap', {
        body: { userId: user.id, goonghapId: id },
      });

      if (fnError) {
        setPurchaseError(fnError.message || '결제 처리 중 오류가 발생했습니다');
        return;
      }

      // 성공 - 다이얼로그 닫고 데이터 새로고침
      setShowPurchaseDialog(false);
      await refreshDetail();
      await fetchUserStarCandy();
    } catch (e: any) {
      setPurchaseError(e?.message || '결제 처리 중 오류가 발생했습니다');
    } finally {
      setPurchasing(false);
    }
  }, [id, purchasing, t, fetchUserStarCandy]);

  // 앱 로직을 따라: pending이면 edge function 호출 후 일정 시간 뒤 재조회
  useEffect(() => {
    (async () => {
      if (!id || !data) return;
      if (data.status === 'pending' && !invokedRef.current) {
        invokedRef.current = true;
        setProcessing(true);
        try {
          const supabase = createBrowserSupabaseClient();
          const { data: fnData, error: fnError } = await supabase.functions.invoke('goonghap', { body: { goonghap_id: id } });
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
      const rows = data?.goonghap_results_i18n || [];
      // langParam이 없으면 URL에서 직접 추출
      const effectiveLang = langParam || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : 'ko');
      // 서버 호환 로케일 정규화 (Edge: zh, zh-CN, zh-TW, en, ja 등)
      const normalizedForServer = normalizeForServer(effectiveLang);

      const exists = rows.some((r: any) => String(r.language || '').toLowerCase() === String(normalizedForServer).toLowerCase());
      const attemptKey = `${id}:${normalizedForServer}:initial`;
      if (!exists && !i18nInvokedRef.current && normalizedForServer && !i18nAttemptedRef.current.has(attemptKey)) {
        i18nInvokedRef.current = true;
        setI18nLoading(true);
        try {
          // 공통 글로벌 로딩 시작 (오버레이)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: { source: 'goonghap-i18n' } }));
          }
          const supabase = createBrowserSupabaseClient();
          await supabase.functions.invoke('goonghap-i18n', { body: { goonghap_id: id, language: String(normalizedForServer) } });
          await refreshDetail();
        } catch (e) {
          // 무시하고 원문 표시 유지
          i18nAttemptedRef.current.add(attemptKey);
        } finally {
          i18nInvokedRef.current = false;
          setI18nLoading(false);
          // 공통 글로벌 로딩 종료
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: { source: 'goonghap-i18n' } }));
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
      // langParam이 없으면 URL에서 직접 추출
      const effectiveLang = langParam || (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : 'ko');
      const target = normalizeForServer(effectiveLang);
      if (!target || target.toLowerCase() === 'ko') return;
      const hasHangul = /[\u3131-\uD79D]/.test(JSON.stringify(localized));
      const attemptKey = `${id}:${target}:overwrite`;
      if (hasHangul && !i18nFixRef.current && !i18nAttemptedRef.current.has(attemptKey)) {
        i18nFixRef.current = true;
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('startGlobalLoading', { detail: { source: 'goonghap-i18n-overwrite' } }));
          }
          const supabase = createBrowserSupabaseClient();
          await supabase.functions.invoke('goonghap-i18n', { body: { goonghap_id: id, language: String(target), overwrite: true } });
          await refreshDetail();
        } catch {}
        finally {
          i18nAttemptedRef.current.add(attemptKey);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('stopGlobalLoading', { detail: { source: 'goonghap-i18n-overwrite' } }));
          }
          i18nFixRef.current = false;
        }
      }
    })();
  }, [id, data, langParam, localized]);

  // 전체 화면 스켈레톤 로딩 컴포넌트
  const FullPageSkeleton = () => (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-4xl mx-auto'>
          {/* 헤더 영역 스켈레톤 */}
          <div className='mb-8'>
            <div className='flex items-center gap-4 mb-4'>
              <div className='w-10 h-10 rounded-full bg-purple-200 animate-pulse' />
              <div className='h-14 w-24 bg-gradient-to-r from-purple-200 to-pink-200 rounded animate-pulse' />
              <div className='flex flex-col gap-1'>
                <div className='h-5 w-12 bg-gray-300 rounded animate-pulse' />
                <div className='h-3 w-16 bg-gray-200 rounded animate-pulse' />
              </div>
            </div>
          </div>

          {/* 헤더 카드 스켈레톤 */}
          <div className='relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-300 via-pink-300 to-rose-300 shadow-lg'>
            <div className='px-6 py-8 sm:px-8 sm:py-10'>
              {/* 아바타들 */}
              <div className='flex items-center justify-center gap-5 sm:gap-8'>
                <div className='flex flex-col items-center'>
                  <div className='w-24 h-24 rounded-full bg-white/30 animate-pulse' />
                  <div className='mt-2 h-4 w-16 bg-white/30 rounded animate-pulse' />
                </div>
                <div className='w-10 h-10 rounded-full bg-white/30 animate-pulse' />
                <div className='flex flex-col items-center'>
                  <div className='w-24 h-24 rounded-full bg-white/30 animate-pulse' />
                  <div className='mt-2 h-4 w-12 bg-white/30 rounded animate-pulse' />
                </div>
              </div>
              {/* 점수 영역 */}
              <div className='mt-6 flex items-center justify-between'>
                <div className='h-6 w-28 bg-white/30 rounded animate-pulse' />
                <div className='text-right space-y-1'>
                  <div className='h-10 w-20 bg-white/30 rounded ml-auto animate-pulse' />
                  <div className='h-3 w-24 bg-white/30 rounded ml-auto animate-pulse' />
                </div>
              </div>
              {/* 요약 */}
              <div className='mt-4 space-y-2'>
                <div className='h-4 bg-white/30 rounded w-full animate-pulse' />
                <div className='h-4 bg-white/30 rounded w-3/4 animate-pulse' />
              </div>
            </div>
          </div>

          {/* 콘텐츠 카드들 스켈레톤 */}
          <div className='mt-6 space-y-6'>
            {[{ gradient: 'from-purple-500 to-pink-500' }, { gradient: 'from-pink-500 to-rose-500' }, { gradient: 'from-indigo-500 to-purple-500' }].map((item, i) => (
              <div key={i} className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                <div className={`bg-gradient-to-r ${item.gradient} px-5 py-3`}>
                  <div className='h-5 w-20 bg-white/30 rounded animate-pulse' />
                </div>
                <div className='p-5 space-y-2'>
                  <div className='h-4 bg-gray-200 rounded w-full animate-pulse' />
                  <div className='h-4 bg-gray-200 rounded w-5/6 animate-pulse' />
                  <div className='h-4 bg-gray-200 rounded w-4/5 animate-pulse' />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // 클라이언트 마운트 전까지는 로딩 표시 (hydration mismatch 방지)
  if (!mounted || !isInitialized) {
    return <FullPageSkeleton />;
  }


  // 데이터 로딩 중일 때 전체 스켈레톤 표시
  if (loading) {
    return <FullPageSkeleton />;
  }

  // 30초 광고 대기 화면
  if (showAdScreen && !loading && data) {
    const progressPercent = ((AD_WAIT_SECONDS - adWaitSeconds) / AD_WAIT_SECONDS) * 100;
    return (
      <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
        <div className='px-4 py-6 sm:py-10'>
          <div className='max-w-2xl mx-auto space-y-6'>
            {/* 헤더 영역 */}
            <div className='text-center mb-4'>
              <div className='flex items-center justify-center gap-4 mb-4'>
                <h1 className='text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                  궁합
                </h1>
                <div className='flex flex-col text-left'>
                  <span className='text-xl font-bold text-gray-600'>宮合</span>
                  <span className='text-sm text-gray-400'>Goong-Hap</span>
                </div>
              </div>
              <p className='text-gray-600'>{t('goongHap.analyzing') || '궁합 분석 중...'}</p>
            </div>

            {/* 진행률 카드 */}
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
              <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
                <div className='flex items-center gap-2'>
                  <span className='text-lg'>✨</span>
                  <h2 className='text-white font-bold'>{t('goongHap.waitingForResult') || '결과를 불러오는 중입니다'}</h2>
                </div>
              </div>
              <div className='p-5'>
                <div className='flex justify-between items-center mb-3'>
                  <span className='text-gray-600'>{t('goongHap.progress') || '진행률'}</span>
                  <span className='font-bold text-lg text-purple-600'>{adWaitSeconds}{t('goongHap.seconds') || '초'}</span>
                </div>
                <div className='w-full h-4 bg-purple-100 rounded-full overflow-hidden'>
                  <div
                    className='h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000 ease-linear'
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 상단 광고 배너 */}
            <AdBanner className='my-4' />

            {/* 안내 메시지 */}
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-amber-200 p-5 text-amber-800 text-center space-y-2 shadow-lg'>
              <p className='text-sm font-medium'>
                {t('goongHap.waitingMessage') || '잠시만 기다려 주세요. 궁합 결과를 분석하고 있습니다.'}
              </p>
              <p className='text-xs text-amber-600'>
                {t('goongHap.warningExit') || '페이지를 벗어나면 분석이 중단될 수 있습니다.'}
              </p>
            </div>

            {/* 하단 광고 배너 */}
            <AdBanner className='my-4' />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-4xl mx-auto'>
          {/* 헤더 영역 */}
          <div className='mb-8'>
            {/* 뒤로 가기 버튼 + 제목 */}
            <div className='flex items-center gap-4 mb-4'>
              <button
                type='button'
                onClick={() => router.back()}
                className='inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-600 transition-colors'
                aria-label={t('common.back') || '뒤로가기'}
              >
                <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
                </svg>
              </button>
              <h1 className='text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                궁합
              </h1>
              <div className='flex flex-col'>
                <span className='text-xl font-bold text-gray-600'>宮合</span>
                <span className='text-sm text-gray-400'>Goong-Hap</span>
              </div>
            </div>
          </div>

          {error && (
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-red-200 p-6 shadow-lg text-red-700'>
              {t('goonghap_snackbar_error') || '오류가 발생했습니다.'}
            </div>
          )}
          {!error && data?.status === 'pending' && (
            <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-amber-200 p-6 shadow-lg text-amber-800 mb-6'>
              <div className='flex items-center justify-between mb-3'>
                <span className='font-medium'>{t('goongHap.waitingMessage') || '처리 중입니다. 잠시만 기다려 주세요...'}</span>
                <span className='font-bold text-lg'>{countdown}{t('goongHap.seconds') || '초'}</span>
              </div>
              <div className='w-full h-4 bg-amber-100 rounded-full overflow-hidden'>
                <div
                  className='h-4 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-1000 ease-linear'
                  style={{ width: `${(countdown / 30) * 100}%` }}
                />
              </div>
            </div>
          )}
          {!error && data?.status === 'pending' && invokeStatus && (
            <div className={`rounded-2xl bg-white/80 backdrop-blur-sm p-4 mb-6 shadow-lg ${invokeStatus.ok ? 'border border-emerald-200 text-emerald-800' : 'border border-amber-200 text-amber-800'}`}>
              {invokeStatus.ok ? '처리 요청 전달 완료' : `처리 요청 중 문제가 발생했습니다: ${invokeStatus.message || ''}`}
            </div>
          )}
          {!error && data && (
            <div className='space-y-6'>
              {/* 펜시 헤더: 사용자/아티스트 아바타 + 점수 */}
              <div className='relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500 text-white shadow-lg'>
                <div className='absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,white,transparent_35%),radial-gradient(circle_at_70%_80%,white,transparent_35%)]' />
                <div className='relative px-6 py-8 sm:px-8 sm:py-10'>
                  {/* 아티스트(왼쪽) - 하트 - 사용자(오른쪽) */}
                  <div className='flex items-center justify-center gap-5 sm:gap-8'>
                    <div className='flex flex-col items-center'>
                      <div className='w-24 h-24 rounded-full overflow-hidden ring-4 ring-white/30 shadow-lg'>
                        <OptimizedImage
                          src={artistImageUrl || '/images/default-artist.png'}
                          alt='Artist'
                          width={96}
                          height={96}
                          className='w-full h-full object-cover'
                          fallbackSrc='/images/default-artist.png'
                        />
                      </div>
                      <span className='mt-2 text-xs sm:text-sm text-white/80'>{artistName || 'Artist'}</span>
                    </div>
                    <div className='text-3xl sm:text-4xl'>❤️</div>
                    <div className='flex flex-col items-center'>
                      <SafeAvatar src={userProfile?.avatar_url || ''} size='xl' className='rounded-full ring-4 ring-white/30 shadow-lg' />
                      <span className='mt-2 text-xs sm:text-sm text-white/80'>
                        {userProfile?.nickname || t('goongHap.you') || 'You'}
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
                  {localized?.goonghap_summary && (
                    <p className='mt-3 sm:mt-4 text-sm sm:text-base text-white/95'>{localized.goonghap_summary}</p>
                  )}
                </div>
              </div>

              {/* 상세 콘텐츠 영역 - 결제 여부에 따라 표시 */}
              {!isPaid ? (
                /* 미결제 상태: 플레이스홀더 + 구매 버튼 (실제 내용은 렌더링하지 않음) */
                <div className='relative'>
                  {/* 플레이스홀더 콘텐츠 - 실제 데이터 없이 형태만 표시 */}
                  <div className='select-none pointer-events-none opacity-60'>
                    {/* 스타일 플레이스홀더 */}
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden mb-6'>
                      <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
                        <h2 className='text-white font-bold'>{t('goonghap_style_title') || '스타일'}</h2>
                      </div>
                      <div className='p-5 space-y-2'>
                        <div className='h-4 bg-gray-200 rounded w-3/4' />
                        <div className='h-4 bg-gray-200 rounded w-2/3' />
                        <div className='h-4 bg-gray-200 rounded w-4/5' />
                      </div>
                    </div>

                    {/* 추천 활동 플레이스홀더 */}
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden mb-6'>
                      <div className='bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3'>
                        <h2 className='text-white font-bold'>{t('goonghap_activities_title') || '추천 활동'}</h2>
                      </div>
                      <div className='p-5 space-y-2'>
                        <div className='h-4 bg-gray-200 rounded w-1/2' />
                        <div className='h-4 bg-gray-200 rounded w-2/3' />
                        <div className='h-4 bg-gray-200 rounded w-3/5' />
                      </div>
                    </div>

                    {/* 팁 플레이스홀더 */}
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3'>
                        <h2 className='text-white font-bold'>{t('goonghap_tips_title') || '팁'}</h2>
                      </div>
                      <div className='p-5 space-y-2'>
                        <div className='h-4 bg-gray-200 rounded w-4/5' />
                        <div className='h-4 bg-gray-200 rounded w-3/4' />
                      </div>
                    </div>
                  </div>

                  {/* 구매 오버레이 */}
                  <div className='absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-2xl'>
                    {/* 구매 박스 */}
                    <div className='bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 px-8 py-6 flex flex-col items-center'>
                      {/* 별사탕 아이콘 + 비용 표시 */}
                      <div className='flex items-center gap-2 mb-4'>
                        <span className='text-2xl'>⭐</span>
                        <span className='text-xl font-bold text-gray-900'>{STAR_CANDY_COST}</span>
                      </div>

                      {/* 구매 버튼 */}
                      <button
                        type='button'
                        onClick={handleOpenPurchaseDialog}
                        className='px-8 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-base hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-xl active:scale-[0.98]'
                      >
                        {t('fortune_purchase_by_star_candy') || '별사탕으로 열람하기'}
                      </button>

                      <p className='mt-3 text-sm text-gray-500 text-center'>
                        {t('goongHap.purchaseHint') || '상세 궁합 결과를 확인하려면 별사탕이 필요해요'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* 결제 완료 상태: 전체 콘텐츠 표시 */
                <>
                  {/* 궁합 스타일 카드 */}
                  {localized?.details?.style && (
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>💜</span>
                          <h2 className='text-white font-bold'>{t('goonghap_style_title') || '스타일'}</h2>
                        </div>
                      </div>
                      <div className='p-5 text-gray-700 space-y-2'>
                        <p>{localized.details.style.idol_style}</p>
                        <p>{localized.details.style.user_style}</p>
                        <p>{localized.details.style.couple_style}</p>
                      </div>
                    </div>
                  )}

                  {/* 추천 활동 카드 */}
                  {localized?.details?.activities && (
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>🎯</span>
                          <h2 className='text-white font-bold'>{t('goonghap_activities_title') || '추천 활동'}</h2>
                        </div>
                      </div>
                      <div className='p-5 text-gray-700 space-y-2'>
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
                    <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                      <div className='bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3'>
                        <div className='flex items-center gap-2'>
                          <span className='text-lg'>💡</span>
                          <h2 className='text-white font-bold'>{t('goonghap_tips_title') || '팁'}</h2>
                        </div>
                      </div>
                      <div className='p-5 text-gray-700 space-y-2'>
                        {localized.tips.map((tip: string, idx: number) => (
                          <p key={idx}>• {tip}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 구매 확인 다이얼로그 */}
          {showPurchaseDialog && (
            <div
              className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
              onClick={() => !purchasing && setShowPurchaseDialog(false)}
            >
              <div
                className='bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden'
                onClick={(e) => e.stopPropagation()}
              >
                {/* 헤더 */}
                <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4'>
                  <h3 className='text-white text-lg font-bold text-center'>
                    {t('goonghap_purchase_confirm_title') || '궁합 결과 열람'}
                  </h3>
                </div>

                {/* 본문 */}
                <div className='px-6 py-5 space-y-4'>
                  <p className='text-gray-700 text-center'>
                    {t('goonghap_purchase_confirm_message') || '별사탕 100개를 사용하여 상세 궁합 결과를 열람하시겠습니까?'}
                  </p>

                  {/* 별사탕 잔액 표시 */}
                  <div className='flex items-center justify-center gap-2 py-3 bg-gray-50 rounded-lg'>
                    <span className='text-gray-600 text-sm'>{t('goongHap.currentBalance') || '현재 보유'}</span>
                    <span className='text-xl'>⭐</span>
                    <span className='text-lg font-bold text-gray-900'>{userStarCandy ?? '-'}</span>
                  </div>

                  {/* 차감 안내 */}
                  <div className='flex items-center justify-center gap-2 text-sm'>
                    <span className='text-gray-500'>{t('goongHap.willDeduct') || '차감될 별사탕'}</span>
                    <span className='font-bold text-pink-500'>-{STAR_CANDY_COST}</span>
                  </div>

                  {/* 에러 메시지 */}
                  {purchaseError && (
                    <div className='text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg'>
                      {purchaseError}
                    </div>
                  )}

                  {/* 별사탕 부족 시 상점 이동 버튼 */}
                  {userStarCandy !== null && userStarCandy < STAR_CANDY_COST && (
                    <NavigationLink
                      href={getLocalizedPath('/star-candy')}
                      className='flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold rounded-xl hover:from-amber-500 hover:to-orange-600 transition-all shadow-md'
                    >
                      <span>⭐</span>
                      <span>{t('goongHap.goToStore') || '상점에서 별사탕 충전하기'}</span>
                    </NavigationLink>
                  )}
                </div>

                {/* 버튼 영역 */}
                <div className='px-6 pb-5 flex gap-3'>
                  <button
                    type='button'
                    onClick={() => setShowPurchaseDialog(false)}
                    disabled={purchasing}
                    className='flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50'
                  >
                    {t('cancel') || '취소'}
                  </button>
                  <button
                    type='button'
                    onClick={handlePurchase}
                    disabled={purchasing || (userStarCandy !== null && userStarCandy < STAR_CANDY_COST)}
                    className='flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    {purchasing ? (
                      <span className='flex items-center justify-center gap-2'>
                        <span className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                        {t('processing') || '처리 중...'}
                      </span>
                    ) : (
                      t('confirm') || '확인'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
