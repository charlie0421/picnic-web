/**
 * 아바타 URL 해석 및 이미지 프리로딩
 */

import {
  AvatarTransformOptions,
  AvatarDebugStep,
  ResolveAvatarOptions,
  ENABLE_AVATAR_DEBUG,
  hasTransformOptions,
} from './types';
import {
  extractSupabaseStorageReference,
  fetchSignedSupabaseImageUrl,
  sendAvatarDebugLog,
  buildSupabaseObjectUrl,
} from './supabase-storage';
import { isValidImageUrl, getSafeAvatarUrl } from './provider-avatar';

export async function resolveAvatarUrlClient(
  avatarUrl: string | null | undefined,
  transform: AvatarTransformOptions = {},
  options: ResolveAvatarOptions = {},
): Promise<{ url: string; isFallback: boolean; isSigned: boolean }> {
  const debugSteps: AvatarDebugStep[] = [];
  const recordStep = ENABLE_AVATAR_DEBUG
    ? (step: AvatarDebugStep) => {
        debugSteps.push({ ...step, timestamp: Date.now() });
      }
    : () => {};
  const finalize = (result: {
    url: string;
    isFallback: boolean;
    isSigned: boolean;
  }) => {
    if (ENABLE_AVATAR_DEBUG) {
      sendAvatarDebugLog({
        original: avatarUrl ?? null,
        final: result.url,
        isFallback: result.isFallback,
        isSigned: result.isSigned,
        transform,
        steps: debugSteps,
      });
    }
    return result;
  };

  recordStep({ stage: 'start', url: avatarUrl || null });

  const fallbackUrl = options.fallbackUrl ?? '/images/default-avatar.svg';
  const useProxy = options.useProxy ?? false;

  if (typeof window === 'undefined') {
    const resolved = getSafeAvatarUrl(
      avatarUrl,
      fallbackUrl,
      useProxy,
      transform,
    );
    const isFallback = !avatarUrl || !resolved || resolved === fallbackUrl;
    recordStep({
      stage: 'ssr',
      url: resolved,
      result: isFallback ? 'error' : 'success',
    });
    return finalize({
      url: isFallback ? fallbackUrl : resolved,
      isFallback,
      isSigned: false,
    });
  }

  if (!avatarUrl) {
    recordStep({
      stage: 'empty-avatar',
      url: fallbackUrl,
      result: 'error',
      message: 'avatarUrl is empty',
    });
    return finalize({ url: fallbackUrl, isFallback: true, isSigned: false });
  }

  const reference =
    extractSupabaseStorageReference(avatarUrl) ||
    extractSupabaseStorageReference(
      getSafeAvatarUrl(avatarUrl, fallbackUrl, useProxy),
    );

  const originalUrlWithoutTransform = getSafeAvatarUrl(
    avatarUrl,
    fallbackUrl,
    useProxy,
  );

  let finalUrl = getSafeAvatarUrl(
    avatarUrl,
    fallbackUrl,
    useProxy,
    transform,
  ) || fallbackUrl;
  let wasSigned = false;

  if (reference && options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (reference && !reference.isSigned) {
    const signedUrl = await fetchSignedSupabaseImageUrl(reference, transform, {
      signal: options.signal,
      expiresIn: options.expiresIn,
    });
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (signedUrl) {
      finalUrl = signedUrl;
      wasSigned = true;
      recordStep({
        stage: 'signed-url',
        url: signedUrl,
        isSignedCandidate: true,
      });
    }
  }

  if (!finalUrl) {
    recordStep({
      stage: 'no-final-url',
      url: fallbackUrl,
      result: 'error',
      message: 'finalUrl is empty',
    });
    return finalize({ url: fallbackUrl, isFallback: true, isSigned: wasSigned });
  }

  try {
    const ok = await preloadImage(finalUrl);
    if (ok) {
      recordStep({
        stage: 'initial-load',
        url: finalUrl,
        result: 'success',
        isSignedCandidate: wasSigned,
      });
      return finalize({ url: finalUrl, isFallback: false, isSigned: wasSigned });
    }
    recordStep({
      stage: 'initial-load',
      url: finalUrl,
      result: 'error',
      message: 'preload_image_false',
      isSignedCandidate: wasSigned,
    });
  } catch (error) {
    recordStep({
      stage: 'initial-load',
      url: finalUrl,
      result: 'error',
      message: error instanceof Error ? error.message : String(error),
      isSignedCandidate: wasSigned,
    });
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.warn('🖼️ [ImageUtils] 아바타 이미지 사전 로드 실패:', {
      avatarUrl,
      error,
    });
  }

  const fallbackCandidates: Array<{
    url: string;
    isSigned: boolean;
  }> = [];

  if (reference) {
    if (wasSigned && hasTransformOptions(transform)) {
      const signedWithoutTransform = await fetchSignedSupabaseImageUrl(
        reference,
        {},
        { signal: options.signal, expiresIn: options.expiresIn },
      );
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (signedWithoutTransform) {
        fallbackCandidates.push({
          url: signedWithoutTransform,
          isSigned: true,
        });
      }
    }

    if (!reference.isSigned) {
      const objectUrl = buildSupabaseObjectUrl(reference);
      if (objectUrl) {
        fallbackCandidates.push({
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
    fallbackCandidates.push({
      url: originalUrlWithoutTransform,
      isSigned: wasSigned,
    });
  }

  if (avatarUrl && avatarUrl !== finalUrl) {
    fallbackCandidates.push({
      url: avatarUrl,
      isSigned: wasSigned,
    });
  }

  for (const candidate of fallbackCandidates) {
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
      const ok = await preloadImage(candidate.url);
      if (ok) {
        recordStep({
          stage: 'fallback-candidate',
          url: candidate.url,
          result: 'success',
          isSignedCandidate: candidate.isSigned,
        });
        return finalize({
          url: candidate.url,
          isFallback: false,
          isSigned: candidate.isSigned,
        });
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

  if (reference) {
    const objectUrl = buildSupabaseObjectUrl(reference);
    if (objectUrl) {
      recordStep({
        stage: 'object-url',
        url: objectUrl,
        isSignedCandidate: reference.isSigned,
      });
      try {
        const ok = await preloadImage(objectUrl);
        if (ok) {
          recordStep({
            stage: 'object-url',
            url: objectUrl,
            result: 'success',
            isSignedCandidate: reference.isSigned,
          });
          return finalize({
            url: objectUrl,
            isFallback: false,
            isSigned: reference.isSigned,
          });
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
    }
  }

  recordStep({
    stage: 'final-fallback',
    url: fallbackUrl,
    result: 'error',
    message: '모든 폴백 실패',
  });
  return finalize({ url: fallbackUrl, isFallback: true, isSigned: wasSigned });
}

/**
 * 이미지 로딩 테스트 (프리로딩)
 */
export function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isValidImageUrl(url)) {
      resolve(false);
      return;
    }

    const img = new Image();
    const timeout = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, 5000); // 5초 타임아웃으로 증가

    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      console.warn('🖼️ [ImageUtils] 이미지 로딩 실패:', url);
      resolve(false);
    };

    img.src = url;
  });
}
