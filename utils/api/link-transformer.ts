/**
 * 배너 링크를 웹 친화적인 형태로 변환하는 유틸리티 함수
 * 
 * @param link 변환할 링크 URL
 * @returns 변환된 웹 친화적인 URL
 */
export function transformBannerLink(link: string): string {
  if (!link) return link;

  try {
    // applink.picnic.fan을 www.picnic.fan으로 변환
    let transformedLink = link.replace('applink.picnic.fan', 'www.picnic.fan');
    
    // /vote/detail/을 /vote/로 변환
    transformedLink = transformedLink.replace('/vote/detail/', '/vote/');
    
    return transformedLink;
  } catch (error) {
    console.error('링크 변환 중 오류 발생:', error);
    return link; // 변환 실패 시 원래 링크 반환
  }
}

/**
 * 다양한 앱 링크 패턴을 웹 링크로 변환하는 함수
 * 
 * @param link 변환할 링크 URL
 * @returns 변환된 웹 링크
 */
export function transformAppLinkToWebLink(link: string): string {
  if (!link) return link;

  try {
    let transformedLink = link;
    
    // 각종 앱 링크 패턴을 웹 링크로 변환
    const transformations = [
      // applink.picnic.fan -> www.picnic.fan
      { from: 'applink.picnic.fan', to: 'www.picnic.fan' },
      // /vote/detail/ -> /vote/
      { from: '/vote/detail/', to: '/vote/' },
      // 추가 변환 규칙들을 필요에 따라 추가 가능
    ];
    
    transformations.forEach(({ from, to }) => {
      transformedLink = transformedLink.replace(from, to);
    });
    
    return transformedLink;
  } catch (error) {
    console.error('앱 링크 변환 중 오류 발생:', error);
    return link; // 변환 실패 시 원래 링크 반환
  }
} 