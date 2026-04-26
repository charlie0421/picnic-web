/**
 * 이미지 유틸리티 공통 타입, 인터페이스, 상수
 */

export interface AvatarTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  format?: 'webp' | 'png' | 'jpg' | 'jpeg' | 'avif';
}

export const SUPABASE_RENDER_PATH = '/storage/v1/render/image/';
export const SUPABASE_RENDER_SIGN_PATH = '/storage/v1/render/image/sign/';
export const SUPABASE_OBJECT_PATH = '/storage/v1/object/';
export const ENABLE_AVATAR_DEBUG =
  process.env.NEXT_PUBLIC_ENABLE_AVATAR_LOG === 'true';

export type AvatarDebugStep = {
  stage: string;
  url?: string | null;
  result?: 'success' | 'error';
  message?: string;
  isSignedCandidate?: boolean;
  timestamp?: number;
};

export interface AvatarDebugLogPayload {
  original: string | null | undefined;
  final: string;
  isFallback: boolean;
  isSigned: boolean;
  transform: AvatarTransformOptions;
  steps: AvatarDebugStep[];
}

export interface SupabaseStorageReference {
  bucket: string;
  path: string;
  isSigned: boolean;
  isPublic: boolean;
  originalUrl?: string;
}

export interface ResolveAvatarOptions {
  fallbackUrl?: string;
  useProxy?: boolean;
  signal?: AbortSignal;
  expiresIn?: number;
}

export function hasTransformOptions(options: AvatarTransformOptions): boolean {
  return Boolean(
    options &&
      (options.width ||
        options.height ||
        options.quality ||
        options.resize ||
        options.format),
  );
}

export function sanitizeDimension(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.max(1, Math.round(value));
}

export function clampQuality(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function encodePathSegment(segment: string): string {
  try {
    return encodeURIComponent(segment);
  } catch {
    return segment;
  }
}
