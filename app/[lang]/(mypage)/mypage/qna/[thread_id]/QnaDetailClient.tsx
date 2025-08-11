'use client';

import React, { useState, useRef, useEffect, useOptimistic, Fragment, startTransition } from 'react';
import { QnaThread, QnaMessage, QnaAttachment } from '@/types/interfaces';
// import { createQnaMessageAction } from '@/app/actions/qna';
// import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { useTranslations } from '@/hooks/useTranslations';
import { useRouter } from 'next/navigation';

interface QnaDetailClientProps {
  thread: QnaThread;
}

interface UiQnaMessage extends QnaMessage {
    client_video_url?: string;
}

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(date);
  };
  
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const generateVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.setAttribute('src', URL.createObjectURL(file));
      video.load();
      video.addEventListener('error', (ex) => {
        reject(ex);
      });
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = 0.1;
      });
      video.addEventListener('seeked', () => {
          const canvas = document.createElement('canvas');
          const aspectRatio = video.videoWidth / video.videoHeight;
          const width = 200;
          const height = width / aspectRatio;
          canvas.width = width;
          canvas.height = height;
  
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(video, 0, 0, width, height);
              const dataUrl = canvas.toDataURL('image/jpeg');
              URL.revokeObjectURL(video.src);
              resolve(dataUrl);
          } else {
              URL.revokeObjectURL(video.src);
              reject(new Error('Failed to get canvas context'));
          }
      });
    });
  };

