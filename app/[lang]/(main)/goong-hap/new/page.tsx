'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import NavigationLink from '@/components/client/NavigationLink';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, ChevronLeft } from 'lucide-react';

export default function NewGoongHapPage() {
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

  // 클라이언트 마운트 상태 (hydration mismatch 방지)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<Array<{ id: number; name: any; image?: string | null }>>([]);
  const [myArtists, setMyArtists] = useState<Array<{ id: number; name: any; image?: string | null }>>([]);
  const [selectedArtistId, setSelectedArtistId] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState(''); // yyyy-mm-dd
  const [birthTimeAnimal, setBirthTimeAnimal] = useState<string>(''); // 동물시 코드: 자시부터 1~12
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [agreeSaveProfile, setAgreeSaveProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const [edgeInvokeInfo, setEdgeInvokeInfo] = useState<{ ok: boolean; message?: string } | null>(null);

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
              let yyyyMmDd = '';
              if (typeof bdRaw === 'string') {
                const s = bdRaw.trim();
                // 1) yyyy-mm-dd
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                  yyyyMmDd = s;
                // 2) yyyymmdd
                } else if (/^\d{8}$/.test(s)) {
                  yyyyMmDd = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
                // 3) ISO
                } else {
                  const d = new Date(s);
                  if (!isNaN(d.getTime())) yyyyMmDd = d.toISOString().slice(0, 10);
                }
              } else {
                // date 타입일 수 있음
                const d = new Date(bdRaw);
                if (!isNaN(d.getTime())) yyyyMmDd = d.toISOString().slice(0, 10);
              }
              if (yyyyMmDd) setBirthDate(yyyyMmDd);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
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

      const payload: any = {
        user_id: user.id,
        artist_id: selectedArtistId!,
        user_birth_date: new Date(birthDate).toISOString(),
        user_birth_time: birthTimeAnimal || null,
        gender: gender,
        status: 'pending',
        is_paid: false,
        idol_birth_date: idolBirthDateIso,
      };

      // 아이돌 생일은 optional (앱은 artist.birthDate 사용) - 여기서는 테이블에 null 허용 시 생략
      const { data, error } = await supabase
        .from('goonghap_results')
        .insert(payload)
        .select('id')
        .single<{ id: string }>();
      if (error) throw error;

      const newId = data.id;

      // 백그라운드 처리 트리거 (앱: functions.invoke('goonghap'))
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('goonghap', { body: { goonghap_id: newId } });
        if (fnError) {
          console.error('⚠️ Edge function error:', fnError);
          setEdgeInvokeInfo({ ok: false, message: fnError.message });
        } else {
          console.log('✅ Edge function invoked:', fnData);
          setEdgeInvokeInfo({ ok: true });
        }
      } catch (edgeErr: any) {
        console.error('⚠️ Edge function exception:', edgeErr);
        setEdgeInvokeInfo({ ok: false, message: String(edgeErr?.message || edgeErr) });
      }

      // 상세 페이지로 이동
      window.location.href = getLocalizedPath(`/goong-hap/${newId}`);
    } catch (e: any) {
      setError(e?.message || 'Submit failed');
    } finally {
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
            {/* 뒤로 가기 버튼 */}
            <NavigationLink
              href={getLocalizedPath('/goong-hap')}
              className='inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 mb-4 transition-colors'
            >
              <ChevronLeft className='w-5 h-5' />
              <span className='text-sm font-medium'>{t('common_back', '뒤로')}</span>
            </NavigationLink>

            {/* 제목: 한글 → 중국어 → 영어 (브랜드 아이덴티티로 고정) */}
            <div className='flex items-center gap-4 mb-4'>
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
                <input
                  type='date'
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className='w-full border-2 border-pink-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition-all bg-white/50'
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
    </div>
  );
}


