'use client';

import { useLanguageStore } from '@/stores/languageStore';
import { useEffect, useState } from 'react';

export default function TestTranslationPage() {
  const { t, currentLanguage, translations, isTranslationLoaded, loadTranslations, syncLanguageWithPath } = useLanguageStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [manualTest, setManualTest] = useState<any>({});

  // 수동으로 번역 파일 로드 테스트
  const testManualLoad = async () => {
    try {
      const response = await fetch('/locales/ko.json');
      if (response.ok) {
        const data = await response.json();
        setManualTest({
          success: true,
          keyCount: Object.keys(data).length,
          hasNavVote: 'nav_vote' in data,
          hasAppName: 'app_name' in data,
          navVoteValue: data.nav_vote,
          appNameValue: data.app_name
        });
        console.log('🔍 Manual test result:', data.nav_vote);
      } else {
        setManualTest({ success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      setManualTest({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  // 강제로 언어 동기화
  const forceSyncLanguage = () => {
    console.log('🔄 Forcing language sync...');
    syncLanguageWithPath();
  };

  // 강제로 번역 로드
  const forceLoadTranslations = async (lang: string) => {
    console.log(`🔄 Forcing translation load for ${lang}...`);
    await loadTranslations(lang as any);
  };

  useEffect(() => {
    setIsHydrated(true);
    console.log('==================================================');
    console.log('🚀 TestTranslationPage 마운트됨');
    console.log('📍 현재 언어:', currentLanguage);
    console.log('📚 번역 로드 상태:', isTranslationLoaded);
    console.log('📖 현재 번역 데이터 키 개수:', Object.keys(translations[currentLanguage] || {}).length);
    console.log('==================================================');
    
    // 수동 테스트 실행
    testManualLoad();
    
    // 언어 동기화 실행
    syncLanguageWithPath();
  }, []);

  if (!isHydrated) {
    return <div>{t('loading')}</div>;
  }

  const currentTranslations = translations[currentLanguage] || {};
  const translationKeys = Object.keys(currentTranslations);

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">{t('translation_system_test')}</h1>

      {/* 현재 상태 */}
      <div className="bg-blue-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('current_status')}</h2>
        <div className="space-y-2">
          <p><strong>{t('current_language')}:</strong> {currentLanguage}</p>
          <p><strong>{t('url_path')}:</strong> {typeof window !== 'undefined' ? window.location.pathname : 'N/A'}</p>
          <p><strong>{t('translation_load_status')}:</strong> {JSON.stringify(isTranslationLoaded)}</p>
          <p><strong>{t('translation_key_count')}:</strong> {translationKeys.length}</p>
          <p><strong>{t('loading_status')}:</strong> {isHydrated ? 'No' : 'Yes'}</p>
        </div>
      </div>

      {/* 컨트롤 버튼들 */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('controls')}</h2>
        <div className="space-x-4">
          <button 
            onClick={forceSyncLanguage}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {t('force_language_sync')}
          </button>
          <button 
            onClick={() => forceLoadTranslations('ko')}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            {t('force_load_korean')}
          </button>
          <button 
            onClick={() => forceLoadTranslations('ja')}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            {t('force_load_japanese')}
          </button>
          <button 
            onClick={testManualLoad}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            {t('manual_file_load_test')}
          </button>
        </div>
      </div>

      {/* 수동 테스트 결과 */}
      <div className="bg-yellow-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('manual_file_load_test')}</h2>
        {manualTest.success ? (
          <div className="text-green-700">
            <p>✅ {t('file_load_success')}</p>
            <p>{t('key_count')}: {manualTest.keyCount}</p>
            <p>nav_vote {t('exists')}: {manualTest.hasNavVote ? '✅' : '❌'}</p>
            <p>app_name {t('exists')}: {manualTest.hasAppName ? '✅' : '❌'}</p>
            <p>nav_vote {t('value')}: {manualTest.navVoteValue}</p>
            <p>app_name {t('value')}: {manualTest.appNameValue}</p>
          </div>
        ) : (
          <div className="text-red-700">
            <p>❌ {t('file_load_failed')}</p>
            <p>{t('error')}: {manualTest.error}</p>
          </div>
        )}
      </div>

      {/* 번역 테스트 */}
      <div className="bg-green-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">{t('translation_test')}</h2>
        <div className="space-y-2">
          <p><strong>t(&apos;app_name&apos;):</strong> &quot;{t('app_name')}&quot;</p>
          <p><strong>t(&apos;button_cancel&apos;):</strong> &quot;{t('button_cancel')}&quot;</p>
          <p><strong>t(&apos;nav_vote&apos;):</strong> &quot;{t('nav_vote')}&quot;</p>
          <p><strong>t(&apos;label_area_filter_all&apos;):</strong> &quot;{t('label_area_filter_all')}&quot;</p>
          <p><strong>t(&apos;nonexistent_key&apos;):</strong> &quot;{t('nonexistent_key')}&quot;</p>
        </div>
      </div>

      {/* 번역 데이터 상세 */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">{t('translation_data_details')}</h2>
        {translationKeys.length > 0 ? (
          <div>
            <p className="mb-2">{t('total_keys_loaded', { count: translationKeys.length.toString() })}</p>
            <details>
              <summary className="cursor-pointer text-blue-600">{t('view_all_keys')}</summary>
              <div className="mt-2 max-h-40 overflow-y-auto">
                {translationKeys.map(key => (
                  <div key={key} className="text-sm">
                    <strong>{key}:</strong> {currentTranslations[key]}
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <p className="text-red-600">{t('no_translation_data')}</p>
        )}
      </div>
    </div>
  );
} 