export default function QnaDetailClient({ thread }: QnaDetailClientProps) {
  const [messages, setMessages] = useState<UiQnaMessage[]>(thread.qna_messages || []);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic<UiQnaMessage[], UiQnaMessage>(
    messages,
    (state, newMessage) => {
      return [...state, newMessage];
    }
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileObjectUrls, setFileObjectUrls] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslations();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedImage(null);
        setSelectedVideo(null);
      }
    };

    if (selectedImage || selectedVideo) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImage, selectedVideo]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    if (fileList.length === 0) {
      setAttachments([]);
      setPreviewUrls([]);
      setFileObjectUrls([]);
      return;
    }

    const newObjectUrls: string[] = [];
    const newPreviewUrls: string[] = [];

    for (const file of fileList) {
      const objectUrl = URL.createObjectURL(file);
      newObjectUrls.push(objectUrl);

      if (file.type.startsWith('image/')) {
        newPreviewUrls.push(objectUrl);
      } else if (file.type.startsWith('video/')) {
        try {
          const thumbnailUrl = await generateVideoThumbnail(file);
          newPreviewUrls.push(thumbnailUrl);
        } catch (error) {
          console.error('Failed to generate video thumbnail:', error);
          newPreviewUrls.push(objectUrl);
        }
      } else {
        newPreviewUrls.push(objectUrl);
      }
    }

    setAttachments(fileList);
    setFileObjectUrls(newObjectUrls);
    setPreviewUrls(newPreviewUrls);
  };

  async function formAction(formData: FormData) {
    if (attachments.length === 0 && !(formData.get('content') as string).trim()) {
        return; 
    }
    
    if (attachments.length > 0) {
      for (const file of attachments) {
        formData.append('attachments', file);
      }
    }

    const content = formData.get('content') as string;
    const optimisticMessage: UiQnaMessage = {
        id: Math.random(),
        thread_id: thread.id,
        user_id: '', // Placeholder
        content,
        created_at: new Date().toISOString(),
        is_admin_message: false,
        qna_attachments: [],
        user_profiles: { nickname: 'You', avatar_url: '' },
    };

    if (attachments.length > 0) {
      const optimisticAttachments: QnaAttachment[] = attachments.map((file, idx) => {
        const isVideo = file.type.startsWith('video/');
        const fileUrl = fileObjectUrls[idx] || '';
        return {
          id: Math.random(),
          message_id: 0,
          file_name: file.name,
          file_path: fileUrl,
          file_type: file.type,
          file_size: file.size,
          created_at: new Date().toISOString(),
        } as QnaAttachment;
      });
      optimisticMessage.qna_attachments = optimisticAttachments;
    }
    
    startTransition(() => {
      addOptimisticMessage(optimisticMessage);
    });
    
    formRef.current?.reset();
    setAttachments([]);
    setPreviewUrls([]);
    setFileObjectUrls([]);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }

    let result: any = null;
    try {
      const res = await fetch('/api/qna/messages', {
        method: 'POST',
        body: formData,
      });
      result = await res.json().catch(() => ({}));
    } catch (e) {
      console.error('Failed to submit QnA message:', e);
    }

    if (result && result.success && result.data) {
        setMessages(prev => {
            const newMessages = prev.filter(m => m.id !== optimisticMessage.id);
            return [...newMessages, result.data as UiQnaMessage];
        });
    }

    if (!result || result.error) {
        console.error(result?.error || 'Unknown error');
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const fd = new FormData(e.currentTarget);
      await formAction(fd);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMessagesWithDateDividers = () => {
    let lastDate: string | null = null;
    return (optimisticMessages as UiQnaMessage[]).map((msg) => {
      const currentDate = new Date(msg.created_at).toDateString();
      const showDivider = currentDate !== lastDate;
      lastDate = currentDate;

      // Render all attachments (previously only the first one was shown)


      return (
        <Fragment key={msg.id}>
          {showDivider && (
            <div className="text-center my-4">
              <span className="text-xs text-sub-700 bg-sub-100 px-2 py-1 rounded-full">
                {formatDate(msg.created_at)}
              </span>
            </div>
          )}
          <div className={`flex flex-col gap-1 ${msg.is_admin_message ? 'items-start' : 'items-end'}`}>
            <div className={`flex items-center gap-2 ${msg.is_admin_message ? 'flex-row' : 'flex-row-reverse'}`}>
              <div className="w-8 h-8 rounded-full bg-primary-100 flex-shrink-0">
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
            
            <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg mt-1 ${
                msg.is_admin_message
                  ? 'bg-white shadow-md'
                  : 'bg-primary text-white'
              }`}
            >
              {Array.isArray(msg.qna_attachments) && msg.qna_attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {msg.qna_attachments.map((attachment: QnaAttachment) => {
                    const isVideo = attachment.file_type?.startsWith('video/');
                    const isImage = attachment.file_type?.startsWith('image/');
                    const playUrl = isVideo ? (msg.client_video_url || attachment.file_path) : undefined;

                    if (isVideo) {
                      return (
                        <button
                          key={attachment.id}
                          onClick={() => playUrl && setSelectedVideo(playUrl)}
                          className="relative focus:outline-none w-[200px] bg-black rounded-lg flex items-center justify-center cursor-pointer overflow-hidden"
                          aria-label="Play video attachment"
                        >
                          {msg.client_video_url ? (
                            <img
                              src={attachment.file_path}
                              alt="Video thumbnail"
                              className="w-full h-auto"
                            />
                          ) : (
                            <video
                              src={attachment.file_path}
                              preload="metadata"
                              className="w-full h-auto"
                            />
                          )}
                          <div className="absolute inset-0 bg-black opacity-50 rounded-lg"></div>
                          <svg
                            className="w-12 h-12 text-white z-10 absolute"
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
                      );
                    }

                    if (isImage) {
                      return (
                        <button
                          key={attachment.id}
                          onClick={() => setSelectedImage(attachment.file_path)}
                          className="focus:outline-none w-[200px] bg-primary-100 rounded-lg flex items-center justify-center"
                          aria-label={attachment.file_name}
                        >
                          <img
                            src={attachment.file_path}
                            alt={attachment.file_name}
                            style={{ width: 200, height: 'auto' }}
                            className="rounded-lg object-contain max-w-full max-h-full"
                          />
                        </button>
                      );
                    }

                    return (
                      <a
                        key={attachment.id}
                        href={attachment.file_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary-300 underline break-all"
                      >
                        {attachment.file_name}
                      </a>
                    );
                  })}
                </div>
              )}
              <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            </div>
            <span className={`text-xs text-gray-400 pt-1`}>
              {formatTime(msg.created_at)}
            </span>
          </div>
        </Fragment>
      );
    });
  };


  return (
    <>
      <div className="flex flex-col h-[calc(100vh-200px)] bg-primary-50 rounded-lg shadow-inner">
        <header className="p-4 bg-gradient-to-r from-primary-700 to-primary-900 text-white rounded-t-lg shadow-lg">
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
            </div>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                thread.status === 'OPEN'
                  ? 'bg-secondary/20 text-secondary-300'
                  : 'bg-point/20 text-point-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  thread.status === 'OPEN' ? 'bg-secondary' : 'bg-point'
                }`}
              />
              <span>
                {thread.status === 'OPEN'
                  ? t('qna.status.open', 'OPEN')
                  : t('qna.status.closed', 'CLOSED')}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {renderMessagesWithDateDividers()}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t bg-white rounded-b-lg">
          {(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED' ? (
            <div className="text-center text-gray-400 py-4">
              <p>{t('qna_thread_is_closed')}</p>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-2">
              {previewUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {previewUrls.map((url, idx) => (
                    <div key={idx} className="relative w-24 h-24">
                      <Image src={url} alt={`Preview ${idx + 1}`} fill className="rounded-lg object-cover" />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setAttachments([]); setPreviewUrls([]); setFileObjectUrls([]); if(fileInputRef.current) fileInputRef.current.value = ''; }}
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
                  disabled={(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED'}
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
                  className="p-2 border rounded-lg hover:bg-primary-100"
                  disabled={(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED'}
                >
                  📎 {t('file_attachment')}
                </button>
                <SubmitButton disabled={(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED'} isSubmitting={isSubmitting} />
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
