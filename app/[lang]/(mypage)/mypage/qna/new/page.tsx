'use client';

import React, { useRef, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from '@/hooks/useTranslations';
import { createQnaThreadAction } from '@/app/actions/qna';
import { useLanguage } from '@/hooks/useLanguage';
import AttachmentPicker from '@/components/client/qna/AttachmentPicker';

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
  const [state, formAction] = useActionState(createQnaThreadAction, { error: null as string | null });
  const { tDynamic } = useTranslations();
  const t = (key: string) => tDynamic(key) || key;
  const { currentLanguage } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [objectUrls, setObjectUrls] = useState<string[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const isConcert2025 = !!selectedCategory && selectedCategory.startsWith('CONCERT2025');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const getCategoryLabel = (code: string | null | undefined) => {
    if (!code) return '';
    const cat = categories.find((c) => c.code === code);
    if (!cat) return '';
    const raw = cat.label;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      const byLang = raw?.[currentLanguage] || raw?.en || raw?.ko;
      if (typeof byLang === 'string') return byLang;
      if (byLang != null) return String(byLang);
      const first = Object.values(raw)[0];
      if (typeof first === 'string') return first;
      if (first != null) return String(first);
    }
    return '';
  };

  const handleFilesChange = (
    files: File[],
    meta: { previewUrls: string[]; objectUrls: string[] }
  ) => {
    setSelectedFiles(files);
    setPreviewUrls(meta.previewUrls);
    setObjectUrls(meta.objectUrls);
  };

  const clearAllFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFileAt = (index: number) => {
    if (!fileInputRef.current || !fileInputRef.current.files) return;
    const current = Array.from(fileInputRef.current.files);
    const dt = new DataTransfer();
    current.forEach((f, i) => {
      if (i !== index) dt.items.add(f);
    });
    fileInputRef.current.files = dt.files;
    setSelectedFiles(Array.from(dt.files));
  };

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/qna/categories', { credentials: 'include' });
        const json = await res.json();
        if (json?.success) setCategories(json.data || []);
      } catch (e) {
        console.error('Failed to load categories', e);
      }
    })();
  }, []);

  // Initialize from query parameter: category or category_code
  React.useEffect(() => {
    try {
      const fromQuery = searchParams.get('category') || searchParams.get('category_code');
      if (fromQuery) {
        setSelectedCategory(fromQuery);
        // title will be set from categories effect below when categories are loaded
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Populate content template when category or categories change
  React.useEffect(() => {
    if (!selectedCategory) return;
    const cat = categories.find((c) => c.code === selectedCategory);
    try {
      const textarea = document.getElementById('content') as HTMLTextAreaElement | null;
      if (!textarea) return;
      const qt = cat?.question_template as any;
      let content = '';
      if (typeof qt === 'string') {
        content = qt;
      } else if (qt && typeof qt === 'object') {
        content = qt?.[currentLanguage] || qt?.en || qt?.ko || qt?.content || '';
      }
      textarea.value = typeof content === 'string' ? content : '';
    } catch {}

    // If CONCERT2025*, lock title to category label once categories are available
    if (selectedCategory && selectedCategory.startsWith('CONCERT2025')) {
      const label = getCategoryLabel(selectedCategory);
      setTitle(label);
    }
  }, [categories, selectedCategory]);

  const onCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    setSelectedCategory(code);
    if (code && code.startsWith('CONCERT2025')) {
      setTitle(getCategoryLabel(code));
    } else {
      setTitle('');
    }
    const cat = categories.find((c) => c.code === code);
    try {
      const textarea = document.getElementById('content') as HTMLTextAreaElement | null;
      if (!textarea) return;
      const qt = cat?.question_template as any;
      let content = '';
      if (typeof qt === 'string') {
        content = qt;
      } else if (qt && typeof qt === 'object') {
        content = qt?.[currentLanguage] || qt?.en || qt?.ko || qt?.content || '';
      }
      textarea.value = typeof content === 'string' ? content : '';
    } catch {}

    // URL 쿼리에 category_code 동기화 (언어 변경 시에도 보존되도록)
    try {
      const params = new URLSearchParams(searchParams?.toString());
      if (code) {
        params.set('category_code', code);
        // 레거시 키 제거
        params.delete('category');
      } else {
        params.delete('category_code');
        params.delete('category');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    } catch {}
  };

  return (
    <div className="container mx-auto px-4 py-6 bg-white text-gray-900">
      <h1 className="text-2xl font-bold mb-6">{t('qna_new_title')}</h1>
      <form action={formAction} className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <input type="hidden" name="lang" value={currentLanguage} />
        <div>
          <label htmlFor="category_code" className="block text-sm font-medium text-gray-700">
            {t('qna_new_label_category')}
          </label>
          <select
            id="category_code"
            name={isConcert2025 ? undefined : 'category_code'}
            value={selectedCategory}
            onChange={onCategoryChange}
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none sm:text-sm placeholder-gray-500 ${
              isConcert2025
                ? 'bg-gray-100 text-gray-600 border-gray-200 border-dashed cursor-not-allowed'
                : 'bg-white text-gray-900 border-gray-300 focus:ring-primary focus:border-primary'
            }`}
            disabled={isConcert2025}
            aria-disabled={isConcert2025}
          >
            <option value="">{t('qna_new_placeholder_category') || 'Select a category'}</option>
            {categories.map((c) => {
              const label = c?.label?.[currentLanguage] || c?.label?.en || c?.code;
              return (
                <option key={c.code} value={c.code}>{label}</option>
              );
            })}
          </select>
          {isConcert2025 && (
            <>
              <input type="hidden" name="category_code" value={selectedCategory} />
            </>
          )}
        </div>
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            {t('qna_new_label_title')}
          </label>
          <input
            id="title"
            name="title"
            type="text"
            className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none sm:text-sm placeholder-gray-500 ${
              isConcert2025
                ? 'bg-gray-100 text-gray-600 border-gray-200 border-dashed cursor-not-allowed'
                : 'bg-white text-gray-900 border-gray-300 focus:ring-primary focus:border-primary'
            }`}
            placeholder={t('qna_new_placeholder_title')}
            value={title}
            onChange={(e) => {
              if (!isConcert2025) setTitle(e.target.value);
            }}
            readOnly={isConcert2025}
            aria-readonly={isConcert2025}
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
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm text-gray-900 placeholder-gray-500 bg-white"
            placeholder={t('qna_new_placeholder_content')}
            required
          ></textarea>
        </div>
        <div className="space-y-2">
          <AttachmentPicker
            files={selectedFiles}
            onFilesChange={handleFilesChange}
            inputName="attachments"
            accept="image/*,video/*"
            multiple
            attachLabel={t('file_attachment')}
            removeAllLabel={t('popup_label_delete')}
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
