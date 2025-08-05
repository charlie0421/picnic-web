'use client';

import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useTranslations } from '@/hooks/useTranslations';
import { createQnaThreadAction } from '@/app/actions/qna';

function SubmitButton() {
  const { pending } = useFormStatus();
  const { tDynamic } = useTranslations();
  const t = (key: string) => tDynamic(key) || key;
  
  return (
    <button
      type="submit"
      className="bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg transition duration-300 disabled:bg-gray-400"
      disabled={pending}
    >
      {pending ? t('qna_new_button_submitting') : t('qna_new_button_submit')}
    </button>
  );
}

export default function NewQnaPage() {
  const [state, formAction] = useFormState(createQnaThreadAction, { error: null as string | null });
  const { tDynamic } = useTranslations();
  const t = (key: string) => tDynamic(key) || key;

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('qna_new_title')}</h1>
      <form action={formAction} className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            {t('qna_new_label_title')}
          </label>
          <input
            id="title"
            name="title"
            type="text"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
            placeholder={t('qna_new_placeholder_title')}
            required
          />
        </div>
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700">
            {t('qna_new_label_content')}
          </label>
          <textarea
            id="content"
            name="content"
            rows={10}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
            placeholder={t('qna_new_placeholder_content')}
            required
          ></textarea>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
