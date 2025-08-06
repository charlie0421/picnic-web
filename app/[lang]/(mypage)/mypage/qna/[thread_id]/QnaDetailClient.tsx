'use client';

import React, { useState, useRef, useEffect, useOptimistic, Fragment } from 'react';
import { QnaThread, QnaMessage } from '@/types/interfaces';
import { createQnaMessageAction } from '@/app/actions/qna';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { useTranslations } from '@/hooks/useTranslations';

interface QnaDetailClientProps {
  thread: QnaThread;
}

// 날짜 포맷 함수
const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  };
  
  // 시간 포맷 함수
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  };

export default function QnaDetailClient({ thread }: QnaDetailClientProps) {
  const [messages, setMessages] = useState<QnaMessage[]>(thread.qna_messages || []);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<QnaMessage[], QnaMessage>(
    messages,
    (state, newMessage) => [...state, newMessage]
  );
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { t: tDynamic } = useTranslations();
  const t = (key: string) => tDynamic(key) || key;

  function SubmitButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus();
  
    return (
      <button
        type="submit"
        className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-dark disabled:bg-gray-300"
        disabled={pending || disabled}
      >
        {pending ? '...' : t('send_button')}
      </button>
    );
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [optimisticMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachment(file);
      if (file.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(file));
      } else {
        setPreviewUrl(null);
      }
    }
  };

  async function formAction(formData: FormData) {
    formData.append('attachment', attachment as File);

    const optimisticAttachment = attachment
    ? {
        id: Math.random(),
        message_id: 0,
        file_name: attachment.name,
        file_path: previewUrl || '',
        file_type: attachment.type,
        file_size: attachment.size,
        created_at: new Date().toISOString(),
        is_image: attachment.type.startsWith('image/'),
      }
    : null;


    addOptimisticMessage({
      id: Math.random(),
      thread_id: thread.id,
      user_id: '', // Placeholder
      content: formData.get('content') as string,
      created_at: new Date().toISOString(),
      is_admin_message: false,
      qna_attachments: optimisticAttachment ? [optimisticAttachment] : [],
      user_profiles: { nickname: 'You', avatar_url: '' }, // Placeholder for optimistic update
    });
    
    formRef.current?.reset();
    setAttachment(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }

    const result = await createQnaMessageAction(formData);

    if (result.success && result.data) {
        setMessages(prev => [...prev, result.data as QnaMessage]);
    }

    if(result.error) {
        console.error(result.error);
    }
  }

  const renderMessagesWithDateDividers = () => {
    let lastDate: string | null = null;
    return optimisticMessages.map((msg) => {
      const currentDate = new Date(msg.created_at).toDateString();
      const showDivider = currentDate !== lastDate;
      lastDate = currentDate;

      return (
        <Fragment key={msg.id}>
          {showDivider && (
            <div className="text-center my-4">
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                {formatDate(msg.created_at)}
              </span>
            </div>
          )}
          <div className={`flex flex-col gap-2 ${msg.is_admin_message ? 'items-start' : 'items-end'}`}>
            {/* Avatar and Nickname */}
            <div className={`flex items-center gap-2 ${msg.is_admin_message ? 'flex-row' : 'flex-row-reverse'}`}>
              <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0">
                <img
                  src={msg.is_admin_message ? '/images/logo_alpha.png' : (msg.user_profiles?.avatar_url || '/images/default-avatar.png')}
                  alt={msg.is_admin_message ? 'Admin' : 'User'}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <span className="text-xs text-gray-800 font-semibold">
                {msg.is_admin_message ? t('admin_message') : msg.user_profiles?.nickname || '사용자'}
              </span>
            </div>

            {/* Message bubble and time */}
            <div className={`flex items-end max-w-full gap-2 ${msg.is_admin_message ? 'flex-row' : 'flex-row-reverse'}`}>
              <div
                className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${
                  msg.is_admin_message
                    ? 'bg-white shadow-md'
                    : 'bg-primary text-white'
                }`}
              >
                {msg.qna_attachments && msg.qna_attachments.length > 0 && (
                  <div className="mb-2">
                    {msg.qna_attachments.map(att =>
                      att.file_type.startsWith('image/') ? (
                        <button
                          key={att.id}
                          onClick={() => setSelectedImage(att.file_path)}
                          className="focus:outline-none"
                        >
                          <img
                            src={att.file_path}
                            alt={att.file_name}
                            style={{ width: 200, height: 'auto' }}
                            className="rounded-lg cursor-pointer"
                          />
                        </button>
                      ) : att.file_type.startsWith('video/') ? (
                        <button
                          key={att.id}
                          onClick={() => setSelectedVideo(att.file_path)}
                          className="relative focus:outline-none w-[200px] h-auto bg-black rounded-lg flex items-center justify-center cursor-pointer aspect-video"
                        >
                          <div className="absolute inset-0 bg-black opacity-50 rounded-lg"></div>
                          <svg
                            className="w-12 h-12 text-white z-10"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      ) : (
                        <a
                          key={att.id}
                          href={att.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 underline"
                        >
                          {att.file_name}
                        </a>
                      )
                    )}
                  </div>
                )}
                <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              </div>
              <span className="text-xs text-gray-500 self-end">
                {formatTime(msg.created_at)}
              </span>
            </div>
          </div>
        </Fragment>
      );
    });
  };


  return (
    <>
      <div className="flex flex-col h-[calc(100vh-200px)] bg-gray-50 rounded-lg shadow-inner">
        <header className="p-4 border-b bg-white rounded-t-lg">
          <h1 className="text-xl font-bold">{thread.title}</h1>
          <p className={`text-sm ${thread.status === 'OPEN' ? 'text-green-500' : 'text-gray-500'}`}>
            {thread.status}
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-2">
          {renderMessagesWithDateDividers()}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t bg-white rounded-b-lg">
          {thread.status === 'CLOSED' ? (
            <div className="text-center text-gray-500 py-4">
              <p>{t('qna_thread_is_closed', '이 문의는 종료되어 더 이상 메시지를 보낼 수 없습니다.')}</p>
            </div>
          ) : (
            <form ref={formRef} action={formAction} className="flex flex-col gap-2">
              {previewUrl && (
                <div className="relative w-24 h-24">
                  <Image src={previewUrl} alt="Preview" layout="fill" objectFit="cover" className="rounded-lg" />
                  <button
                    type="button"
                    onClick={() => { setAttachment(null); setPreviewUrl(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                  >
                    X
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
                  disabled={thread.status === 'CLOSED'}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 border rounded-lg hover:bg-gray-100"
                  disabled={thread.status === 'CLOSED'}
                >
                  📎 {t('file_attachment')}
                </button>
                <SubmitButton disabled={thread.status === 'CLOSED'} />
              </div>
            </form>
          )}
        </footer>
      </div>

      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-4xl">
            <img src={selectedImage} alt="Enlarged view" className="max-w-full max-h-[90vh] object-contain" />
            <button 
              className="absolute top-4 right-4 text-white text-2xl"
              onClick={() => setSelectedImage(null)}
            >
              &times;
            </button>
          </div>
        </div>
      )}

    {selectedVideo && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedVideo(null)}
        >
          <div className="relative w-full max-w-4xl" onClick={e => e.stopPropagation()}>
            <video
              src={selectedVideo}
              controls
              autoPlay
              className="w-full max-h-[90vh] object-contain"
            />
            <button 
              className="absolute top-4 right-4 text-white text-2xl"
              onClick={() => setSelectedVideo(null)}
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  );
}
