'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import NavigationLink from '@/components/client/NavigationLink';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, ChevronLeft } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { ko, ja, zhCN, zhTW, vi, th, id, es, bn, enUS } from 'date-fns/locale';
import { useGoonghapStore } from '@/stores/goonghapStore';

export default function NewGoongHapPage() {
  const router = useRouter();
  const { tDynamic: t } = useTranslations();
  const { getLocalizedPath, currentLocale } = useLocaleRouter();

  // 아티스트 이름을 현재 로케일 우선, en fallback으로 가져오는 헬퍼 함수
  const getArtistName = (name: any): string => {
    if (typeof name === 'string') return name;
    if (!name) return '';
    // 현재 로케일 → en → ko 순서로 fallback
    return name[currentLocale] || name['en'] || name['ko'] || '';
  };
  const { userProfile, isInitialized } = useAuth();
  const { setCachedResult } = useGoonghapStore();

  // date-fns 로케일 매핑 (지원하지 않는 로케일은 enUS fallback)
  const dateLocaleMap: Record<string, any> = {
    ko, ja, 'zh-cn': zhCN, 'zh-tw': zhTW, vi, th, id, es, bn, en: enUS
  };
  const dateLocale = dateLocaleMap[currentLocale] || enUS;

  // 클라이언트 마운트 상태 (hydration mismatch 방지)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<Array<{ id: number; name: any; image?: string | null }>>([]);
  const [myArtists, setMyArtists] = useState<Array<{ id: number; name: any; image?: string | null }>>([]);
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [birthTimeAnimal, setBirthTimeAnimal] = useState<string>(''); // 동물시 코드: 자시부터 1~12
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [agreeSaveProfile, setAgreeSaveProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const [edgeInvokeInfo, setEdgeInvokeInfo] = useState<{ ok: boolean; message?: string } | null>(null);

  // 중복 궁합 다이얼로그 상태
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<{ id: string; score: number | null; created_at: string; details?: any; tips?: any; goonghap_results_i18n?: any[] } | null>(null);

  // 동물시(十二支) 매핑 - 번역 키 사용
  const ANIMAL_TIME_SLOTS: Array<{ key: string; translationKey: string }> = [
    { key: '1',  translationKey: 'goonghap_time_slot1' },
    { key: '2',  translationKey: 'goonghap_time_slot2' },
    { key: '3',  translationKey: 'goonghap_time_slot3' },
    { key: '4',  translationKey: 'goonghap_time_slot4' },
    { key: '5',  translationKey: 'goonghap_time_slot5' },
    { key: '6',  translationKey: 'goonghap_time_slot6' },
    { key: '7',  translationKey: 'goonghap_time_slot7' },
    { key: '8',  translationKey: 'goonghap_time_slot8' },
    { key: '9',  translationKey: 'goonghap_time_slot9' },
    { key: '10', translationKey: 'goonghap_time_slot10' },
    { key: '11', translationKey: 'goonghap_time_slot11' },
    { key: '12', translationKey: 'goonghap_time_slot12' },
  ];

  // 번역된 시간 슬롯 파싱 함수: "이름|(시간범위)|이모지" 형식
  const parseTimeSlot = (translatedValue: string) => {
    const parts = translatedValue.split('|');
    const name = parts[0]?.trim() || '';
    const timeRange = parts[1]?.replace(/[()]/g, '').trim() || '';
    const emoji = parts[2]?.trim() || '🕐';
    return { name, timeRange, emoji };
  };

  const legacyAnimalKeyToCode: Record<string, string> = {
    ja: '1', chuk: '2', in: '3', myo: '4', jin: '5', sa: '6', o: '7', mi: '8', sin: '9', yu: '10', sul: '11', ha: '12'
  };

  function hourToAnimalCode(hour: number): string {
    if (hour === 23 || hour === 0) return '1';
    const code = Math.floor((hour + 1) / 2) + 1;
    return String(Math.min(Math.max(code, 1), 12));
  }

  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        // 먼저 userId를 state에 설정해 이후 프리필 UI가 즉시 반영되도록 함
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          setUserId(user.id);
          // 내 아티스트 불러오기 (즐겨찾기/북마크)
          try {
            const { data } = await supabase
              .from('artist_user_bookmark')
              .select('artist:artist(id,name,image)')
              .eq('user_id', user.id)
              .limit(50);
            const mapped = (data || []).map((row: any) => row.artist).filter(Boolean);
            setMyArtists(mapped);
          } catch {}

          // 프로필 프리필: 생일/성별/출생시간
          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            // 스키마가 환경별로 다를 수 있어 안전 접근 사용
            // 생일 컬럼 후보: birthday(date), birth_date(date), birthdate(text), user_birth_date(text)
            const bdRaw = (profile as any)?.birthday || (profile as any)?.birth_date || (profile as any)?.birthdate || (profile as any)?.user_birth_date;
            if (bdRaw) {
              let parsedDate: Date | null = null;
              if (typeof bdRaw === 'string') {
                const s = bdRaw.trim();
                // 1) yyyy-mm-dd
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                  parsedDate = new Date(s);
                // 2) yyyymmdd
                } else if (/^\d{8}$/.test(s)) {
                  parsedDate = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
                // 3) ISO
                } else {
                  parsedDate = new Date(s);
                }
              } else {
                // date 타입일 수 있음
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

  // 실시간 검색: 디바운스 300ms
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


  // 새 궁합 생성 로직 (기존 결과가 있으면 데이터 복사)
  const createNewGoonghap = async (existingResult?: { id: string; score: number | null; details?: any; tips?: any; goonghap_results_i18n?: any[] } | null) => {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { throw new Error(t('common.auth.login') || '로그인이 필요합니다'); }

      // 필수: idol_birth_date (NOT NULL) 확보
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
        // 무시하고 아래에서 처리
      }

      if (!idolBirthDateIso) {
        throw new Error(t('goonghap_error_no_artist_birthday', '선택한 아티스트의 생일 정보를 찾을 수 없습니다. 다른 아티스트를 선택해 주세요.'));
      }

      // 새 궁합 생성 (기존 결과가 있으면 데이터 복사)
      const payload: any = {
        user_id: user.id,
        artist_id: selectedArtistId!,
        user_birth_date: birthDate!.toISOString(),
        user_birth_time: birthTimeAnimal || null,
        gender: gender,
        status: existingResult ? 'completed' : 'pending', // 기존 결과 있으면 바로 completed
        is_paid: false,
        is_ads: false, // 30초 광고 대기 필요
        idol_birth_date: idolBirthDateIso,
        // 기존 결과 데이터 복사
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

      // 기존 결과가 있으면 i18n 데이터도 복사
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

      // 기존 결과가 없으면 백그라운드 처리 트리거
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

      // 캐시에 저장하여 상세 페이지에서 즉시 광고 화면 표시
      setCachedResult(newId, {
        id: newId,
        artist_id: selectedArtistId!,
        score: existingResult?.score ?? null,
        status: existingResult ? 'completed' : 'pending',
        is_paid: false,
        is_ads: false, // 30초 광고 대기 필요
        created_at: new Date().toISOString(),
      });

      // 상세 페이지로 이동
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

      // 기존 궁합 확인: 같은 user_id, artist_id, user_birth_date, user_birth_time, gender 조합
      const userBirthDateOnly = birthDate!.toISOString().split('T')[0]; // YYYY-MM-DD
      let existingQuery = supabase
        .from('goonghap_results')
        .select('id, score, status, details, tips, created_at, goonghap_results_i18n(*)')
        .eq('user_id', user.id)
        .eq('artist_id', selectedArtistId!)
        .eq('gender', gender as 'male' | 'female')
        .eq('status', 'completed') // 완료된 결과만
        .gte('user_birth_date', `${userBirthDateOnly}T00:00:00.000Z`)
        .lt('user_birth_date', `${userBirthDateOnly}T23:59:59.999Z`);

      // birth_time이 있으면 추가 조건
      if (birthTimeAnimal) {
        existingQuery = existingQuery.eq('user_birth_time', birthTimeAnimal);
      } else {
        existingQuery = existingQuery.is('user_birth_time', null);
      }

      const { data: existingResults } = await existingQuery.order('created_at', { ascending: false }).limit(1);
      const existingResult = existingResults?.[0];

      if (existingResult) {
        // 중복 궁합 발견 - 다이얼로그 표시
        setDuplicateResult(existingResult);
        setShowDuplicateDialog(true);
        setSubmitting(false);
        return;
      }

      // 중복 없음 - 바로 생성
      await createNewGoonghap(null);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
      setSubmitting(false);
    }
  };

  // 클라이언트 마운트 전까지는 로딩 표시 (hydration mismatch 방지)
  if (!mounted || !isInitialized) {
    return (
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-2xl mx-auto'>
          <div className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm text-gray-600'>
            {t('common.loading') || '불러오는 중...'}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-2xl mx-auto'>
          {/* 헤더 영역 */}
          <div className='mb-8'>
            {/* 뒤로 가기 버튼 + 제목 */}
            <div className='flex items-center gap-4 mb-4'>
              <button
                type='button'
                onClick={() => router.back()}
                className='inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-600 transition-colors'
                aria-label={t('common_back', '뒤로가기')}
              >
                <ChevronLeft className='w-5 h-5' />
              </button>
              <h1 className='text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                궁합
              </h1>
              <div className='flex flex-col'>
                <span className='text-xl font-bold text-gray-600'>宮合</span>
                <span className='text-sm text-gray-400'>Goong-Hap</span>
              </div>
            </div>
            <p className='text-gray-600'>
              {t('goonghap_new_compatibility_ask', '새로운 Goong-Hap을 확인해 보세요')}
            </p>
          </div>

        {/* 비로그인 상태 - 로그인 유도 */}
        {!userId && (
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg p-8 text-center'>
            <div className='w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center'>
              <span className='text-4xl'>💫</span>
            </div>
            <h3 className='text-gray-900 font-bold text-lg mb-2'>
              {t('goongHap.loginRequired.title', '로그인이 필요해요')}
            </h3>
            <p className='text-gray-600 mb-6'>
              {t('goongHap.loginRequired.description', '궁합을 확인하려면 로그인해 주세요')}
            </p>
            <NavigationLink
              href={getLocalizedPath('/mypage')}
              className='inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg'
            >
              <LogIn className='w-5 h-5' />
              {t('common.login', '로그인')}
            </NavigationLink>
          </div>
        )}

        {/* 로그인 된 경우에만 폼 표시 */}
        {userId && (
          <>
        {error && (
          <div className='rounded-xl border border-red-200 p-4 bg-red-50 text-red-700 mb-4'>{error}</div>
        )}
        {edgeInvokeInfo && (
          <div className={`rounded-xl p-4 mb-4 shadow-sm ${edgeInvokeInfo.ok ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
            {edgeInvokeInfo.ok ? t('goonghap_request_success', '처리 요청을 정상적으로 전달했습니다.') : `${t('goonghap_request_error', '처리 요청 중 문제가 발생했습니다')}: ${edgeInvokeInfo.message || ''}`}
          </div>
        )}

        <form onSubmit={handleSubmit} className='space-y-6'>
          {/* 아이돌 검색 섹션 */}
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
            {/* 섹션 헤더 */}
            <div className='bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-3'>
              <div className='flex items-center gap-2'>
                <span className='text-lg'>🎤</span>
                <h2 className='text-white font-bold'>{t('goonghap_select_artist', '아티스트 선택')}</h2>
              </div>
            </div>

            <div className='p-5'>
              {/* 검색 입력 */}
              <div className='relative'>
                <input
                  type='text'
                  value={artistQuery}
                  onChange={(e) => setArtistQuery(e.target.value)}
                  className='w-full border-2 border-purple-200 rounded-xl px-4 py-3 pl-10 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all bg-white/50'
                  placeholder={t('goonghap_search_artist', '아티스트 이름으로 검색')}
                />
                <span className='absolute left-3 top-1/2 -translate-y-1/2 text-purple-400'>🔍</span>
              </div>

              {/* 선택된 아티스트 표시 */}
              {selectedArtistId && (() => {
                const selectedArtist = [...myArtists, ...artistResults].find(a => a.id === selectedArtistId);
                if (!selectedArtist) return null;
                const name = getArtistName(selectedArtist.name);
                return (
                  <div className='mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300'>
                    <p className='text-xs text-purple-600 font-medium mb-2'>{t('goonghap_selected', '선택됨')}</p>
                    <div className='flex items-center gap-3'>
                      <div className='w-12 h-12 rounded-full overflow-hidden ring-2 ring-purple-400 ring-offset-2'>
                        {selectedArtist.image ? (
                          <OptimizedImage
                            src={selectedArtist.image}
                            alt={name}
                            width={48}
                            height={48}
                            className='w-full h-full object-cover'
                          />
                        ) : (
                          <div className='w-full h-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center text-purple-600 font-bold'>
                            {name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className='font-bold text-gray-900'>{name}</span>
                    </div>
                  </div>
                );
              })()}

              {/* 나의 아티스트 */}
              {myArtists.length > 0 && (
                <div className='mt-4'>
                  <p className='text-sm font-medium text-purple-600 mb-3 flex items-center gap-1'>
                    <span>⭐</span> {t('goonghap_my_artists', '나의 아티스트')}
                  </p>
                  <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
                    {myArtists.map((a) => {
                      const name = getArtistName(a.name);
                      const isSelected = selectedArtistId === a.id;
                      return (
                        <button
                          key={a.id}
                          type='button'
                          onClick={() => setSelectedArtistId(a.id)}
                          className={`flex items-center gap-2 p-2 rounded-xl transition-all ${
                            isSelected
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                              : 'bg-white hover:bg-purple-50 border border-purple-100 hover:border-purple-300'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ${isSelected ? 'ring-2 ring-white' : ''}`}>
                            {a.image ? (
                              <OptimizedImage
                                src={a.image}
                                alt={name}
                                width={32}
                                height={32}
                                className='w-full h-full object-cover'
                              />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-600'}`}>
                                {name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <span className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-gray-700'}`}>{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 검색 결과 */}
              {artistResults.length > 0 && (
                <div className='mt-4'>
                  <p className='text-sm font-medium text-gray-500 mb-2'>{t('goonghap_search_results', '검색 결과')}</p>
                  <div className='max-h-56 overflow-auto rounded-xl border border-purple-100 divide-y divide-purple-50'>
                    {artistResults.map((a) => {
                      const name = getArtistName(a.name);
                      const isSelected = selectedArtistId === a.id;
                      return (
                        <button
                          key={a.id}
                          type='button'
                          onClick={() => setSelectedArtistId(a.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${
                            isSelected
                              ? 'bg-gradient-to-r from-purple-100 to-pink-100'
                              : 'bg-white hover:bg-purple-50'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ${isSelected ? 'ring-2 ring-purple-400' : ''}`}>
                            {a.image ? (
                              <OptimizedImage
                                src={a.image}
                                alt={name}
                                width={40}
                                height={40}
                                className='w-full h-full object-cover'
                              />
                            ) : (
                              <div className='w-full h-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center text-purple-600 text-sm font-bold'>
                                {name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <span className={`text-sm font-medium ${isSelected ? 'text-purple-700' : 'text-gray-900'}`}>{name}</span>
                          {isSelected && <span className='ml-auto text-purple-500'>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 내 정보 섹션 */}
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
            {/* 섹션 헤더 */}
            <div className='bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3'>
              <div className='flex items-center gap-2'>
                <span className='text-lg'>✨</span>
                <h2 className='text-white font-bold'>{t('goonghap_my_info', '내 정보')}</h2>
              </div>
            </div>

            <div className='p-5 space-y-5'>
              {/* 생년월일 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1'>
                  <span>🎂</span> {t('goonghap_birthday', '내 생일')}
                </label>
                <DatePicker
                  selected={birthDate}
                  onChange={(date) => setBirthDate(date)}
                  locale={dateLocale}
                  dateFormat="yyyy-MM-dd"
                  showYearDropdown
                  showMonthDropdown
                  dropdownMode="select"
                  yearDropdownItemNumber={100}
                  scrollableYearDropdown
                  maxDate={new Date()}
                  minDate={new Date(1900, 0, 1)}
                  placeholderText={t('goonghap_birthday_placeholder', '생년월일 선택')}
                  className='w-full border-2 border-pink-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all bg-white/50'
                  wrapperClassName='w-full'
                  withPortal
                  portalId='datepicker-portal'
                />
              </div>

              {/* 성별 */}
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1'>
                  <span>👤</span> {t('goonghap_gender', '성별')}
                </label>
                <div className='grid grid-cols-2 gap-3'>
                  <button
                    type='button'
                    onClick={() => setGender('male')}
                    className={`py-3 px-4 rounded-xl font-medium transition-all ${
                      gender === 'male'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <span className='mr-1'>♂</span> {t('goonghap_gender_male', '남성')}
                  </button>
                  <button
                    type='button'
                    onClick={() => setGender('female')}
                    className={`py-3 px-4 rounded-xl font-medium transition-all ${
                      gender === 'female'
                        ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md'
                        : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-pink-300'
                    }`}
                  >
                    <span className='mr-1'>♀</span> {t('goonghap_gender_female', '여성')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 출생 시간 (동물시) 섹션 */}
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
            {/* 섹션 헤더 */}
            <div className='bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-3'>
              <div className='flex items-center gap-2'>
                <span className='text-lg'>🕐</span>
                <h2 className='text-white font-bold'>{t('goonghap_birth_time', '출생 시간')}</h2>
                <span className='text-xs bg-white/20 text-white px-2 py-0.5 rounded-full'>{t('common_optional', '선택')}</span>
              </div>
            </div>

            <div className='p-5'>
              <p className='text-sm text-gray-500 mb-4'>{t('goonghap_birth_time_desc', '더 정확한 궁합을 위해 출생 시간을 선택해 주세요')}</p>
              <div className='grid grid-cols-3 sm:grid-cols-4 gap-2'>
                {/* 모름 버튼 */}
                <button
                  type='button'
                  onClick={() => setBirthTimeAnimal('')}
                  className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 ${
                    !birthTimeAnimal
                      ? 'bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-md scale-105'
                      : 'bg-white border border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <span className='text-2xl'>❓</span>
                  <span className={`text-xs font-medium ${!birthTimeAnimal ? 'text-white' : 'text-gray-700'}`}>{t('goonghap_time_slot_unknown', '모름')}</span>
                </button>
                {ANIMAL_TIME_SLOTS.map((slot) => {
                  const isSelected = birthTimeAnimal === slot.key;
                  const translatedValue = t(slot.translationKey, '');
                  const { name, timeRange, emoji } = parseTimeSlot(translatedValue);
                  return (
                    <button
                      key={slot.key}
                      type='button'
                      onClick={() => setBirthTimeAnimal(isSelected ? '' : slot.key)}
                      className={`p-2 sm:p-3 rounded-xl transition-all flex flex-col items-center gap-0.5 ${
                        isSelected
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-md scale-105'
                          : 'bg-white border border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      <span className='text-xl sm:text-2xl'>{emoji}</span>
                      <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-gray-700'}`}>{name}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>{timeRange}</span>
                    </button>
                  );
                })}
              </div>
              {birthTimeAnimal && (() => {
                const selectedSlot = ANIMAL_TIME_SLOTS.find(s => s.key === birthTimeAnimal);
                if (!selectedSlot) return null;
                const translatedValue = t(selectedSlot.translationKey, '');
                const { name, timeRange, emoji } = parseTimeSlot(translatedValue);
                return (
                  <p className='mt-3 text-sm text-purple-600 text-center'>
                    {emoji} {name} ({timeRange})
                  </p>
                );
              })()}
            </div>
          </div>

          {/* 저장 동의 & 제출 */}
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg p-5'>
            <label className='flex items-center gap-3 cursor-pointer group'>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                agreeSaveProfile
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-transparent'
                  : 'border-gray-300 group-hover:border-purple-400'
              }`}>
                {agreeSaveProfile && <span className='text-white text-sm'>✓</span>}
              </div>
              <input
                type='checkbox'
                checked={agreeSaveProfile}
                onChange={(e) => setAgreeSaveProfile(e.target.checked)}
                className='sr-only'
              />
              <span className='text-sm text-gray-700'>{t('goonghap_agree_save', '내 정보(생일/성별) 저장에 동의합니다.')}</span>
            </label>

            <button
              type='submit'
              disabled={!canSubmit || submitting}
              className={`mt-5 w-full py-4 rounded-xl font-bold text-lg transition-all ${
                (!canSubmit || submitting)
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg hover:shadow-xl hover:from-purple-600 hover:to-pink-600 active:scale-[0.98]'
              }`}
            >
              {submitting ? (
                <span className='flex items-center justify-center gap-2'>
                  <span className='w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin'></span>
                  {t('common_processing', '처리 중...')}
                </span>
              ) : (
                <span className='flex items-center justify-center gap-2'>
                  <span>💫</span>
                  {t('goonghap_calculate', '궁합 계산하기')}
                </span>
              )}
            </button>
          </div>
        </form>
          </>
        )}
        </div>
      </div>
      {/* DatePicker 포털 컨테이너 */}
      <div id='datepicker-portal' />

      {/* 중복 궁합 확인 다이얼로그 */}
      {showDuplicateDialog && duplicateResult && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
          onClick={() => setShowDuplicateDialog(false)}
        >
          <div
            className='bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden'
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className='bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4'>
              <h3 className='text-white text-lg font-bold text-center'>
                {t('goonghap_duplicate_data_title', '이미 존재하는 궁합 데이터')}
              </h3>
            </div>

            {/* 본문 */}
            <div className='px-6 py-5 space-y-4'>
              <div className='text-center'>
                <span className='text-4xl'>💫</span>
              </div>
              <p className='text-gray-700 text-center'>
                {t('goonghap_duplicate_data_message', '동일한 조건의 궁합 데이터가 이미 존재합니다.')}
              </p>

              {/* 기존 결과 정보 */}
              {duplicateResult.score !== null && (
                <div className='flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg'>
                  <span className='text-gray-600 text-sm'>{t('goonghap_score', '궁합 점수')}</span>
                  <span className='text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent'>
                    {duplicateResult.score}
                  </span>
                  <span className='text-gray-500 text-sm'>pt</span>
                </div>
              )}

              <p className='text-xs text-gray-500 text-center'>
                {new Date(duplicateResult.created_at).toLocaleDateString()}
              </p>

              {/* 앱과 동일한 안내 메시지 */}
              <p className='text-sm text-gray-600 text-center font-medium'>
                {t('goonghap_new_ask', '새로 분석하시겠습니까?')}
              </p>
            </div>

            {/* 버튼 영역 */}
            <div className='px-6 pb-5 flex gap-3'>
              <button
                type='button'
                onClick={() => setShowDuplicateDialog(false)}
                className='flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors'
              >
                {t('button_cancel', '취소')}
              </button>
              <button
                type='button'
                disabled={submitting}
                onClick={async () => {
                  setShowDuplicateDialog(false);
                  // 새 궁합 생성 (기존 데이터 복사)
                  await createNewGoonghap(duplicateResult);
                }}
                className='flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50'
              >
                {submitting ? t('common_processing', '처리 중...') : t('goonghap_analyze_start', '분석 시작')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


