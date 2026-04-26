/**
 * 이미지 URL 검증 및 안전한 처리 유틸리티
 *
 * Barrel re-export — 기존 import 경로(@/utils/image-utils) 유지
 */

// Types
export type {
  AvatarTransformOptions,
  SupabaseStorageReference,
  ResolveAvatarOptions,
} from './image/types';

// Supabase storage
export {
  extractSupabaseStorageReference,
  fetchSignedSupabaseImageUrl,
} from './image/supabase-storage';

// Avatar resolver
export { resolveAvatarUrlClient, preloadImage } from './image/avatar-resolver';

// Image optimizer
export {
  getProxiedImageUrl,
  getSafeGoogleImageUrl,
} from './image/image-optimizer';

// Provider avatar
export {
  extractAvatarFromProvider,
  getSafeAvatarUrl,
  createImageErrorHandler,
  isFailedImageUrl,
  isValidImageUrl,
} from './image/provider-avatar';
