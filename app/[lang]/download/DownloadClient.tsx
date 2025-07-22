'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type VersionInfo } from '@/lib/data-fetching/supabase-service';
import { cn } from '@/components/utils/cn';

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
        <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-primary-100 via-secondary-100 to-white font-sans p-4">
            <main
                className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg w-full max-w-md p-8 m-4 transition-all duration-300 hover:shadow-2xl"
            >
                <h1 className="text-3xl font-bold text-primary mb-3 text-center">
                    {trans.title}
                </h1>

                <p className="text-gray-600 mb-6 text-center">
                    {trans.description}
                </p>

                <div className="flex justify-center gap-2 flex-wrap mb-8">
                    {languages.map((lang) => (
                        <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200",
                                currentLang === lang.code
                                    ? "bg-primary text-white border-primary-400 shadow-md"
                                    : "bg-white/50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                            )}
                        >
                            <span className="text-lg">{lang.flag}</span>
                            <span className="font-medium text-sm">{lang.name}</span>
                        </button>
                    ))}
                </div>
                
                <div className="flex flex-col gap-4 items-center w-full">
                    {versionInfo?.ios?.url && (
                        <a href={versionInfo.ios.url} target="_blank" rel="noopener noreferrer" className="w-full max-w-xs">
                            <button className="w-full p-3 bg-primary text-white rounded-lg font-semibold flex items-center justify-center gap-3 transition-transform duration-200 hover:scale-105">
                                <img src="/images/auth/apple.svg" alt="Apple Logo" className="h-6 filter brightness-0 invert"/>
                                <div>
                                    <div className="text-xs opacity-80">{trans.iosButton}</div>
                                    {versionInfo.ios.version && <div className="text-sm font-bold">{`Version ${versionInfo.ios.version}`}</div>}
                                </div>
                            </button>
                        </a>
                    )}

                    {versionInfo?.android?.url && (
                        <a href={versionInfo.android.url} target="_blank" rel="noopener noreferrer" className="w-full max-w-xs">
                            <button className="w-full p-3 bg-secondary-300 text-black rounded-lg font-semibold flex items-center justify-center gap-3 transition-transform duration-200 hover:scale-105 hover:bg-secondary-400">
                                <img src="/images/auth/google.svg" alt="Google Play Logo" className="h-6"/>
                                <div>
                                    <div className="text-xs opacity-80">{trans.androidButton}</div>
                                    {versionInfo.android.version && <div className="text-sm font-bold">{`Version ${versionInfo.android.version}`}</div>}
                                </div>
                            </button>
                        </a>
                    )}
                    {versionInfo?.apk && (
                       <div className="w-full max-w-xs">
                           <button 
                                className="w-full p-3 bg-gray-200 text-gray-500 rounded-lg font-semibold flex items-center justify-center gap-3 cursor-not-allowed"
                                onClick={() => alert(trans.apkPreparing)}
                           >
                               <div>
                                   <div className="text-xs opacity-80">{trans.apkButton}</div>
                                   {versionInfo.apk.version && <div className="text-sm font-bold">{`Version ${versionInfo.apk.version}`}</div>}
                               </div>
                           </button>
                       </div>
                    )}
                </div>
            </main>
        </div>
    );
} 