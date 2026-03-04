'use client';

import React, { useState, useRef, useEffect, useOptimistic, useCallback } from 'react';
import { useTranslations } from '@/hooks/useTranslations';
import { useLanguage } from '@/hooks/useLanguage';
import { useRouter } from 'next/navigation';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { QnaDetailClientProps, UiQnaMessage } from './qna-utils';
import { useQnaForm } from './useQnaForm';
import QnaMessageList from './QnaMessageList';
import QnaMediaModal from './QnaMediaModal';

export default function QnaDetailClient({ thread }: QnaDetailClientProps) {
  const [messages, setMessages] = useState<UiQnaMessage[]>((thread.qna_messages as UiQnaMessage[]) || []);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<UiQnaMessage[], UiQnaMessage>(
    messages,
    (state, newMessage) => {
      return [...state, newMessage];
    }
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { t, tDynamic } = useTranslations();
  const { currentLanguage } = useLanguage();
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);

  const {
    attachments,
    previewUrls,
    isSubmitting,
    fileInputRef,
    formRef,
    handleFileChange,
    removeAttachment,
    handleSubmit,
    clearAll,
  } = useQnaForm({ thread, messages, setMessages, addOptimisticMessage });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/qna/categories', { credentials: 'include' });
        const json = await res.json();
        if (json?.success) setCategories(json.data || []);
      } catch (e) {}
    })();
  }, []);

  const getCategoryLabel = (code?: string | null) => {
    if (!code) return null;
    const c = categories.find((x) => x.code === code);
    if (!c) return null;
    const raw = c.label;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      const byLang = raw?.[currentLanguage] || raw?.en || raw?.ko;
      if (typeof byLang === 'string') return byLang;
      if (byLang != null) return String(byLang);
      const first = Object.values(raw)[0];
      if (typeof first === 'string') return first;
      if (first != null) return String(first);
    }
    return null;
  };

  // 최근 메시지를 created_at 기준으로 산정하여 안내 문구 노출 여부 결정
  const latestMessage: UiQnaMessage | undefined = (optimisticMessages as UiQnaMessage[]).reduce(
    (latest, m) => {
      if (!latest) return m;
      const lt = latest?.created_at ? new Date(latest.created_at).getTime() : 0;
      const ct = m?.created_at ? new Date(m.created_at).getTime() : 0;
      return ct >= lt ? m : latest;
    },
    undefined as UiQnaMessage | undefined
  );
  const showAdminSilenceNotice = !!latestMessage?.is_admin_message && thread.status !== 'RESOLVED';

  function SubmitButton({ disabled, isSubmitting }: { disabled: boolean; isSubmitting: boolean }) {
    return (
      <button
        type="submit"
        className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark disabled:bg-primary/50"
        disabled={isSubmitting || disabled}
      >
        {isSubmitting ? '...' : t('send_button')}
      </button>
    );
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [optimisticMessages]);

  const handleCloseImage = useCallback(() => setSelectedImage(null), []);
  const handleCloseVideo = useCallback(() => setSelectedVideo(null), []);

  return (
    <>
      <div className="relative z-0 flex flex-col h-[calc(100vh-200px)] bg-primary-50 rounded-lg shadow-inner">
        <header className="relative z-0 overflow-visible p-4 bg-gradient-to-r from-primary-700 to-primary-900 text-white rounded-t-lg shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-1 rounded-full hover:bg-white/10 transition-colors"
                aria-label={t('common.back', 'Back')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 className="text-xl font-bold">{thread.title}</h1>
              {(() => {
                const label = getCategoryLabel(thread.category_code);
                return label ? (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/15 text-white">
                    {label}
                  </span>
                ) : null;
              })()}
            </div>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                thread.status === 'RECEIVED'
                  ? 'bg-secondary/20 text-secondary-300'
                  : thread.status === 'IN_PROGRESS'
                    ? 'bg-primary/20 text-primary-300'
                    : 'bg-point/20 text-point-300'
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
                {thread.status === 'RECEIVED'
                  ? t('qna.status.received', 'RECEIVED')
                  : thread.status === 'IN_PROGRESS'
                    ? t('qna.status.in_progress', 'IN_PROGRESS')
                    : t('qna.status.resolved', 'RESOLVED')}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {showAdminSilenceNotice && (
            <div className="rounded-md bg-primary-50 border border-primary-200 text-primary-800 px-3 py-2 text-xs">
              {t('qna.notice_admin_silence_14days')}
            </div>
          )}
          <QnaMessageList
            messages={optimisticMessages as UiQnaMessage[]}
            thread={thread}
            onSelectImage={setSelectedImage}
            onSelectVideo={setSelectedVideo}
            t={t}
            tDynamic={tDynamic}
          />
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t bg-white rounded-b-lg">
          {thread.status === 'RESOLVED' ? (
            <div className="text-center text-gray-400 py-4">
              <p>{t('qna_thread_is_closed')}</p>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
              {previewUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {previewUrls.map((url, idx) => (
                    <div key={idx} className="relative w-24 h-24">
                      <OptimizedImage src={url} alt={`Preview ${idx + 1}`} fill className="rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center shadow-md hover:bg-red-700"
                        aria-label={`첨부 ${idx + 1} 제거`}
                        title="제거"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={clearAll}
                    className="px-2 py-1 text-xs border rounded-lg text-red-600 border-red-200"
                  >
                    모두 제거
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="hidden" name="thread_id" value={thread.id} />
                <input
                  type="text"
                  name="content"
                  placeholder={t('send_message_placeholder')}
                  className="flex-1 p-2 border rounded-lg focus:ring-primary focus:border-primary"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                  accept="image/*,video/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 border rounded-lg hover:bg-primary-50 bg-white border-primary-300 text-primary-800 font-medium flex items-center gap-1"
                >
                  📎 {t('file_attachment')}
                </button>
                <SubmitButton disabled={false} isSubmitting={isSubmitting} />
              </div>
            </form>
          )}
        </footer>
      </div>

      <QnaMediaModal
        selectedImage={selectedImage}
        selectedVideo={selectedVideo}
        onCloseImage={handleCloseImage}
        onCloseVideo={handleCloseVideo}
      />
    </>
  );
}
