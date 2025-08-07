'use client';

import React, { useState, useRef, useEffect, useOptimistic, Fragment } from 'react';
import { QnaThread, QnaMessage, QnaAttachment } from '@/types/interfaces';
import { createQnaMessageAction } from '@/app/actions/qna';
import { useFormStatus } from 'react-dom';
import Image from 'next/image';
import { useTranslations } from '@/hooks/useTranslations';

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
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslations();

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
    const file = e.target.files?.[0];
    if (file) {
      setAttachment(file);
      const objectUrl = URL.createObjectURL(file);
      setFileObjectUrl(objectUrl);

      if (file.type.startsWith('image/')) {
        setPreviewUrl(objectUrl);
      } else if (file.type.startsWith('video/')) {
        try {
            const thumbnailUrl = await generateVideoThumbnail(file);
            setPreviewUrl(thumbnailUrl);
        } catch (error) {
            console.error("Failed to generate video thumbnail:", error);
            setPreviewUrl(null);
        }
      }
       else {
        setPreviewUrl(null);
      }
    }
  };

  async function formAction(formData: FormData) {
    if (!attachment && !(formData.get('content') as string).trim()) {
        return; 
    }
    
    if (attachment) {
      formData.append('attachment', attachment);
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

    if (attachment) {
        const isVideo = attachment.type.startsWith('video/');
        const optimisticAttachment: QnaAttachment = {
            id: Math.random(),
            message_id: 0,
            file_name: attachment.name,
            file_path: isVideo ? (previewUrl || '') : (fileObjectUrl || ''),
            file_type: attachment.type,
            file_size: attachment.size,
            created_at: new Date().toISOString(),
        };
        optimisticMessage.qna_attachments = [optimisticAttachment];
        
        if (isVideo) {
            optimisticMessage.client_video_url = fileObjectUrl || '';
        }
    }
    
    addOptimisticMessage(optimisticMessage);
    
    formRef.current?.reset();
    setAttachment(null);
    setPreviewUrl(null);
    setFileObjectUrl(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }

    const result = await createQnaMessageAction(formData);

    if (result.success && result.data) {
        setMessages(prev => {
            const newMessages = prev.filter(m => m.id !== optimisticMessage.id);
            return [...newMessages, result.data as UiQnaMessage];
        });
    }

    if(result.error) {
        console.error(result.error);
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
    }
  }

  const renderMessagesWithDateDividers = () => {
    let lastDate: string | null = null;
    return (optimisticMessages as UiQnaMessage[]).map((msg) => {
      const currentDate = new Date(msg.created_at).toDateString();
      const showDivider = currentDate !== lastDate;
      lastDate = currentDate;

      const attachment = msg.qna_attachments?.[0] as QnaAttachment | undefined;
      const isVideo = attachment?.file_type.startsWith('video/');

      const thumbnailPath = attachment?.file_path;
      const videoPath = isVideo && attachment ? (msg.client_video_url || attachment.file_path) : undefined;


      return (
        <Fragment key={msg.id}>
          {showDivider && (
            <div className="text-center my-4">
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                {formatDate(msg.created_at)}
              </span>
            </div>
          )}
          <div className={`flex flex-col gap-1 ${msg.is_admin_message ? 'items-start' : 'items-end'}`}>
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
            
            <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg mt-1 ${
                msg.is_admin_message
                  ? 'bg-white shadow-md'
                  : 'bg-primary text-white'
              }`}
            >
              {attachment && (
                <div className="mb-2">
                  {isVideo ? (
                    <button
                      key={attachment.id}
                      onClick={() => videoPath && setSelectedVideo(videoPath)}
                      className="relative focus:outline-none w-[200px] bg-black rounded-lg flex items-center justify-center cursor-pointer overflow-hidden"
                    >
                      {/* 낙관적 메시지(새로 첨부)는 생성된 썸네일을, 기존 메시지는 비디오 태그를 사용합니다. */}
                      {msg.client_video_url ? (
                        <img
                          src={thumbnailPath}
                          alt="Video thumbnail"
                          className="w-full h-auto"
                        />
                      ) : (
                        <video
                          src={thumbnailPath}
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
                  ) : attachment.file_type.startsWith('image/') ? (
                    <button
                      key={attachment.id}
                      onClick={() => setSelectedImage(attachment.file_path)}
                      className="focus:outline-none w-[200px] bg-gray-200 rounded-lg flex items-center justify-center"
                    >
                      <img
                        src={attachment.file_path}
                        alt={attachment.file_name}
                        style={{ width: 200, height: 'auto' }}
                        className="rounded-lg object-contain max-w-full max-h-full"
                      />
                    </button>
                  ) : (
                    <a
                      key={attachment.id}
                      href={attachment.file_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      {attachment.file_name}
                    </a>
                  )}
                </div>
              )}
              <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            </div>
            <span className={`text-xs text-gray-500 pt-1`}>
              {formatTime(msg.created_at)}
            </span>
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

        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {renderMessagesWithDateDividers()}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-4 border-t bg-white rounded-b-lg">
          {(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED' ? (
            <div className="text-center text-gray-500 py-4">
              <p>{t('qna_thread_is_closed')}</p>
            </div>
          ) : (
            <form ref={formRef} action={formAction} className="flex flex-col gap-2">
              {previewUrl && (
                <div className="relative w-24 h-24">
                  <Image src={previewUrl} alt="Preview" layout="fill" objectFit="cover" className="rounded-lg" />
                  <button
                    type="button"
                    onClick={() => { setAttachment(null); setPreviewUrl(null); setFileObjectUrl(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
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
                  disabled={(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED'}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,video/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 border rounded-lg hover:bg-gray-100"
                  disabled={(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED'}
                >
                  📎 {t('file_attachment')}
                </button>
                <SubmitButton disabled={(thread.status as 'OPEN' | 'CLOSED') === 'CLOSED'} />
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
