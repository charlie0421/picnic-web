'use client';

import React, {useEffect, useState} from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {format} from 'date-fns';
import Link from 'next/link';
import {getCurrentLocale} from '@/utils/date';
import {useLanguageStore} from '@/stores/languageStore';
import { getLocalizedString } from '@/utils/api/strings';
import { useTranslations } from 'next-intl';

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

const NoticePage = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const currentLang = useLanguageStore((state) => state.currentLanguage);
  const t = useTranslations();
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const { data, error } = await createBrowserSupabaseClient()
          .from('notices')
          .select('*')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // 데이터베이스 데이터를 Notice 타입으로 변환
        const transformedNotices: Notice[] = (data || []).map(item => ({
          id: item.id,
          title: item.title as MultilingualText,
          content: item.content as MultilingualText,
          created_at: item.created_at,
          is_pinned: item.is_pinned,
          status: item.status
        }));
        
        setNotices(transformedNotices);
      } catch (error) {
        console.error('공지사항을 불러오는 중 오류가 발생했습니다:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotices();
  }, []);

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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">{t('page_title_notice') || '공지사항'}</h1>
        <div className="space-y-4">
          {notices.length === 0 ? (
            <p className="text-gray-600">{t('notice_no_items') || '등록된 공지사항이 없습니다.'}</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {notices.map((notice) => (
                <Link
                  href={`/notice/${notice.id}`}
                  key={notice.id}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {notice.is_pinned && (
                          <span className="bg-primary-100 text-primary-800 text-xs font-medium px-2.5 py-0.5 rounded">
                            {t('notice_pinned') || '공지'}
                          </span>
                        )}
                        <h2 className="text-lg font-semibold text-gray-900">{getLocalizedText(notice.title)}</h2>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-gray-600">

                          {notice.created_at && format(new Date(notice.created_at), 'yyyy.MM.dd (EEE)', { locale: getCurrentLocale(currentLang) })}
                        </span>
                        <span className="text-xs text-gray-500">
                          {notice.created_at && format(new Date(notice.created_at), 'HH:mm', { locale: getCurrentLocale(currentLang) })}
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
    </div>
  );
};

export default NoticePage;
