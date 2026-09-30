import type { ReactNode } from 'react';
import { inter } from '@/app/shell';

/**
 * 언어 세그먼트가 없는 페이지(/auth/*, /ads/*, 접두어 없는 리다이렉트 스텁)의 문서 뼈대.
 * 루트 레이아웃이 pass-through 라 여기서 <html>·<body> 를 렌더한다. 그룹 폴더는 URL 에 나타나지 않는다.
 *
 * - 메타데이터는 루트 레이아웃의 기본값(title 'Picnic', AdSense 계정 확인 메타)을 그대로 쓴다.
 * - 전역 CSS(globals.css)는 불러오지 않는다. 이 페이지들은 지금까지 Tailwind 없이 서비스됐다(예전 루트
 *   레이아웃은 전역 CSS 를 import 하지 않았다). 불러오면 preflight 가 광고 플레이어의 제목·버튼 기본
 *   스타일을 지우고 body 배경이 바뀌어, 앱 웹뷰에서 보이는 화면이 달라진다.
 * - AdSense 스크립트와 쿠키 배너는 싣지 않는다. 콘텐츠 페이지가 아니다.
 */
export default function BareLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <div className="bg-white">{children}</div>
      </body>
    </html>
  );
}
