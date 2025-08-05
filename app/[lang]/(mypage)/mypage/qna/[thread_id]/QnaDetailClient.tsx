'use client';

import React, { useState, useRef, useEffect, useOptimistic, Fragment } from 'react';
import { QnaThread, QnaMessage } from '@/types/interfaces';
import { createQnaMessageAction } from '@/app/actions/qna';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';

interface QnaDetailClientProps {
  thread: QnaThread;
  translations: {
    [key: string]: string;
  };
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

export default function QnaDetailClient({ thread, translations }: QnaDetailClientProps) {
  const [messages, setMessages] = useState<QnaMessage[]>(thread.qna_messages || []);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<QnaMessage[], QnaMessage>(
    messages,
    (state, newMessage) => [...state, newMessage]
  );
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (key: string) => translations[key] || key;

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
          <div
            className={`flex items-start gap-3 ${msg.is_admin_message ? 'justify-start' : 'justify-end'}`}
          >
            {/* User Avatar */}
            {!msg.is_admin_message && (
              <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0">
                <img src={msg.user_profiles?.avatar_url || '/images/default-avatar.png'} alt="User" className="w-full h-full rounded-full" />
             </div>
            )}

            {/* Message Bubble */}
            <div className={`flex flex-col ${msg.is_admin_message ? 'items-start' : 'items-end'}`}>
               {/* Nickname */}
               <span className="text-xs text-gray-600 mb-1">
                {msg.is_admin_message ? '관리자' : msg.user_profiles?.nickname || '사용자'}
              </span>

              <div className="flex items-end gap-2">
                {/* Time for Admin */}
                {msg.is_admin_message && (
                    <span className="text-xs text-gray-500">{formatTime(msg.created_at)}</span>
                )}
                <div
                  className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg ${
                    msg.is_admin_message
                      ? 'bg-white shadow-md'
                      : 'bg-primary text-white'
                  }`}
                >
                  {msg.qna_attachments && msg.qna_attachments.length > 0 && (
                    <div className="mb-2">
                      {msg.qna_attachments.map(att => (
                        att.file_type.startsWith('image/') ? (
                          <button key={att.id} onClick={() => setSelectedImage(att.file_path)} className="focus:outline-none">
                            <img src={att.file_path} alt={att.file_name} style={{ width: 200, height: 'auto' }} className="rounded-lg cursor-pointer" />
                          </button>
                        ) : (
                          <a key={att.id} href={att.file_path} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{att.file_name}</a>
                        )
                      ))}
                    </div>
                  )}
                  <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                </div>
                 {/* Time for User */}
                 {!msg.is_admin_message && (
                    <span className="text-xs text-gray-500">{formatTime(msg.created_at)}</span>
                )}
              </div>
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
                📎
              </button>
              <SubmitButton disabled={thread.status === 'CLOSED'} />
            </div>
          </form>
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
    </>
  );
}
