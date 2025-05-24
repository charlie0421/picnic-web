// 미디어 관련 타입 정의

export interface Media {
  id: string;
  title: string;
  description?: string;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  duration?: number; // 비디오/오디오의 경우 (초 단위)
  size?: number; // 파일 크기 (바이트)
  width?: number;
  height?: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  tags?: string[];
}

export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface MediaFilter {
  type?: MediaType;
  tags?: string[];
  uploadedAfter?: string;
  uploadedBefore?: string;
  search?: string;
}

export interface MediaUploadProgress {
  mediaId: string;
  progress: number; // 0-100
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface MediaPlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
} 