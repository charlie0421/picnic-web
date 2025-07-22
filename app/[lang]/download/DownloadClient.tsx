'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type VersionInfo } from '@/lib/data-fetching/supabase-service';

interface DownloadClientProps {
  versionInfo: VersionInfo | null;
  translations: {
    title: string;
    description: string;
    iosButton: string;
    androidButton: string;
    apkButton: string;
    apkPreparing: string;
    languageSelect: string;
  };
}

const languages = [
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
];

export default function DownloadClient({ versionInfo, translations: trans }: DownloadClientProps) {
    const params = useParams();
    const router = useRouter();
    const currentLang = params.lang as string;

    const handleLanguageChange = (langCode: string) => {
        router.push(`/${langCode}/download`);
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#f0f2f5',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            textAlign: 'center',
            padding: '20px',
        }}>
            <main
                style={{
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '480px',
                    padding: '40px',
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
                }}
            >
                <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#333', marginBottom: '12px' }}>
                    {trans.title}
                </h1>

                <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
                    {trans.description}
                </p>

                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {languages.map((lang) => (
                            <button
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                style={{
                                    background: currentLang === lang.code ? '#007aff' : '#e9e9eb',
                                    color: currentLang === lang.code ? 'white' : 'black',
                                    border: 'none',
                                    borderRadius: '20px',
                                    padding: '8px 16px',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>{lang.flag}</span>
                                <span>{lang.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center', width: '100%' }}>
                    {versionInfo?.ios?.url && (
                        <a href={versionInfo.ios.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', width: '100%', maxWidth: '300px' }}>
                            <button style={{
                                width: '100%',
                                padding: '12px',
                                backgroundColor: '#000000',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px'
                            }}>
                                <img src="/images/auth/apple.svg" alt="Apple Logo" style={{ height: '24px', filter: 'brightness(0) invert(1)' }}/>
                                <div>
                                    <div style={{ fontSize: '12px', opacity: '0.8' }}>{trans.iosButton}</div>
                                    {versionInfo.ios.version && <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{`Version ${versionInfo.ios.version}`}</div>}
                                </div>
                            </button>
                        </a>
                    )}

                    {versionInfo?.android?.url && (
                        <a href={versionInfo.android.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', width: '100%', maxWidth: '300px' }}>
                            <button style={{
                                width: '100%',
                                padding: '12px',
                                backgroundColor: '#ffffff',
                                color: 'black',
                                border: '1px solid #dadce0',
                                borderRadius: '8px',
                                fontSize: '16px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px'
                            }}>
                                <img src="/images/auth/google.svg" alt="Google Play Logo" style={{ height: '24px' }}/>
                                <div>
                                    <div style={{ fontSize: '12px', opacity: '0.8' }}>{trans.androidButton}</div>
                                    {versionInfo.android.version && <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{`Version ${versionInfo.android.version}`}</div>}
                                </div>
                            </button>
                        </a>
                    )}
                    {versionInfo?.apk && (
                       <div style={{ width: '100%', maxWidth: '300px' }}>
                           <button style={{
                               width: '100%',
                               padding: '12px',
                               backgroundColor: '#cccccc',
                               color: '#666666',
                               border: 'none',
                               borderRadius: '8px',
                               fontSize: '16px',
                               fontWeight: '600',
                               cursor: 'not-allowed',
                               display: 'flex',
                               alignItems: 'center',
                               justifyContent: 'center',
                               gap: '10px'
                           }}
                           onClick={() => alert(trans.apkPreparing)}
                           >
                               <div>
                                   <div style={{ fontSize: '12px', opacity: '0.8' }}>{trans.apkButton}</div>
                                   {versionInfo.apk.version && <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{`Version ${versionInfo.apk.version}`}</div>}
                               </div>
                           </button>
                       </div>
                    )}
                </div>
            </main>
        </div>
    );
} 