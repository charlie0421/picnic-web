'use client';

import React, {useEffect, useState} from 'react';
import {supabase} from '@/utils/supabase-client';
import {format} from 'date-fns';
import {ko} from 'date-fns/locale';
import {useParams, useRouter} from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import createClient from '@/lib/supabase/client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

interface Notice {
  id: number;
  title: any; // JSON type for multilingual content
  content: any; // JSON type for multilingual content  
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  status: string | null;
  is_pinned: boolean | null;
}

export default function NoticeDetailPage() {
  const { id } = useParams();
  const { getLocalizedPath } = useLocaleRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 다국어 텍스트 처리 헬퍼 함수
  const getLocalizedText = (text: any): string => {
    if (typeof text === 'string') return text;
    if (typeof text === 'object' && text !== null) {
      return text.ko || text.en || text.ja || text.zh || text.id || '';
    }
    return '';
  };

  useEffect(() => {
    async function fetchNotice() {
      if (!id) return;
      
      try {
        const supabase = createClient();
        
        // 공지사항 상세 정보 가져오기
        const { data, error } = await supabase
          .from('notices')
          .select('*')
          .eq('id', parseInt(id as string, 10))
          .single();

        if (error) {
          throw error;
        }

        setNotice(data);
        
        // 조회수 기능은 향후 추가 예정
          
      } catch (err) {
        console.error('Failed to fetch notice:', err);
        setError('공지사항을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }

    fetchNotice();
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4 w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded mb-2 w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (error || !notice) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">오류 발생</h1>
          <p className="text-gray-600 mb-6">{error || '공지사항을 찾을 수 없습니다.'}</p>
          <Link href={getLocalizedPath('/notice')} className="text-primary-600 hover:underline mt-4 inline-block">
            공지사항 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <Link 
          href={getLocalizedPath('/notice')} 
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          공지사항 목록으로
        </Link>
        
        <div className="border-b border-gray-200 pb-6">
          <div className="flex items-center mb-2">
            {notice.is_pinned && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                중요
              </span>
            )}
            <h1 className="text-3xl font-bold text-gray-900">{getLocalizedText(notice.title)}</h1>
          </div>
          
          <div className="flex items-center text-sm text-gray-500 space-x-4">
            <div className="flex items-center">
              <Calendar className="mr-1 h-4 w-4" />
              {notice.created_at && format(new Date(notice.created_at), 'yyyy년 MM월 dd일', { locale: ko })}
            </div>
          </div>
        </div>
      </div>

      <div className="prose prose-lg max-w-none">
        <div 
          className="text-gray-800 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: getLocalizedText(notice.content) }}
        />
      </div>

      <div className="mt-12 pt-6 border-t border-gray-200">
        <Link href={getLocalizedPath('/notice')} className="text-primary-600 hover:underline">
          ← 공지사항 목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
