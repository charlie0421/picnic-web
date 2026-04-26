import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useGoonghapStore } from '@/stores/goonghapStore';
import { getLangCandidates, normalizeForServer } from './goong-hap-detail-utils';

interface UseGoongHapDetailParams {
  id: string;
  initialData: any;
  langParam: string;
}

export function useGoongHapDetail({ id, initialData, langParam }: UseGoongHapDetailParams) {
  const pathname = usePathname();
  const { currentLocale } = useLocaleRouter();
  const { tDynamic: t } = useTranslations();

  // URL 경로에서 현재 언어 추출 (langParam보다 현재 URL이 우선)
  const currentLang = useMemo(() => {
    if (pathname) {
      const segments = pathname.split('/').filter(Boolean);
      if (segments[0]) {
        return segments[0];
      }
    }
    return currentLocale || langParam || 'ko';
  }, [pathname, currentLocale, langParam]);

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

  // 30초 광고 대기 상태 (is_ads가 false이면 광고 화면 표시)
  const [adCompleted, setAdCompleted] = useState(false);
  const showAdScreen = data && !loading && data.is_ads !== true && !adCompleted;

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

  // 광고 대기 완료 핸들러
  const handleAdComplete = useCallback(() => {
    setAdCompleted(true);
    refreshDetail(); // 데이터 새로고침
  }, []);

  const localized = useMemo(() => {
    const rows = data?.goonghap_results_i18n || [];
    // 현재 URL 경로에서 추출한 언어 사용
    const cands = getLangCandidates(currentLang);
    const byLang = rows.find((r: any) => cands.includes(String(r.language || '').toLowerCase()));
    // 찾은 번역 반환, 없으면 null (한국어 폴백 하지 않음)
    return byLang || null;
  }, [data, currentLang]);

  // 아티스트 이름 가져오기 (로케일 적용) - RPC에서 artist_name 반환
  const artistName = useMemo(() => {
    const n = data?.artist_name as any;
    if (!n) return t('artist_name_fallback') || 'Artist';
    if (typeof n === 'string') return n;
    const cands = getLangCandidates(currentLang);
    for (const c of cands) {
      const key = c.includes('-') ? c.split('-')[0] : c;
      if (n?.[c]) return n[c];
      if (n?.[key]) return n[key];
    }
    return n?.ko || n?.en || n?.ja || t('artist_name_fallback') || 'Artist';
  }, [data?.artist_name, currentLang, t]);

  // is_paid 여부 (결제 완료 시 true)
  const isPaid = data?.is_paid === true;

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
  const i18nFixRef = useRef(false);
  const prevLangRef = useRef<string>(currentLang);

  // 언어가 변경되면 i18n ref들 리셋
  useEffect(() => {
    if (prevLangRef.current !== currentLang) {
      console.log(`🔄 [GoongHap] Language changed: ${prevLangRef.current} → ${currentLang}, resetting i18n refs`);
      i18nInvokedRef.current = false;
      i18nFixRef.current = false;
      prevLangRef.current = currentLang;
    }
  }, [currentLang]);

  useEffect(() => {
    (async () => {
      if (!id || !data) return;
      if (data.status !== 'completed') return;
      const rows = data?.goonghap_results_i18n || [];
      // 현재 URL 경로에서 추출한 언어 사용
      const normalizedForServer = normalizeForServer(currentLang);

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
  }, [id, data, currentLang]);

  // 번역이 존재하지만 비한글 로케일에서 한글이 남아있는 경우 강제 재번역(overwrite)
  useEffect(() => {
    (async () => {
      if (!id || !data) return;
      if (data.status !== 'completed') return;
      if (!localized) return;
      // 현재 URL 경로에서 추출한 언어 사용
      const target = normalizeForServer(currentLang);
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
  }, [id, data, currentLang, localized]);

  // Computed values for skeleton/mismatch detection
  const normalizedCurrentLang = normalizeForServer(currentLang).toLowerCase();
  const localizedLang = localized?.language?.toLowerCase() || '';
  const isLangMismatch = data?.status === 'completed' && localized && localizedLang !== normalizedCurrentLang && !normalizedCurrentLang.startsWith(localizedLang) && !localizedLang.startsWith(normalizedCurrentLang.split('-')[0]);

  return {
    data,
    loading,
    error,
    mounted,
    localized,
    artistName,
    artistImageUrl,
    currentLang,
    countdown,
    processing,
    invokeStatus,
    isPaid,
    i18nLoading,
    isLangMismatch,
    showAdScreen,
    refreshDetail,
    handleAdComplete,
    t,
  };
}
