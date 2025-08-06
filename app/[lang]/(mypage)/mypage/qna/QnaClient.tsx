'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { QnaThread, Pagination } from '@/types/interfaces';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { useTranslations } from '@/hooks/useTranslations';

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
  const { t: tDynamic } = useTranslations();
  const t = (key: string) => tDynamic(key) || key;

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  if (error) {
    return (
      <div className="text-red-500 text-center p-4">
        Error loading Q&A: {typeof error === 'string' ? error : error.message}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('label_mypage_qna')}</h1>
        <Link href={`${pathname}/new`}>
          <button className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg transition duration-300">
            {t('label_new_qna')}
          </button>
        </Link>
      </div>

      {qnaThreads && qnaThreads.length > 0 ? (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {qnaThreads.map((thread) => (
              <li key={thread.id} className="p-4 hover:bg-gray-50 transition-colors duration-200">
                <Link href={`${pathname}/${thread.id}`} className="block">
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-semibold text-primary truncate">{thread.title}</p>
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        thread.status === 'OPEN'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {t(thread.status === 'OPEN' ? 'label_qna_status_open' : 'label_qna_status_closed')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{formatDate(thread.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">{t('label_no_qna')}</p>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center mt-8 space-x-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              className={`px-4 py-2 rounded-lg ${
                pagination.page === page
                  ? 'bg-primary text-white'
                  : 'bg-white text-gray-700 border'
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
