'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { QnaThreads as QnaThread } from '@/types/interfaces';
import type { Pagination } from '@/types/mypage-common';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { useTranslations } from '@/hooks/useTranslations';
import { useLanguage } from '@/hooks/useLanguage';

interface QnaClientProps {
  initialQnaThreads: QnaThread[] | null;
  initialPagination: Pagination | null;
  initialError: PostgrestError | string | null;
}

export default function QnaClient({
  initialQnaThreads,
  initialPagination,
  initialError,
}: QnaClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [qnaThreads, setQnaThreads] = useState(initialQnaThreads);
  const [pagination, setPagination] = useState(initialPagination);
  const [error, setError] = useState(initialError);
  const { t } = useTranslations();
  const { currentLanguage } = useLanguage();
  const [categories, setCategories] = useState<any[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/qna/categories', { credentials: 'include' });
        const json = await res.json();
        if (json?.success) setCategories(json.data || []);
      } catch (e) {
        // noop
      }
    })();
  }, []);

  const getCategoryLabel = (code?: string | null) => {
    if (!code) return null;
    const c = categories.find((x) => x.code === code);
    return (c?.label?.[currentLanguage] || c?.label?.en || c?.code || code) as string;
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const formatDate = (dateString: string | null) => {
    const safe = dateString ?? new Date().toISOString();
    const date = new Date(safe);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  if (error) {
    return (
      <div className="text-red-500 text-center p-4">
        Error loading Q&A: {typeof error === 'string' ? error : error.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">{t('label_mypage_qna')}</h1>
        <Link href={`${pathname}/new`}>
          <button className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300">
            {t('label_new_qna')}
          </button>
        </Link>
      </div>

      {qnaThreads && qnaThreads.length > 0 ? (
        <div className="space-y-4">
          {qnaThreads.map((thread) => (
            <Link key={thread.id} href={`${pathname}/${thread.id}`} className="block">
              <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-6 border-l-4 border-transparent hover:border-primary">
                <div className="flex justify-between items-start">
                  <div className="flex-grow">
                    <p className="text-lg font-semibold text-gray-800 truncate pr-4">{thread.title}</p>
                    {thread.category_code && (
                      <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary-700">
                        {getCategoryLabel(thread.category_code)}
                      </span>
                    )}
                    <p className="text-sm text-sub-500 mt-2">{formatDate(thread.created_at)}</p>
                  </div>
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      thread.status === 'RECEIVED'
                        ? 'bg-secondary/20 text-secondary-500'
                        : thread.status === 'IN_PROGRESS'
                          ? 'bg-primary/20 text-primary-600'
                          : 'bg-point/20 text-point-500'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        thread.status === 'RECEIVED'
                          ? 'bg-secondary'
                          : thread.status === 'IN_PROGRESS'
                            ? 'bg-primary'
                            : 'bg-point'
                      }`}
                    />
                    <span>
                      {t(
                        thread.status === 'RECEIVED'
                          ? 'qna.status.received'
                          : thread.status === 'IN_PROGRESS'
                            ? 'qna.status.in_progress'
                            : 'qna.status.resolved'
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-gray-50 rounded-lg">
          <p className="text-sub-500 text-lg">{t('label_no_qna')}</p>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center mt-10 space-x-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors duration-300 ${
                pagination.page === page
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white text-sub-700 border border-sub-200 hover:bg-primary-50 hover:border-primary'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
