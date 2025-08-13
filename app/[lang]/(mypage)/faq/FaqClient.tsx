'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useTranslations } from '@/hooks/useTranslations';

interface Faq {
  id: number;
  question: string;
  answer: string;
  category: string | null;
}

interface FaqClientProps {
  faqs: Faq[];
  categories: { code: string; label: string }[]; // e.g., [{code:'all', label:''}, {code:'PAYMENT', label:'결제'}]
}

const FaqClient = ({ faqs, categories }: FaqClientProps) => {
  const [openId, setOpenId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const { tDynamic } = useTranslations();

  const toggleFaq = (id: number) => {
    setOpenId(openId === id ? null : id);
  };

  const filteredFaqs = useMemo(() => {
    if (selectedCategory === 'all') {
      return faqs;
    }
    return faqs.filter((faq) => faq.category === selectedCategory);
  }, [faqs, selectedCategory]);

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-wrap gap-4">
          {categories.map((category) => (
            <label
              key={category.code}
              className="inline-flex items-center cursor-pointer"
            >
              <input
                type="radio"
                name="category"
                value={category.code}
                checked={selectedCategory === category.code}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="hidden"
              />
              <span
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category.code
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {category.code === 'all'
                  ? tDynamic('faq_category_all')
                  : category.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filteredFaqs.map((faq) => (
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
                dangerouslySetInnerHTML={{ __html: faq.answer.replace(/\n/g, '<br />') }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FaqClient;
