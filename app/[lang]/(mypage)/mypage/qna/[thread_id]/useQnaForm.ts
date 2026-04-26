'use client';

import { useState, useRef, startTransition } from 'react';
import { QnaAttachments as QnaAttachment } from '@/types/interfaces';
import { generateVideoThumbnail, UiQnaMessage, QnaThreadWithRelations } from './qna-utils';

interface UseQnaFormParams {
  thread: QnaThreadWithRelations;
  messages: UiQnaMessage[];
  setMessages: React.Dispatch<React.SetStateAction<UiQnaMessage[]>>;
  addOptimisticMessage: (message: UiQnaMessage) => void;
}

export function useQnaForm({ thread, messages, setMessages, addOptimisticMessage }: UseQnaFormParams) {
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileObjectUrls, setFileObjectUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);

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

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      if (index >= 0 && index < next.length) {
        next.splice(index, 1);
      }
      return next;
    });

    setPreviewUrls((prev) => {
      const next = [...prev];
      const urlToRevoke = next[index];
      if (urlToRevoke && urlToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(urlToRevoke);
      }
      if (index >= 0 && index < next.length) {
        next.splice(index, 1);
      }
      return next;
    });

    setFileObjectUrls((prev) => {
      const next = [...prev];
      const urlToRevoke = next[index];
      if (urlToRevoke && urlToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(urlToRevoke);
      }
      if (index >= 0 && index < next.length) {
        next.splice(index, 1);
      }
      return next;
    });

    if (fileInputRef.current && attachments.length <= 1) {
      fileInputRef.current.value = '';
    }
  };

  const clearAll = () => {
    setAttachments([]);
    setPreviewUrls([]);
    setFileObjectUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    const optimisticMessage = {
        id: Math.random(),
        thread_id: thread.id,
        user_id: '', // Placeholder
        content,
        created_at: new Date().toISOString(),
        is_admin_message: false,
        qna_attachments: [],
        user_profiles: { nickname: 'You', avatar_url: '' },
    } as UiQnaMessage;

    if (attachments.length > 0) {
      const optimisticAttachments: QnaAttachment[] = attachments.map((file, idx) => {
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

    let result: any = { success: false };
    try {
      const res = await fetch('/api/qna/messages', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      try {
        const json = await res.json();
        if (json && typeof json === 'object') {
          result = json;
        }
      } catch {
        result = { success: false };
      }
    } catch (e) {
      console.error('Failed to submit QnA message:', e);
      result = { success: false, error: 'network_error' };
    }

    const isSuccess = !!(result && typeof result === 'object' && 'success' in result && result.success === true && result.data);
    if (isSuccess) {
        setMessages(prev => {
            const newMessages = prev.filter(m => m.id !== optimisticMessage.id);
            return [...newMessages, result.data as UiQnaMessage];
        });
    }

    if (!isSuccess) {
        console.error(result?.error || 'Unknown error');
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current || isSubmitting) return;
    try {
      submittingRef.current = true;
      setIsSubmitting(true);
      const fd = new FormData(e.currentTarget);
      await formAction(fd);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  return {
    attachments,
    previewUrls,
    isSubmitting,
    fileInputRef,
    formRef,
    handleFileChange,
    removeAttachment,
    handleSubmit,
    clearAll,
  };
}
