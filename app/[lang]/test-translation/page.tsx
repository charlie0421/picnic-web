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
      setManualTest({ success: false, error: error.message });
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
    return <div>Loading...</div>;
  }

  const currentTranslations = translations[currentLanguage] || {};
  const translationKeys = Object.keys(currentTranslations);

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">번역 시스템 테스트</h1>

      {/* 현재 상태 */}
      <div className="bg-blue-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">현재 상태</h2>
        <div className="space-y-2">
          <p><strong>현재 언어:</strong> {currentLanguage}</p>
          <p><strong>URL 경로:</strong> {typeof window !== 'undefined' ? window.location.pathname : 'N/A'}</p>
          <p><strong>번역 로드 상태:</strong> {JSON.stringify(isTranslationLoaded)}</p>
          <p><strong>현재 언어 번역 키 개수:</strong> {translationKeys.length}</p>
          <p><strong>로딩 중:</strong> {isHydrated ? 'No' : 'Yes'}</p>
        </div>
      </div>

      {/* 컨트롤 버튼들 */}
      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">컨트롤</h2>
        <div className="space-x-4">
          <button 
            onClick={forceSyncLanguage}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            언어 동기화 강제 실행
          </button>
          <button 
            onClick={() => forceLoadTranslations('ko')}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            한국어 번역 강제 로드
          </button>
          <button 
            onClick={() => forceLoadTranslations('ja')}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            일본어 번역 강제 로드
          </button>
          <button 
            onClick={testManualLoad}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            수동 파일 로드 테스트
          </button>
        </div>
      </div>

      {/* 수동 테스트 결과 */}
      <div className="bg-yellow-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">수동 파일 로드 테스트</h2>
        {manualTest.success ? (
          <div className="text-green-700">
            <p>✅ 파일 로드 성공</p>
            <p>키 개수: {manualTest.keyCount}</p>
            <p>nav_vote 존재: {manualTest.hasNavVote ? '✅' : '❌'}</p>
            <p>app_name 존재: {manualTest.hasAppName ? '✅' : '❌'}</p>
            <p>nav_vote 값: {manualTest.navVoteValue}</p>
            <p>app_name 값: {manualTest.appNameValue}</p>
          </div>
        ) : (
          <div className="text-red-700">
            <p>❌ 파일 로드 실패</p>
            <p>에러: {manualTest.error}</p>
          </div>
        )}
      </div>

      {/* 번역 테스트 */}
      <div className="bg-green-50 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">번역 테스트</h2>
        <div className="space-y-2">
          <p><strong>t('app_name'):</strong> "{t('app_name')}"</p>
          <p><strong>t('button_cancel'):</strong> "{t('button_cancel')}"</p>
          <p><strong>t('nav_vote'):</strong> "{t('nav_vote')}"</p>
          <p><strong>t('label_area_filter_all'):</strong> "{t('label_area_filter_all')}"</p>
          <p><strong>t('nonexistent_key'):</strong> "{t('nonexistent_key')}"</p>
        </div>
      </div>

      {/* 번역 데이터 상세 */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">번역 데이터 상세</h2>
        {translationKeys.length > 0 ? (
          <div>
            <p className="mb-2">총 {translationKeys.length}개 키 로드됨</p>
            <details>
              <summary className="cursor-pointer text-blue-600">모든 키 보기</summary>
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
          <p className="text-red-600">번역 데이터가 없습니다.</p>
        )}
      </div>
    </div>
  );
} 