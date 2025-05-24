import { Media, MediaType } from './types';

/**
 * 파일 크기를 읽기 쉬운 형식으로 변환
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 미디어 타입에 따른 아이콘 반환
 */
export function getMediaTypeIcon(type: MediaType): string {
  const icons = {
    image: '🖼️',
    video: '🎬',
    audio: '🎵',
    document: '📄'
  };
  
  return icons[type] || '📎';
}

/**
 * MIME 타입으로부터 미디어 타입 추론
 */
export function getMediaTypeFromMime(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * 파일 확장자 추출
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * 비디오/오디오 재생 시간 포맷
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 이미지 썸네일 URL 생성
 */
export function getThumbnailUrl(media: Media, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (media.thumbnailUrl) return media.thumbnailUrl;
  
  // 이미지인 경우 원본 URL 사용
  if (media.type === 'image') return media.url;
  
  // 다른 타입의 경우 기본 썸네일
  return '/images/default-thumbnail.png';
}

/**
 * 미디어 업로드 가능 여부 확인
 */
export function isValidMediaType(mimeType: string): boolean {
  const allowedTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Videos
    'video/mp4',
    'video/webm',
    'video/ogg',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  return allowedTypes.includes(mimeType);
}

/**
 * 미디어 정렬 함수
 */
export function sortMedia(media: Media[], sortBy: 'date' | 'name' | 'size' = 'date'): Media[] {
  return [...media].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      case 'name':
        return a.title.localeCompare(b.title);
      case 'size':
        return (b.size || 0) - (a.size || 0);
      default:
        return 0;
    }
  });
} 