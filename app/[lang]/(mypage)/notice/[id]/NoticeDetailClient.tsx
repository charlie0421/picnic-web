'use client';

import React, {useEffect, useState} from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {useParams, useRouter} from 'next/navigation';
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
  createdAt: string | null;
  isPinned: boolean | null;
  status: string | null;
}

interface NoticeDetailClientProps {
  lang: string;
  translations: Record<string, any>;
}

const NoticeDetailClient = ({ lang, translations }: NoticeDetailClientProps) => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const currentLang = lang;
  const router = useRouter();
  const noticeId = params?.id;
  
  // Helper function to get translation
  const t = (key: string) => translations[key] || key;

  useEffect(() => {
    const fetchNotice = async () => {
      try {
        // noticeId를 숫자로 변환하고 유효성 검증
        const id = parseInt(noticeId as string, 10);
        if (isNaN(id)) {
          throw new Error(t('notice_invalid_id') || '유효하지 않은 공지사항 ID입니다.');
        }

        const { data, error } = await createBrowserSupabaseClient()
          .from('notices')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        
        // 데이터 변환
        const transformedNotice: Notice = {
          id: data.id,
          title: data.title as MultilingualText,
          content: data.content as MultilingualText,
          createdAt: data.created_at,
          isPinned: data.is_pinned,
          status: data.status
        };
        
        setNotice(transformedNotice);
      } catch (error) {
        console.error(t('notice_loading_error') || '공지사항을 불러오는 중 오류가 발생했습니다:', error);
        router.push(`/${currentLang}/notice`);
      } finally {
        setLoading(false);
      }
    };

    if (noticeId) {
      fetchNotice();
    }
  }, [noticeId, router, currentLang, t]);

  const getLocalizedText = (text: MultilingualText): string => {
    if (typeof text === 'string') return text;
    return text[currentLang as keyof MultilingualText] || text.ko || text.en || '';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-gray-600">{t('notice_not_found') || '공지사항을 찾을 수 없습니다.'}</p>
          <Link href={`/${currentLang}/notice`} className="text-primary-600 hover:underline mt-4 inline-block">
            {t('notice_back_to_list') || '목록으로 돌아가기'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <Link href={`/${currentLang}/notice`} className="text-primary-600 hover:underline">
            ← {t('notice_back_to_list') || '목록으로 돌아가기'}
          </Link>
        </div>

        <div className="border-b pb-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            {notice.isPinned && (
              <span className="bg-primary-100 text-primary-800 text-xs font-medium px-2.5 py-0.5 rounded">
                {t('notice_pinned') || '공지'}
              </span>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{getLocalizedText(notice.title)}</h1>
          </div>
          <span className="text-sm text-gray-500">
            {notice.createdAt && format(new Date(notice.createdAt), 'yyyy.MM.dd (EEE)', { locale: getCurrentLocale(currentLang as SupportedLanguage) })}
          </span>
        </div>

        <div className="prose max-w-none text-gray-900">
          <p className="whitespace-pre-wrap">{getLocalizedText(notice.content)}</p>
        </div>
      </div>
    </div>
  );
};

export default NoticeDetailClient; 