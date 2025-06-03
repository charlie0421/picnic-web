'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from '@/config/settings';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  noindex?: boolean;
}

/**
 * 다국어 SEO 메타데이터 처리 컴포넌트
 * hreflang, canonical URL, Open Graph 태그 등을 자동으로 생성합니다.
 */
export default function SEOHead({
  title,
  description,
  keywords,
  image,
  noindex = false,
}: SEOHeadProps) {
  const pathname = usePathname();
  const { currentLocale, removeLocaleFromPath, getLocalizedPath } = useLocaleRouter();

  useEffect(() => {
    // 기존 메타 태그들 제거 (중복 방지)
    const existingMetaTags = document.querySelectorAll(
      'meta[name="description"], meta[name="keywords"], meta[property^="og:"], meta[name="twitter:"], link[rel="alternate"], link[rel="canonical"]'
    );
    existingMetaTags.forEach(tag => tag.remove());

    // 현재 경로에서 로케일 제거
    const cleanPath = removeLocaleFromPath(pathname);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://picnic-web.vercel.app';

    // Canonical URL 설정
    const canonicalUrl = `${baseUrl}${getLocalizedPath(cleanPath, currentLocale)}`;
    const canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    canonicalLink.href = canonicalUrl;
    document.head.appendChild(canonicalLink);

    // hreflang 태그들 생성
    SUPPORTED_LANGUAGES.forEach((lang) => {
      const langUrl = `${baseUrl}${getLocalizedPath(cleanPath, lang)}`;
      const hreflangLink = document.createElement('link');
      hreflangLink.rel = 'alternate';
      hreflangLink.hreflang = lang;
      hreflangLink.href = langUrl;
      document.head.appendChild(hreflangLink);
    });

    // x-default hreflang (기본 언어)
    const defaultLangUrl = `${baseUrl}${getLocalizedPath(cleanPath, DEFAULT_LANGUAGE)}`;
    const defaultHreflangLink = document.createElement('link');
    defaultHreflangLink.rel = 'alternate';
    defaultHreflangLink.hreflang = 'x-default';
    defaultHreflangLink.href = defaultLangUrl;
    document.head.appendChild(defaultHreflangLink);

    // 메타 태그들 추가
    if (description) {
      const descriptionMeta = document.createElement('meta');
      descriptionMeta.name = 'description';
      descriptionMeta.content = description;
      document.head.appendChild(descriptionMeta);
    }

    if (keywords) {
      const keywordsMeta = document.createElement('meta');
      keywordsMeta.name = 'keywords';
      keywordsMeta.content = keywords;
      document.head.appendChild(keywordsMeta);
    }

    if (noindex) {
      const robotsMeta = document.createElement('meta');
      robotsMeta.name = 'robots';
      robotsMeta.content = 'noindex, nofollow';
      document.head.appendChild(robotsMeta);
    }

    // Open Graph 태그들
    const ogTags = [
      { property: 'og:title', content: title || document.title },
      { property: 'og:description', content: description || '' },
      { property: 'og:url', content: canonicalUrl },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: currentLocale },
      { property: 'og:site_name', content: 'Picnic' },
    ];

    if (image) {
      ogTags.push({ property: 'og:image', content: image });
      ogTags.push({ property: 'og:image:alt', content: title || 'Picnic' });
    }

    ogTags.forEach(({ property, content }) => {
      if (content) {
        const ogMeta = document.createElement('meta');
        ogMeta.setAttribute('property', property);
        ogMeta.content = content;
        document.head.appendChild(ogMeta);
      }
    });

    // 다른 언어들을 위한 og:locale:alternate
    SUPPORTED_LANGUAGES.forEach((lang) => {
      if (lang !== currentLocale) {
        const ogLocaleMeta = document.createElement('meta');
        ogLocaleMeta.setAttribute('property', 'og:locale:alternate');
        ogLocaleMeta.content = lang;
        document.head.appendChild(ogLocaleMeta);
      }
    });

    // Twitter Card 태그들
    const twitterTags = [
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title || document.title },
      { name: 'twitter:description', content: description || '' },
    ];

    if (image) {
      twitterTags.push({ name: 'twitter:image', content: image });
    }

    twitterTags.forEach(({ name, content }) => {
      if (content) {
        const twitterMeta = document.createElement('meta');
        twitterMeta.name = name;
        twitterMeta.content = content;
        document.head.appendChild(twitterMeta);
      }
    });

    // 페이지 제목 설정
    if (title) {
      document.title = `${title} | Picnic`;
    }

  }, [pathname, currentLocale, title, description, keywords, image, noindex, removeLocaleFromPath, getLocalizedPath]);

  return null; // 이 컴포넌트는 UI를 렌더링하지 않음
}