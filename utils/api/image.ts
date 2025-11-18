import { useLanguageStore } from "@/stores/languageStore";

/**
 * CDN 이미지 URL을 생성하는 유틸리티 함수
 *
 * @param path 이미지 경로
 * @param width 이미지 너비
 * @returns CDN 이미지 URL
 */
export const getCdnImageUrl = (
  path: string | null | undefined,
  width?: number,
  height?: number,
): string => {
  if (!path) return "";

  const cdnUrl = (process.env.NEXT_PUBLIC_CDN_URL || "").replace(/\/$/, "");
  let currentLang = "en"; // 기본값으로 영어 설정

  try {
    // 클라이언트 사이드에서만 store 접근
    if (typeof window !== "undefined") {
      currentLang = useLanguageStore.getState().currentLanguage;
    }
  } catch (e) {
    console.error("언어 스토어 접근 오류:", e);
  }

  // 이미 전체 URL인 경우: 변경하지 않고 그대로 반환 (CDN 경로 변경 시 안전한 기본값)
  if (path.startsWith("http://") || path.startsWith("https://")) {
    if (!cdnUrl) {
      return path.trim();
    }

    try {
      const absoluteUrl = new URL(path);
      const cdnHost = new URL(cdnUrl).host;

      if (absoluteUrl.host === cdnHost) {
        if (width) {
          absoluteUrl.searchParams.set("w", String(width));
        }
        if (height) {
          absoluteUrl.searchParams.set("h", String(height));
        }
        if (!absoluteUrl.searchParams.has("f")) {
          absoluteUrl.searchParams.set("f", "webp");
        }
        return absoluteUrl.toString();
      }

      return path.trim();
    } catch (e) {
      console.error("절대 경로 파싱 오류:", e);
      return path.trim();
    }
  }

  try {
    // JSON 형식의 다국어 경로인지 확인
    if (path.startsWith("{") && path.includes('":')) {
      const pathObj = JSON.parse(path);
      // 현재 언어의 경로가 있으면 사용, 없으면 영어나 한국어 순서로 시도
      const localizedPath = pathObj[currentLang] || pathObj.en || pathObj.ko ||
        Object.values(pathObj)[0];

      // 슬래시로 시작하는지 확인하고 공백 제거
      const normalizedPath = (localizedPath.startsWith("/")
        ? localizedPath.substring(1)
        : localizedPath).trim();

      // 최종 URL 생성 (CDN이 있을 때만 width 파라미터 적용)
      let query = "";
      if (cdnUrl) {
        const params = new URLSearchParams();
        if (width) {
          params.set("w", String(width));
          params.set("width", String(width));
        }
        if (height) {
          params.set("h", String(height));
          params.set("height", String(height));
        }
        if (!params.has("f")) {
          params.set("f", "webp");
        }
        query = `?${params.toString()}`;
      }
      const finalUrl = cdnUrl ? `${cdnUrl}/${normalizedPath}${query}` : `/${normalizedPath}`;
      return finalUrl;
    }
  } catch (e) {
    console.error("이미지 경로 파싱 오류:", e);
    // JSON 파싱 실패 시 원래 경로 사용
  }

  // 슬래시로 시작하는지 확인하고 공백 제거
  const normalizedPath = (path.startsWith("/") ? path.substring(1) : path)
    .trim();

  // 최종 URL 생성 (CDN이 있을 때만 width 파라미터 적용)
  let query = "";
  if (cdnUrl) {
    const params = new URLSearchParams();
    if (width) {
      params.set("w", String(width));
      params.set("width", String(width));
    }
    if (height) {
      params.set("h", String(height));
      params.set("height", String(height));
    }
    if (!params.has("f")) {
      params.set("f", "webp");
    }
    query = `?${params.toString()}`;
  }
  const finalUrl = cdnUrl ? `${cdnUrl}/${normalizedPath}${query}` : `/${normalizedPath}`;

  return finalUrl;
};
