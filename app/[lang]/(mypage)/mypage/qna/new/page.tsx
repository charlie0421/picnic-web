'use client';

import React, { useRef, useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
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

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('qna_new_title')}</h1>
      <form action={formAction} className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <input type="hidden" name="lang" value={currentLanguage} />
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
        <div className="space-y-2">
          <AttachmentPicker
            files={selectedFiles}
            onFilesChange={handleFilesChange}
            inputName="attachments"
            accept="image/*,video/*"
            multiple
            attachLabel={t('file_attachment')}
            removeAllLabel="모두 제거"
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
