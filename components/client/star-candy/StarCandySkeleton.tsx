'use client';

import React from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useLanguageStore } from '@/stores/languageStore';

export function StarCandySkeleton() {
  const { t } = useLanguageStore();
  
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 animate-pulse bg-gray-200 text-transparent">
          {t('star_candy_recharge_title')}
        </h1>
        <p className="text-gray-600 animate-pulse bg-gray-200 text-transparent">
          {t('loading_products')}
        </p>
      </div>
      <div className="flex justify-center items-center min-h-[200px]">
        <LoadingSpinner />
        <span className="ml-3 text-gray-600">{t('loading_products')}</span>
      </div>
    </div>
  );
} 