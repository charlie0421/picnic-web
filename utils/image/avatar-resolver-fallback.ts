/**
 * 아바타 URL 폴백 해석 로직
 *
 * avatar-resolver.ts에서 분리된 폴백 후보 생성 및 로드 시도 함수들.
 */

import {
  AvatarTransformOptions,
  AvatarDebugStep,
  ResolveAvatarOptions,
} from './types';
import {
  extractSupabaseStorageReference,
  fetchSignedSupabaseImageUrl,
  buildSupabaseObjectUrl,
} from './supabase-storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StorageReference = ReturnType<typeof extractSupabaseStorageReference>;

export interface FallbackCandidate {
  url: string;
  isSigned: boolean;
}

export interface BuildFallbackCandidatesParams {
  reference: StorageReference;
  wasSigned: boolean;
  hasTransformOpts: boolean;
  originalUrlWithoutTransform: string;
  avatarUrl: string;
  finalUrl: string;
  fallbackUrl: string;
  transform: AvatarTransformOptions;
  options: ResolveAvatarOptions;
}

// ---------------------------------------------------------------------------
// buildFallbackCandidates
// ---------------------------------------------------------------------------

/**
 * 폴백 후보 URL 배열을 구성합니다.
 *
 * - reference && wasSigned && hasTransform: 변환 없는 서명 URL 획득 후 후보에 추가
 * - reference && !isSigned: 공개 오브젝트 URL 후보에 추가
 * - originalUrlWithoutTransform 이 finalUrl/fallbackUrl 과 다르면 추가
 * - avatarUrl 이 finalUrl 과 다르면 추가
 */
export async function buildFallbackCandidates(
  params: BuildFallbackCandidatesParams,
): Promise<FallbackCandidate[]> {
  const {
    reference,
    wasSigned,
    hasTransformOpts,
    originalUrlWithoutTransform,
    avatarUrl,
    finalUrl,
    fallbackUrl,
    transform,
    options,
  } = params;

  const candidates: FallbackCandidate[] = [];

  if (reference) {
    if (wasSigned && hasTransformOpts) {
      const signedWithoutTransform = await fetchSignedSupabaseImageUrl(
        reference,
        {},
        { signal: options.signal, expiresIn: options.expiresIn },
      );
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (signedWithoutTransform) {
        candidates.push({
          url: signedWithoutTransform,
          isSigned: true,
        });
      }
    }

    if (!reference.isSigned) {
      const objectUrl = buildSupabaseObjectUrl(reference);
      if (objectUrl) {
        candidates.push({
          url: objectUrl,
          isSigned: false,
        });
      }
    }
  }

  if (
    originalUrlWithoutTransform &&
    originalUrlWithoutTransform !== finalUrl &&
    originalUrlWithoutTransform !== fallbackUrl
  ) {
    candidates.push({
      url: originalUrlWithoutTransform,
      isSigned: wasSigned,
    });
  }

  if (avatarUrl && avatarUrl !== finalUrl) {
    candidates.push({
      url: avatarUrl,
      isSigned: wasSigned,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// tryLoadCandidates
// ---------------------------------------------------------------------------

/**
 * 폴백 후보를 순서대로 시도하여 첫 번째 성공 결과를 반환합니다.
 * 모두 실패하면 null 을 반환합니다.
 */
export async function tryLoadCandidates(
  candidates: FallbackCandidate[],
  options: { signal?: AbortSignal },
  recordStep: (step: AvatarDebugStep) => void,
  preloadImageFn: (url: string) => Promise<boolean>,
): Promise<{ url: string; isFallback: boolean; isSigned: boolean } | null> {
  for (const candidate of candidates) {
    if (!candidate.url) continue;
    recordStep({
      stage: 'fallback-candidate',
      url: candidate.url,
      isSignedCandidate: candidate.isSigned,
    });
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const ok = await preloadImageFn(candidate.url);
      if (ok) {
        recordStep({
          stage: 'fallback-candidate',
          url: candidate.url,
          result: 'success',
          isSignedCandidate: candidate.isSigned,
        });
        return {
          url: candidate.url,
          isFallback: false,
          isSigned: candidate.isSigned,
        };
      }
      recordStep({
        stage: 'fallback-candidate',
        url: candidate.url,
        result: 'error',
        message: 'preload_image_false',
        isSignedCandidate: candidate.isSigned,
      });
    } catch (error) {
      recordStep({
        stage: 'fallback-candidate',
        url: candidate.url,
        result: 'error',
        message: error instanceof Error ? error.message : String(error),
        isSignedCandidate: candidate.isSigned,
      });
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.warn('🖼️ [ImageUtils] 아바타 폴백 로드 실패:', {
        candidate: candidate.url,
        error,
      });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// tryObjectUrl
// ---------------------------------------------------------------------------

/**
 * 공개 오브젝트 URL 을 마지막 수단으로 시도합니다.
 * 성공하면 결과를, 실패하면 null 을 반환합니다.
 */
export async function tryObjectUrl(
  reference: NonNullable<StorageReference>,
  recordStep: (step: AvatarDebugStep) => void,
  preloadImageFn: (url: string) => Promise<boolean>,
): Promise<{ url: string; isFallback: boolean; isSigned: boolean } | null> {
  const objectUrl = buildSupabaseObjectUrl(reference);
  if (!objectUrl) return null;

  recordStep({
    stage: 'object-url',
    url: objectUrl,
    isSignedCandidate: reference.isSigned,
  });

  try {
    const ok = await preloadImageFn(objectUrl);
    if (ok) {
      recordStep({
        stage: 'object-url',
        url: objectUrl,
        result: 'success',
        isSignedCandidate: reference.isSigned,
      });
      return {
        url: objectUrl,
        isFallback: false,
        isSigned: reference.isSigned,
      };
    }
    recordStep({
      stage: 'object-url',
      url: objectUrl,
      result: 'error',
      message: 'preload_image_false',
      isSignedCandidate: reference.isSigned,
    });
  } catch (error) {
    recordStep({
      stage: 'object-url',
      url: objectUrl,
      result: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    console.warn('🖼️ [ImageUtils] 공개 오브젝트 URL 로드 실패:', {
      objectUrl,
      error,
    });
  }

  return null;
}
