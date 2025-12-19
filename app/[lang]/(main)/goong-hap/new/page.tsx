'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import NavigationLink from '@/components/client/NavigationLink';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { useAuth } from '@/hooks/useAuth';
import { LogIn } from 'lucide-react';

export default function NewGoongHapPage() {
  const { tDynamic: t } = useTranslations();
  const { getLocalizedPath } = useLocaleRouter();
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

  // 동물시(十二支) 매핑
  const ANIMAL_TIME_SLOTS: Array<{ key: string; label: string; range: [number, number] }> = [
    { key: '1',  label: '🐭 자시 (쥐) 23:00~01:00', range: [23, 1] },
    { key: '2',  label: '🐮 축시 (소) 01:00~03:00', range: [1, 3] },
    { key: '3',  label: '🐯 인시 (호랑이) 03:00~05:00', range: [3, 5] },
    { key: '4',  label: '🐰 묘시 (토끼) 05:00~07:00', range: [5, 7] },
    { key: '5',  label: '🐲 진시 (용) 07:00~09:00', range: [7, 9] },
    { key: '6',  label: '🐍 사시 (뱀) 09:00~11:00', range: [9, 11] },
    { key: '7',  label: '🐴 오시 (말) 11:00~13:00', range: [11, 13] },
    { key: '8',  label: '🐑 미시 (양) 13:00~15:00', range: [13, 15] },
    { key: '9',  label: '🐒 신시 (원숭이) 15:00~17:00', range: [15, 17] },
    { key: '10', label: '🐔 유시 (닭) 17:00~19:00', range: [17, 19] },
    { key: '11', label: '🐶 술시 (개) 19:00~21:00', range: [19, 21] },
    { key: '12', label: '🐷 해시 (돼지) 21:00~23:00', range: [21, 23] },
  ];

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
        throw new Error('선택한 아티스트의 생일 정보를 찾을 수 없습니다. 다른 아티스트를 선택해 주세요.');
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
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-2xl mx-auto'>
          <div className='mb-4'>
            <h1 className='text-2xl sm:text-3xl font-extrabold text-gray-900'>
              {t('goonghap_new_compatibility') || '새 Goong-Hap 계산'}
            </h1>
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
            {edgeInvokeInfo.ok ? '처리 요청을 정상적으로 전달했습니다.' : `처리 요청 중 문제가 발생했습니다: ${edgeInvokeInfo.message || ''}`}
          </div>
        )}

        <form onSubmit={handleSubmit} className='rounded-xl border border-gray-200 p-6 bg-white shadow-sm text-gray-700 space-y-6'>
          {/* 아이돌 검색 */}
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>아이돌</label>
            <div className='flex gap-2'>
              <input
                type='text'
                value={artistQuery}
                onChange={(e) => setArtistQuery(e.target.value)}
                className='flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary'
                placeholder='이름으로 검색(실시간)'
              />
            </div>
            {myArtists.length > 0 && (
              <div className='mt-3'>
                <p className='text-xs text-gray-500 mb-2'>나의 아티스트</p>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                  {myArtists.map((a) => (
                    <label key={a.id} className='flex items-center gap-3 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50'>
                      <input
                        type='radio'
                        name='artist'
                        value={a.id}
                        checked={selectedArtistId === a.id}
                        onChange={() => setSelectedArtistId(a.id)}
                      />
                      <div className='w-8 h-8 rounded-full overflow-hidden flex-shrink-0'>
                        {a.image ? (
                          <OptimizedImage
                            src={a.image}
                            alt={typeof a.name === 'string' ? a.name : (a.name?.ko || a.name?.en || '')}
                            width={32}
                            height={32}
                            className='w-full h-full object-cover'
                          />
                        ) : (
                          <div className='w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs'>
                            {(typeof a.name === 'string' ? a.name : (a.name?.ko || a.name?.en || '')).charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className='text-sm text-gray-900'>{typeof a.name === 'string' ? a.name : (a.name?.ko || a.name?.en || a.name?.ja || '')}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {artistResults.length > 0 && (
              <div className='mt-3 max-h-56 overflow-auto border border-gray-200 rounded-lg divide-y'>
                {artistResults.map((a) => (
                  <label key={a.id} className='flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50'>
                    <input
                      type='radio'
                      name='artist'
                      value={a.id}
                      checked={selectedArtistId === a.id}
                      onChange={() => setSelectedArtistId(a.id)}
                    />
                    <div className='w-8 h-8 rounded-full overflow-hidden flex-shrink-0'>
                      {a.image ? (
                        <OptimizedImage
                          src={a.image}
                          alt={typeof a.name === 'string' ? a.name : (a.name?.ko || a.name?.en || '')}
                          width={32}
                          height={32}
                          className='w-full h-full object-cover'
                        />
                      ) : (
                        <div className='w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs'>
                          {(typeof a.name === 'string' ? a.name : (a.name?.ko || a.name?.en || '')).charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className='text-sm text-gray-900'>{typeof a.name === 'string' ? a.name : (a.name?.ko || a.name?.en || a.name?.ja || '')}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 생년월일 */}
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>내 생일</label>
            <input
              type='date'
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className='border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary'
            />
          </div>

          {/* 출생 시간 (동물시) */}
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>출생 시간 (동물시)</label>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
              {ANIMAL_TIME_SLOTS.map((slot) => (
                <label key={slot.key} className='flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50'>
                  <input
                    type='radio'
                    name='birth_time_animal'
                    value={slot.key}
                    checked={birthTimeAnimal === slot.key}
                    onChange={() => setBirthTimeAnimal(slot.key)}
                  />
                  <span className='text-sm text-gray-900'>{slot.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 성별 */}
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>성별</label>
            <div className='flex gap-4'>
              <label className='inline-flex items-center gap-2'>
                <input type='radio' name='gender' value='male' checked={gender==='male'} onChange={() => setGender('male')} />
                남성
              </label>
              <label className='inline-flex items-center gap-2'>
                <input type='radio' name='gender' value='female' checked={gender==='female'} onChange={() => setGender('female')} />
                여성
              </label>
            </div>
          </div>

          {/* 저장 동의 */}
          <div>
            <label className='inline-flex items-center gap-2'>
              <input type='checkbox' checked={agreeSaveProfile} onChange={(e) => setAgreeSaveProfile(e.target.checked)} />
              <span className='text-sm text-gray-700'>내 정보(생일/성별) 저장에 동의합니다.</span>
            </label>
          </div>

          <div className='pt-2'>
            <button
              type='submit'
              disabled={!canSubmit || submitting}
              className={`px-5 py-2 rounded-lg text-white ${(!canSubmit || submitting) ? 'bg-gray-400' : 'bg-primary hover:opacity-90'} transition`}
            >
              {submitting ? '처리 중...' : '궁합 계산 시작'}
            </button>
          </div>
        </form>
          </>
        )}
        </div>
      </div>
  );
}


