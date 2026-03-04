import { QnaThreads as QnaThread, QnaMessages as QnaMessage, QnaAttachments as QnaAttachment } from '@/types/interfaces';

export interface QnaDetailClientProps {
  thread: QnaThreadWithRelations;
}

export interface UiQnaMessage extends QnaMessage {
  client_video_url?: string;
  qna_attachments?: QnaAttachment[];
  user_profiles?: { nickname?: string; avatar_url?: string };
}

export type QnaThreadWithRelations = QnaThread & { qna_messages?: UiQnaMessage[] };

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
};

export const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

export const generateVideoThumbnail = (file: File): Promise<string> => {
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
