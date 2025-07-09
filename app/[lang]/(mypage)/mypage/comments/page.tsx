import React from 'react';
import { getServerUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function CommentsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  
  // 서버 사이드에서 인증 처리
  const user = await getServerUser();
  
  if (!user) {
    redirect('/login?returnTo=/mypage/comments');
  }

  // 서버사이드에서 번역 로드
  let localeMessages: Record<string, string> = {};
  try {
    localeMessages = await import(`../../../../../public/locales/${lang}.json`).then(m => m.default);
  } catch (error) {
    console.error('번역 파일 로드 실패:', error);
    localeMessages = await import(`../../../../../public/locales/en.json`).then(m => m.default);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center py-20">
          <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-16 shadow-2xl border border-white/30 max-w-lg mx-auto">
            <div className="relative z-10">
              <div className="w-28 h-28 bg-gradient-to-br from-primary-100 via-secondary-100 to-point-100 rounded-full flex items-center justify-center mx-auto mb-8">
                <span className="text-5xl">💬</span>
              </div>
              
              <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-point bg-clip-text text-transparent mb-4">
                {localeMessages.page_title_my_comments || 'My Comments'}
              </h3>
              
              <p className="text-gray-600 mb-8 text-lg leading-relaxed">
                이 기능은 현재 개발 중입니다.
              </p>
              
              <Link 
                href="/mypage"
                className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-primary to-primary-600 text-white rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
              >
                <span>{localeMessages.label_back_to_mypage || 'Back to My Page'}</span>
                <span className="text-lg">🏠</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 