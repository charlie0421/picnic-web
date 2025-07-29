'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { getLocalizedString } from '@/utils/api/strings';
import { useParams } from 'next/navigation';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const FaqPageClient = () => {
  const params = useParams();
  const lang = params.lang as string;
  const { data: faqs, error } = useSWR(`/api/faqs?lang=${lang}`, fetcher);
  const [openId, setOpenId] = useState<number | null>(null);

  const toggleFaq = (id: number) => {
    setOpenId(openId === id ? null : id);
  };

  if (error) return <div>Failed to load FAQs.</div>;
  if (!faqs) return <div>Loading...</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">자주 묻는 질문</h1>
      <div className="space-y-4">
        {faqs.map((faq: any) => (
          <div key={faq.id} className="border-b">
            <button
              onClick={() => toggleFaq(faq.id)}
              className="w-full text-left py-4 flex justify-between items-center"
            >
              <span className="font-semibold">{faq.question}</span>
              <ChevronDownIcon
                className={`w-5 h-5 transition-transform ${
                  openId === faq.id ? 'transform rotate-180' : ''
                }`}
              />
            </button>
            {openId === faq.id && (
              <div
                className="pb-4 pr-8 text-gray-600"
                dangerouslySetInnerHTML={{ __html: faq.answer }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FaqPageClient;
