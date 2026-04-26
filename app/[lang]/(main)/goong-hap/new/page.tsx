'use client';

import React from 'react';
import NavigationLink from '@/components/client/NavigationLink';
import { LogIn, ChevronLeft } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { enUS } from 'date-fns/locale';
import { ANIMAL_TIME_SLOTS, dateLocaleMap, parseTimeSlot } from './goong-hap-constants';
import { useGoonghapForm } from './useGoonghapForm';
import ArtistSearchSection from './ArtistSearchSection';
import DuplicateDialog from './DuplicateDialog';

export default function NewGoongHapPage() {
  const {
    router,
    t,
    getLocalizedPath,
    currentLocale,
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
  } = useGoonghapForm();

  const dateLocale = dateLocaleMap[currentLocale] || enUS;

  // Loading state (prevent hydration mismatch)
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
          {/* Header */}
          <div className='mb-8'>
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

        {/* Not logged in - prompt login */}
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

        {/* Show form only when logged in */}
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
          {/* Artist search section */}
          <ArtistSearchSection
            artistQuery={artistQuery}
            setArtistQuery={setArtistQuery}
            artistResults={artistResults}
            myArtists={myArtists}
            selectedArtistId={selectedArtistId}
            setSelectedArtistId={setSelectedArtistId}
            t={t}
            currentLocale={currentLocale}
          />

          {/* User info section */}
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
            <div className='bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3'>
              <div className='flex items-center gap-2'>
                <span className='text-lg'>✨</span>
                <h2 className='text-white font-bold'>{t('goonghap_my_info', '내 정보')}</h2>
              </div>
            </div>

            <div className='p-5 space-y-5'>
              {/* Birthday */}
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

              {/* Gender */}
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

          {/* Birth time (animal zodiac) section */}
          <div className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
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
                {/* Unknown button */}
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

          {/* Consent & submit */}
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
      {/* DatePicker portal container */}
      <div id='datepicker-portal' />

      {/* Duplicate goonghap dialog */}
      {duplicateResult && (
        <DuplicateDialog
          show={showDuplicateDialog}
          onClose={() => setShowDuplicateDialog(false)}
          duplicateResult={duplicateResult}
          submitting={submitting}
          onConfirm={async () => {
            setShowDuplicateDialog(false);
            await createNewGoonghap(duplicateResult);
          }}
          t={t}
        />
      )}
    </div>
  );
}
