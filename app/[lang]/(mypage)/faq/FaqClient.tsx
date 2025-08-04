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
  categories: string[];
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
              key={category}
              className="inline-flex items-center cursor-pointer"
            >
              <input
                type="radio"
                name="category"
                value={category}
                checked={selectedCategory === category}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="hidden"
              />
              <span
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tDynamic(`faq_category_${category.toLowerCase()}`)}
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
