import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPolicyForCurrentLanguage } from '@/lib/data-fetching/policy-service';

interface TermsPageProps {
  params: Promise<{
    lang: string;
  }>;
}

/**
 * 이용약관 페이지
 * 현재 언어에 따라 한글 또는 영어 정책을 표시
 */
export default async function TermsPage({ params }: TermsPageProps) {
  const { lang } = await params;
  
  // 정책 데이터 가져오기
  const policy = await getPolicyForCurrentLanguage('terms', lang);
  
  // 정책이 없으면 404 페이지 표시
  if (!policy) {
    notFound();
  }

  // 마지막 업데이트 날짜 포맷팅
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="w-full px-1 py-6">
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-4">
        {/* 페이지 제목 */}
        <div className="mb-8 border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {lang === 'ko' ? '이용약관' : 'Terms of Service'}
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600">
            <div className="mb-2 sm:mb-0">
              <span className="font-medium">
                {lang === 'ko' ? '버전:' : 'Version:'} {policy.version}
              </span>
            </div>
            <div>
              <span className="font-medium">
                {lang === 'ko' ? '최종 업데이트:' : 'Last Updated:'} {formatDate(policy.updated_at)}
              </span>
            </div>
          </div>
        </div>

        {/* 정책 내용 */}
        <main className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-a:text-primary-600 hover:prose-a:text-primary-700">
          <div className="text-gray-800 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-gray-900 mt-8 mb-4 first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-medium text-gray-900 mt-4 mb-2">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-gray-800 mb-4 leading-relaxed">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-4 text-gray-800 space-y-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-4 text-gray-800 space-y-1">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="mb-1">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-gray-900">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-gray-700">{children}</em>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-primary-200 pl-4 py-2 mb-4 bg-gray-50 text-gray-700 italic">
                  {children}
                </blockquote>
              ),
              code: ({ children }) => (
                <code className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm font-mono">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4">
                  {children}
                </pre>
              ),
                         }}
           >
             {policy.content}
           </ReactMarkdown>
          </div>
        </main>

        {/* 하단 정보 */}
        <footer className="mt-12 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            {lang === 'ko' ? (
              <p>
                본 이용약관에 대해 궁금한 사항이 있으시면{' '}
                <Link 
                  href="/contact" 
                  className="text-primary-600 hover:underline"
                >
                  고객센터
                </Link>
                로 문의해 주세요.
              </p>
            ) : (
              <p>
                If you have any questions about these Terms of Service, please{' '}
                <Link 
                  href="/contact" 
                  className="text-primary-600 hover:underline"
                >
                  contact us
                </Link>
                .
              </p>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

// 메타데이터 생성
export async function generateMetadata({ params }: TermsPageProps) {
  const { lang } = await params;
  
  return {
    title: lang === 'ko' ? '이용약관 | Picnic' : 'Terms of Service | Picnic',
    description: lang === 'ko' 
      ? 'Picnic의 이용약관을 확인하세요.' 
      : 'Check out Picnic\'s Terms of Service.',
    openGraph: {
      title: lang === 'ko' ? '이용약관 | Picnic' : 'Terms of Service | Picnic',
      description: lang === 'ko' 
        ? 'Picnic의 이용약관을 확인하세요.' 
        : 'Check out Picnic\'s Terms of Service.',
    },
  };
} 