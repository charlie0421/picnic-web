'use client';

import { useLanguageStore } from '@/stores/languageStore';
import Image from 'next/image';
import { useState } from 'react';
import { Version } from '@/types/interfaces';

// 기본 앱 다운로드 링크 (fallback)
const DEFAULT_APP_LINKS = {
  ios: 'https://apps.apple.com/app/picnic',
  android: 'https://play.google.com/store/apps/details?id=com.picnic',
  apk: 'https://picnic.fan/app/picnic.apk',
};

interface DownloadClientProps {
  lang: string;
  versionInfo: Version | null;
}

// QR 코드 생성 함수
const generateQRCodeURL = (text: string) => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    text,
  )}`;
};

// 아이콘 컴포넌트들
const AppleIcon = () => (
  <svg
    className='w-12 h-12 sm:w-16 sm:h-16'
    fill='currentColor'
    viewBox='0 0 24 24'
  >
    <path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z' />
  </svg>
);

const AndroidIcon = () => (
  <svg
    className='w-12 h-12 sm:w-16 sm:h-16'
    fill='currentColor'
    viewBox='0 0 24 24'
  >
    <path d='M6,18c0,0.55 0.45,1 1,1h1v3.5c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5V19h2v3.5c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5V19h1c0.55,0 1,-0.45 1,-1V8H6V18zM3.5,8C2.67,8 2,8.67 2,9.5v7c0,0.83 0.67,1.5 1.5,1.5S5,17.33 5,16.5v-7C5,8.67 4.33,8 3.5,8zM20.5,8C19.67,8 19,8.67 19,9.5v7c0,0.83 0.67,1.5 1.5,1.5s1.5,-0.67 1.5,-1.5v-7C22,8.67 21.33,8 20.5,8zM15.53,2.16l1.3,-1.3c0.2,-0.2 0.2,-0.51 0,-0.71c-0.2,-0.2 -0.51,-0.2 -0.71,0l-1.48,1.48C13.85,1.23 12.95,1 12,1c-0.96,0 -1.86,0.23 -2.66,0.63L7.85,0.15c-0.2,-0.2 -0.51,-0.2 -0.71,0c-0.2,0.2 -0.2,0.51 0,0.71l1.31,1.31C6.97,3.26 6,5.01 6,7h12C18,5.01 17.03,3.26 15.53,2.16zM10,5H9V4h1V5zM15,5h-1V4h1V5z' />
  </svg>
);

const ApkIcon = () => (
  <svg
    className='w-12 h-12 sm:w-16 sm:h-16'
    fill='currentColor'
    viewBox='0 0 24 24'
  >
    <path d='M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z' />
    <path d='M10,19L8,17L9.4,15.6L10,16.2L14.6,11.6L16,13L10,19Z' />
  </svg>
);

export default function DownloadClient({
  lang,
  versionInfo,
}: DownloadClientProps) {
  const { t } = useLanguageStore();
  const [copied, setCopied] = useState('');

  // version 정보에서 링크와 버전 추출
  const getAppInfo = () => {
    if (!versionInfo) {
      return {
        ios: { link: DEFAULT_APP_LINKS.ios, version: '' },
        android: { link: DEFAULT_APP_LINKS.android, version: '' },
        apk: { link: DEFAULT_APP_LINKS.apk, version: '' },
      };
    }

    // iOS 정보 추출
    const iosData = versionInfo.ios as any;
    const iosLink = iosData?.store_url || iosData?.url || DEFAULT_APP_LINKS.ios;
    const iosVersion = iosData?.version || iosData?.app_version || '';

    // Android 정보 추출
    const androidData = versionInfo.android as any;
    const androidLink =
      androidData?.store_url || androidData?.url || DEFAULT_APP_LINKS.android;
    const androidVersion =
      androidData?.version || androidData?.app_version || '';

    // APK 정보 추출 (apk 필드 우선, android 필드에서 fallback)
    const apkData = versionInfo.apk as any;

    const apkLink =
      apkData?.apk_url ||
      apkData?.url ||
      apkData?.download_url ||
      androidData?.apk_url ||
      androidData?.apk?.url ||
      DEFAULT_APP_LINKS.apk;

    const apkVersion =
      apkData?.version ||
      apkData?.app_version ||
      androidData?.apk_version ||
      androidData?.apk?.version ||
      androidData?.version ||
      '';

    return {
      ios: { link: iosLink, version: iosVersion },
      android: { link: androidLink, version: androidVersion },
      apk: { link: apkLink, version: apkVersion },
    };
  };

  const appInfo = getAppInfo();

  const handleCopyLink = async (link: string, type: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(type);
      setTimeout(() => setCopied(''), 2000);
    } catch (err) {
      console.error('링크 복사 실패:', err);
    }
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-stone-100'>
      {/* 메인 콘텐츠 */}
      <div className='container mx-auto px-4 py-8'>
        {/* 헤더 섹션 */}
        <div className='text-center mb-12'>
          <h1 className='text-4xl md:text-6xl font-bold text-gray-900 mb-4 drop-shadow-sm'>
            {t('download_page_title')}
          </h1>
          <p className='text-lg md:text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed drop-shadow-sm'>
            {t('download_description')}
          </p>
        </div>

        {/* 다운로드 버튼 섹션 */}
        <div className='max-w-4xl mx-auto mb-16'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
            {/* iOS 버튼 */}
            <div className='text-center'>
              {/* QR 코드 */}
              <div className='mb-4 flex justify-center'>
                <div className='bg-white p-4 rounded-xl shadow-xl border-2 border-gray-200'>
                  <Image
                    src={generateQRCodeURL(appInfo.ios.link)}
                    alt='iOS QR Code'
                    width={120}
                    height={120}
                    className='rounded-lg'
                  />
                </div>
              </div>
              {appInfo.ios.version && (
                <p className='text-sm text-gray-700 font-medium mb-3 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full mx-auto w-fit border border-gray-200'>
                  v{appInfo.ios.version}
                </p>
              )}
              <a
                href={appInfo.ios.link}
                target='_blank'
                rel='noopener noreferrer'
                className='group relative overflow-hidden bg-gradient-to-r from-primary-600 to-primary-800 text-white px-8 py-6 rounded-2xl shadow-[0_8px_30px_rgba(147,116,255,0.4)] hover:shadow-[0_12px_40px_rgba(147,116,255,0.6)] transform hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center gap-4 w-full border-4 border-primary-400 hover:border-primary-300'
              >
                <AppleIcon />
                <div className='text-center'>
                  <div className='font-bold text-lg drop-shadow-sm'>
                    {t('download_ios_button')}
                  </div>
                  {appInfo.ios.version && (
                    <div className='text-xs opacity-90 drop-shadow-sm'>
                      v{appInfo.ios.version}
                    </div>
                  )}
                </div>
                <div className='absolute inset-0 bg-white opacity-0 group-hover:opacity-25 transition-opacity duration-300'></div>
              </a>
              <button
                onClick={() => handleCopyLink(appInfo.ios.link, 'ios')}
                className='mt-3 px-4 py-2 text-sm font-medium bg-primary-50 text-primary-800 hover:bg-primary-100 rounded-lg transition-colors duration-200 border-2 border-primary-300 hover:border-primary-400 shadow-md hover:shadow-lg'
              >
                {copied === 'ios'
                  ? t('download_link_copied')
                  : t('download_link_copy')}
              </button>
            </div>

            {/* Android 버튼 */}
            <div className='text-center'>
              {/* QR 코드 */}
              <div className='mb-4 flex justify-center'>
                <div className='bg-white p-4 rounded-xl shadow-xl border-2 border-gray-200'>
                  <Image
                    src={generateQRCodeURL(appInfo.android.link)}
                    alt='Android QR Code'
                    width={120}
                    height={120}
                    className='rounded-lg'
                  />
                </div>
              </div>
              {appInfo.android.version && (
                <p className='text-sm text-gray-700 font-medium mb-3 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full mx-auto w-fit border border-gray-200'>
                  v{appInfo.android.version}
                </p>
              )}
              <a
                href={appInfo.android.link}
                target='_blank'
                rel='noopener noreferrer'
                className='group relative overflow-hidden bg-gradient-to-r from-secondary-600 to-secondary-800 text-white px-8 py-6 rounded-2xl shadow-[0_8px_30px_rgba(131,251,200,0.4)] hover:shadow-[0_12px_40px_rgba(131,251,200,0.6)] transform hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center gap-4 w-full border-4 border-secondary-400 hover:border-secondary-300'
              >
                <AndroidIcon />
                <div className='text-center'>
                  <div className='font-bold text-lg drop-shadow-sm'>
                    {t('download_android_button')}
                  </div>
                  {appInfo.android.version && (
                    <div className='text-xs opacity-90 drop-shadow-sm'>
                      v{appInfo.android.version}
                    </div>
                  )}
                </div>
                <div className='absolute inset-0 bg-white opacity-0 group-hover:opacity-25 transition-opacity duration-300'></div>
              </a>
              <button
                onClick={() => handleCopyLink(appInfo.android.link, 'android')}
                className='mt-3 px-4 py-2 text-sm font-medium bg-secondary-50 text-secondary-800 hover:bg-secondary-100 rounded-lg transition-colors duration-200 border-2 border-secondary-300 hover:border-secondary-400 shadow-md hover:shadow-lg'
              >
                {copied === 'android'
                  ? t('download_link_copied')
                  : t('download_link_copy')}
              </button>
            </div>

            {/* APK 버튼 */}
            <div className='text-center'>
              {/* QR 코드 */}
              <div className='mb-4 flex justify-center'>
                <div className='bg-white p-4 rounded-xl shadow-xl border-2 border-gray-200'>
                  <Image
                    src={generateQRCodeURL(appInfo.apk.link)}
                    alt='APK QR Code'
                    width={120}
                    height={120}
                    className='rounded-lg'
                  />
                </div>
              </div>
              {appInfo.apk.version && (
                <p className='text-sm text-gray-700 font-medium mb-3 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full mx-auto w-fit border border-gray-200'>
                  v{appInfo.apk.version}
                </p>
              )}
              <a
                href={appInfo.apk.link}
                target='_blank'
                rel='noopener noreferrer'
                className='group relative overflow-hidden bg-gradient-to-r from-point-600 to-point-800 text-white px-8 py-6 rounded-2xl shadow-[0_8px_30px_rgba(255,169,189,0.4)] hover:shadow-[0_12px_40px_rgba(255,169,189,0.6)] transform hover:scale-105 transition-all duration-300 flex flex-col items-center justify-center gap-4 w-full border-4 border-point-400 hover:border-point-300'
              >
                <ApkIcon />
                <div className='text-center'>
                  <div className='font-bold text-lg drop-shadow-sm'>
                    {t('download_apk_button')}
                  </div>
                  {appInfo.apk.version && (
                    <div className='text-xs opacity-90 drop-shadow-sm'>
                      v{appInfo.apk.version}
                    </div>
                  )}
                </div>
                <div className='absolute inset-0 bg-white opacity-0 group-hover:opacity-25 transition-opacity duration-300'></div>
              </a>
              <button
                onClick={() => handleCopyLink(appInfo.apk.link, 'apk')}
                className='mt-3 px-4 py-2 text-sm font-medium bg-point-50 text-point-800 hover:bg-point-100 rounded-lg transition-colors duration-200 border-2 border-point-300 hover:border-point-400 shadow-md hover:shadow-lg'
              >
                {copied === 'apk'
                  ? t('download_link_copied')
                  : t('download_link_copy')}
              </button>
            </div>
          </div>
        </div>

        {/* 디버깅 정보 섹션 - 디버그 모드에서만 표시 */}
        {process.env.NODE_ENV === 'development' && (
          <div className='max-w-4xl mx-auto mb-8'>
            <div className='bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6'>
              <h3 className='text-xl font-bold text-gray-800 mb-4'>
                🐛 디버깅 정보
              </h3>

              {/* 버전 데이터 원본 */}
              <div className='mb-6'>
                <h4 className='text-lg font-semibold text-gray-700 mb-2'>
                  Version 테이블 데이터:
                </h4>
                <pre className='bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto'>
                  {JSON.stringify(versionInfo, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
