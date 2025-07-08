'use client';

import React, { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import Link from 'next/link';
import { getCurrentLocale, type SupportedLanguage } from '@/utils/date';

interface MultilingualText {
  en?: string;
  ko?: string;
  ja?: string;
  zh?: string;
  id?: string;
}

interface Notice {
  id: number;
  title: MultilingualText;
  content: MultilingualText;
  created_at: string | null;
  is_pinned: boolean | null;
  status: string | null;
}

interface Props {
  lang: string;
  translations: {
    page_title_notice: string;
    notice_no_items: string;
    notice_pinned: string;
  };
}

const NoticePageClient: React.FC<Props> = ({ lang, translations }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTestData, setShowTestData] = useState(false);

  console.log('🏗️ [Notice] NoticePageClient 컴포넌트 마운트됨:', { lang, translations });

  // 테스트 데이터
  const testNotices: Notice[] = [
    {
      id: 1,
      title: { ko: '테스트 공지사항 1', en: 'Test Notice 1' },
      content: { ko: '이것은 테스트 공지사항입니다.', en: 'This is a test notice.' },
      created_at: new Date().toISOString(),
      is_pinned: true,
      status: 'published'
    },
    {
      id: 2,
      title: { ko: '테스트 공지사항 2', en: 'Test Notice 2' },
      content: { ko: '또 다른 테스트 공지사항입니다.', en: 'Another test notice.' },
      created_at: new Date(Date.now() - 86400000).toISOString(), // 1일 전
      is_pinned: false,
      status: 'published'
    }
  ];

  useEffect(() => {
    const fetchNotices = async () => {
      try {
        console.log('🔍 [Notice] 공지사항 페치 시작');
        setLoading(true);
        setError(null);
        
        const supabase = createBrowserSupabaseClient();
        console.log('🔍 [Notice] Supabase 클라이언트 생성 완료');
        
        // 먼저 간단한 테이블 접근 권한 확인
        console.log('🔍 [Notice] 테이블 접근 권한 확인 시작...');
        const { data: testData, error: testError } = await supabase
          .from('notices')
          .select('count')
          .limit(1);
          
        console.log('🔍 [Notice] 테이블 접근 권한 확인 결과:', {
          hasTestData: !!testData,
          hasTestError: !!testError,
          testErrorMessage: testError?.message || null,
          testErrorCode: testError?.code || null,
          testErrorDetails: testError?.details || null
        });
        
        if (testError) {
          console.error('🚨 [Notice] 테이블 접근 권한 에러:', testError);
          setError(`테이블 접근 에러: ${testError.message} (코드: ${testError.code})`);
          setLoading(false);
          return;
        }
        
        // 실제 데이터 조회
        console.log('🔍 [Notice] 실제 공지사항 데이터 조회 시작...');
        const { data, error } = await supabase
          .from('notices')
          .select('*')
          .eq('status', 'PUBLISHED')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });

        console.log('🔍 [Notice] Supabase 쿼리 실행 완료:', { 
          hasData: !!data, 
          dataLength: data?.length || 0, 
          hasError: !!error,
          error: error?.message || null,
          errorCode: error?.code || null,
          errorDetails: error?.details || null,
          rawData: data
        });

        if (error) {
          console.error('🚨 [Notice] 공지사항 조회 에러:', error);
          setError(`공지사항 조회 실패: ${error.message}`);
          setLoading(false);
          return;
        }

        console.log('🔍 [Notice] 원본 데이터 확인:', data);

        if (!data) {
          console.warn('⚠️ [Notice] 데이터가 null/undefined입니다');
          setNotices([]);
          setLoading(false);
          return;
        }

        // 데이터 변환 과정 상세 로깅
        console.log('🔄 [Notice] 데이터 변환 시작...');
        const transformedNotices = data.map((notice: any, index: number) => {
          console.log(`🔄 [Notice] 변환 중 (${index + 1}/${data.length}):`, {
            id: notice.id,
            title: notice.title,
            status: notice.status,
            is_pinned: notice.is_pinned,
            created_at: notice.created_at
          });
          
          return {
            id: notice.id,
            title: notice.title,
            content: notice.content,
            created_at: notice.created_at,
            is_pinned: notice.is_pinned || false,
            status: notice.status
          };
        });

        console.log('✅ [Notice] 데이터 변환 완료:', {
          원본개수: data.length,
          변환된개수: transformedNotices.length,
          변환된데이터: transformedNotices
        });

        setNotices(transformedNotices);
        setLoading(false);

      } catch (error: any) {
        console.error('🚨 [Notice] 예상치 못한 에러:', error);
        setError(`예상치 못한 오류가 발생했습니다: ${error.message}`);
        setLoading(false);
      }
    };

    console.log('🚀 [Notice] fetchNotices 함수 호출');
    fetchNotices();
  }, []);

  const getLocalizedText = (text: MultilingualText): string => {
    if (!text) return '';
    return text[lang as keyof MultilingualText] || text.ko || text.en || '';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const locale = getCurrentLocale(lang as SupportedLanguage);
      return format(date, 'yyyy.MM.dd', { locale });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-gray-900">
            {translations.page_title_notice}
          </h1>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <p className="text-blue-600">🔄 공지사항을 불러오는 중입니다...</p>
          </div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-gray-900">
            {translations.page_title_notice}
          </h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => setShowTestData(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              테스트 데이터 보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 테스트 데이터 표시
  if (showTestData) {
    console.log('🧪 [Notice] 테스트 데이터 표시 중');
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-gray-900">
            {translations.page_title_notice} (테스트 모드)
          </h1>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-700">🧪 테스트 데이터를 표시하고 있습니다.</p>
          </div>
          <div className="space-y-4">
            {testNotices.map((notice) => (
              <div
                key={notice.id}
                className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        {notice.is_pinned && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                            📌 {translations.notice_pinned}
                          </span>
                        )}
                        <h2 className="text-lg font-semibold text-gray-900">
                          {getLocalizedText(notice.title)}
                        </h2>
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-2">
                        {getLocalizedText(notice.content)}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <span className="text-sm text-gray-500">
                        {formatDate(notice.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900">
          {translations.page_title_notice}
        </h1>

        {notices.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">{translations.notice_no_items}</p>
            <button
              onClick={() => setShowTestData(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              테스트 데이터 보기
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => (
              <Link
                key={notice.id}
                href={`/${lang}/notice/${notice.id}`}
                className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        {notice.is_pinned && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                            📌 {translations.notice_pinned}
                          </span>
                        )}
                        <h2 className="text-lg font-semibold text-gray-900 hover:text-primary-600 transition-colors">
                          {getLocalizedText(notice.title)}
                        </h2>
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-2">
                        {getLocalizedText(notice.content)}
                      </p>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <span className="text-sm text-gray-500">
                        {formatDate(notice.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NoticePageClient; 