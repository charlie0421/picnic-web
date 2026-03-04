import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useAuth } from '@/hooks/useAuth';
import { useGoonghapStore } from '@/stores/goonghapStore';
import { legacyAnimalKeyToCode, hourToAnimalCode } from './goong-hap-constants';

export function useGoonghapForm() {
  const router = useRouter();
  const { tDynamic: t } = useTranslations();
  const { getLocalizedPath, currentLocale } = useLocaleRouter();
  const { userProfile, isInitialized } = useAuth();
  const { setCachedResult } = useGoonghapStore();

  // Client mount state (prevent hydration mismatch)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<Array<{ id: number; name: any; image?: string | null }>>([]);
  const [myArtists, setMyArtists] = useState<Array<{ id: number; name: any; image?: string | null }>>([]);
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthTimeAnimal, setBirthTimeAnimal] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [agreeSaveProfile, setAgreeSaveProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const [edgeInvokeInfo, setEdgeInvokeInfo] = useState<{ ok: boolean; message?: string } | null>(null);

  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<{ id: string; score: number | null; created_at: string; details?: any; tips?: any; goonghap_results_i18n?: any[] } | null>(null);

  // Profile prefill: birthday/gender/birth time
  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
          // Load my artists (bookmarks)
          try {
            const { data } = await supabase
              .from('artist_user_bookmark')
              .select('artist:artist(id,name,image)')
              .eq('user_id', user.id)
              .limit(50);
            const mapped = (data || []).map((row: any) => row.artist).filter(Boolean);
            setMyArtists(mapped);
          } catch {}

          // Profile prefill
          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            const bdRaw = (profile as any)?.birthday || (profile as any)?.birth_date || (profile as any)?.birthdate || (profile as any)?.user_birth_date;
            if (bdRaw) {
              let parsedDate: Date | null = null;
              if (typeof bdRaw === 'string') {
                const s = bdRaw.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                  parsedDate = new Date(s);
                } else if (/^\d{8}$/.test(s)) {
                  parsedDate = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
                } else {
                  parsedDate = new Date(s);
                }
              } else {
                parsedDate = new Date(bdRaw);
              }
              if (parsedDate && !isNaN(parsedDate.getTime())) setBirthDate(parsedDate);
            }
            const g = (profile as any)?.gender;
            if (g === 'male' || g === 'female') setGender(g);
            const bt = (profile as any)?.birth_time || (profile as any)?.user_birth_time;
            if (bt) {
              let code = String(bt);
              if (legacyAnimalKeyToCode[code]) {
                code = legacyAnimalKeyToCode[code];
              } else if (/^\d{1,2}:\d{2}$/.test(code)) {
                const hr = parseInt(code.split(':')[0], 10);
                if (!isNaN(hr)) code = hourToAnimalCode(hr);
              }
              if (/^(?:[1-9]|1[0-2])$/.test(code)) setBirthTimeAnimal(code);
            }
          } catch {}
        } else {
          setUserId(null);
        }
      } catch {}
    })();
  }, []);

  const canSubmit = useMemo(() => {
    return !!selectedArtistId && !!birthDate && !!gender && agreeSaveProfile && !!userId;
  }, [selectedArtistId, birthDate, gender, agreeSaveProfile, userId]);

  const handleSearchArtists = async () => {
    try {
      setError(null);
      const supabase = createBrowserSupabaseClient();
      const q = artistQuery?.trim();
      if (!q) { setArtistResults([]); return; }
      const { data, error } = await supabase
        .from('artist')
        .select('id,name,image')
        .or(`name->>ko.ilike.%${q}%,name->>en.ilike.%${q}%,name->>ja.ilike.%${q}%`)
        .order('id', { ascending: true })
        .limit(20);
      if (error) throw error;
      setArtistResults((data || []) as any);
    } catch (e: any) {
      setError(e?.message || 'Search failed');
    }
  };

  // Debounced search: 300ms
  useEffect(() => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    searchTimer.current = window.setTimeout(() => {
      handleSearchArtists();
    }, 300) as unknown as number;
    return () => {
      if (searchTimer.current) {
        window.clearTimeout(searchTimer.current);
        searchTimer.current = null;
      }
    };
  }, [artistQuery]);

  // Create new goonghap (copy data from existing result if available)
  const createNewGoonghap = async (existingResult?: { id: string; score: number | null; details?: any; tips?: any; goonghap_results_i18n?: any[] } | null) => {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { throw new Error(t('common.auth.login') || '로그인이 필요합니다'); }

      // Get idol_birth_date (NOT NULL required)
      let idolBirthDateIso: string | null = null;
      try {
        const { data: artistRow, error: artistErr } = await supabase
          .from('artist')
          .select('id, birth_date, yy, mm, dd')
          .eq('id', selectedArtistId!)
          .single();
        if (artistErr) throw artistErr;

        const bdStr = (artistRow as any)?.birth_date as string | null;
        const yy = (artistRow as any)?.yy as number | null;
        const mm = (artistRow as any)?.mm as number | null;
        const dd = (artistRow as any)?.dd as number | null;

        if (bdStr && typeof bdStr === 'string') {
          const d = new Date(bdStr);
          if (!isNaN(d.getTime())) idolBirthDateIso = d.toISOString();
        } else if (yy && mm && dd) {
          const d = new Date(yy, Math.max(0, mm - 1), dd);
          if (!isNaN(d.getTime())) idolBirthDateIso = d.toISOString();
        }
      } catch (e) {
        // Ignored, handled below
      }

      if (!idolBirthDateIso) {
        throw new Error(t('goonghap_error_no_artist_birthday', '선택한 아티스트의 생일 정보를 찾을 수 없습니다. 다른 아티스트를 선택해 주세요.'));
      }

      const payload: any = {
        user_id: user.id,
        artist_id: selectedArtistId!,
        user_birth_date: birthDate!.toISOString(),
        user_birth_time: birthTimeAnimal || null,
        gender: gender,
        status: existingResult ? 'completed' : 'pending',
        is_paid: false,
        is_ads: false,
        idol_birth_date: idolBirthDateIso,
        ...(existingResult && {
          score: existingResult.score,
          details: existingResult.details,
          tips: existingResult.tips,
          completed_at: new Date().toISOString(),
        }),
      };

      const { data, error } = await supabase
        .from('goonghap_results')
        .insert(payload)
        .select('id')
        .single<{ id: string }>();
      if (error) throw error;

      const newId = data.id;

      // Copy i18n data if existing result
      if (existingResult && existingResult.goonghap_results_i18n) {
        const i18nRows = existingResult.goonghap_results_i18n as any[];
        if (i18nRows.length > 0) {
          const i18nPayloads = i18nRows.map((row: any) => ({
            goonghap_id: newId,
            language: row.language,
            score_title: row.score_title,
            goonghap_summary: row.goonghap_summary,
            details: row.details,
            tips: row.tips,
          }));
          await supabase.from('goonghap_results_i18n').insert(i18nPayloads);
        }
      }

      // Trigger background processing if no existing result
      if (!existingResult) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke('goonghap', { body: { goonghap_id: newId } });
          if (fnError) {
            setEdgeInvokeInfo({ ok: false, message: fnError.message });
          } else {
            setEdgeInvokeInfo({ ok: true });
          }
        } catch (edgeErr: any) {
          setEdgeInvokeInfo({ ok: false, message: String(edgeErr?.message || edgeErr) });
        }
      }

      // Cache result for immediate display on detail page
      setCachedResult(newId, {
        id: newId,
        artist_id: selectedArtistId!,
        score: existingResult?.score ?? null,
        status: existingResult ? 'completed' : 'pending',
        is_paid: false,
        is_ads: false,
        created_at: new Date().toISOString(),
      });

      // Navigate to detail page
      window.location.href = getLocalizedPath(`/goong-hap/${newId}`);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { throw new Error(t('common.auth.login') || '로그인이 필요합니다'); }

      const userBirthDateOnly = birthDate!.toISOString().split('T')[0];
      let existingQuery = supabase
        .from('goonghap_results')
        .select('id, score, status, details, tips, created_at, goonghap_results_i18n(*)')
        .eq('user_id', user.id)
        .eq('artist_id', selectedArtistId!)
        .eq('gender', gender as 'male' | 'female')
        .eq('status', 'completed')
        .gte('user_birth_date', `${userBirthDateOnly}T00:00:00.000Z`)
        .lt('user_birth_date', `${userBirthDateOnly}T23:59:59.999Z`);

      if (birthTimeAnimal) {
        existingQuery = existingQuery.eq('user_birth_time', birthTimeAnimal);
      } else {
        existingQuery = existingQuery.is('user_birth_time', null);
      }

      const { data: existingResults } = await existingQuery.order('created_at', { ascending: false }).limit(1);
      const existingResult = existingResults?.[0];

      if (existingResult) {
        setDuplicateResult(existingResult);
        setShowDuplicateDialog(true);
        setSubmitting(false);
        return;
      }

      await createNewGoonghap(null);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
      setSubmitting(false);
    }
  };

  return {
    // routing
    router,
    t,
    getLocalizedPath,
    currentLocale,
    // state
    mounted,
    artistQuery,
    setArtistQuery,
    artistResults,
    myArtists,
    selectedArtistId,
    setSelectedArtistId,
    birthDate,
    setBirthDate,
    birthTimeAnimal,
    setBirthTimeAnimal,
    gender,
    setGender,
    agreeSaveProfile,
    setAgreeSaveProfile,
    submitting,
    error,
    userId,
    edgeInvokeInfo,
    showDuplicateDialog,
    setShowDuplicateDialog,
    duplicateResult,
    canSubmit,
    handleSubmit,
    createNewGoonghap,
    isInitialized,
  };
}
