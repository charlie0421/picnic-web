import { Metadata } from 'next';
import { DEFAULT_METADATA } from './utils/metadata-utils';
import { SITE_URL, SOCIAL_LINKS } from './constants/static-pages';

/**
 * 기본 메타데이터 정의
 * 이 파일은 별도로 사용되지 않으며, 메타데이터 유틸리티로 대체됩니다.
 * @deprecated 대신 utils/metadata-utils의 DEFAULT_METADATA와 관련 유틸리티를 사용하세요.
 */
export const metadata: Metadata = {
  ...DEFAULT_METADATA,
  openGraph: {
    ...DEFAULT_METADATA.openGraph,
    images: [
      {
        url: `${SITE_URL}/images/og-image.jpg`,
        width: 1200,
        height: 630,
        alt: '피크닉 - K-Pop 아티스트를 위한 투표 및 미디어 플랫폼',
      }
    ],
    siteName: '피크닉',
    locale: 'ko_KR',
  },
  twitter: {
    ...DEFAULT_METADATA.twitter,
    site: '@picnic',
    creator: '@picnic',
    card: 'summary_large_image',
  },
};
