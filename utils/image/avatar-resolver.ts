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
} from './supabase-storage';
import { isValidImageUrl, getSafeAvatarUrl } from './provider-avatar';
import {
  buildFallbackCandidates,
  tryLoadCandidates,
  tryObjectUrl,
} from './avatar-resolver-fallback';

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

  // Build fallback candidates
  const fallbackCandidates = await buildFallbackCandidates({
    reference,
    wasSigned,
    hasTransformOpts: hasTransformOptions(transform),
    originalUrlWithoutTransform,
    avatarUrl,
    finalUrl,
    fallbackUrl,
    transform,
    options,
  });

  // Try fallback candidates
  const candidateResult = await tryLoadCandidates(
    fallbackCandidates,
    options,
    recordStep,
    preloadImage,
  );
  if (candidateResult) return finalize(candidateResult);

  // Try object URL as last resort
  if (reference) {
    const objectResult = await tryObjectUrl(reference, recordStep, preloadImage);
    if (objectResult) return finalize(objectResult);
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
