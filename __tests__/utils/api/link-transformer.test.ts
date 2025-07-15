import { transformBannerLink, transformAppLinkToWebLink } from '@/utils/api/link-transformer';

describe('link-transformer', () => {
  describe('transformBannerLink', () => {
    test('앱 링크를 웹 링크로 변환한다', () => {
      const appLink = 'https://applink.picnic.fan/vote/detail/90';
      const expected = 'https://www.picnic.fan/vote/90';
      
      const result = transformBannerLink(appLink);
      
      expect(result).toBe(expected);
    });

    test('이미 웹 링크인 경우 그대로 반환한다', () => {
      const webLink = 'https://www.picnic.fan/vote/90';
      
      const result = transformBannerLink(webLink);
      
      expect(result).toBe(webLink);
    });

    test('빈 문자열을 입력하면 빈 문자열을 반환한다', () => {
      const result = transformBannerLink('');
      
      expect(result).toBe('');
    });

    test('null 또는 undefined를 입력하면 원래 값을 반환한다', () => {
      expect(transformBannerLink(null as any)).toBe(null);
      expect(transformBannerLink(undefined as any)).toBe(undefined);
    });

    test('다른 형태의 링크는 그대로 반환한다', () => {
      const otherLink = 'https://example.com/test';
      
      const result = transformBannerLink(otherLink);
      
      expect(result).toBe(otherLink);
    });
  });

  describe('transformAppLinkToWebLink', () => {
    test('여러 패턴의 앱 링크를 웹 링크로 변환한다', () => {
      const appLink = 'https://applink.picnic.fan/vote/detail/90';
      const expected = 'https://www.picnic.fan/vote/90';
      
      const result = transformAppLinkToWebLink(appLink);
      
      expect(result).toBe(expected);
    });

    test('도메인만 변환이 필요한 경우도 처리한다', () => {
      const appLink = 'https://applink.picnic.fan/other/page';
      const expected = 'https://www.picnic.fan/other/page';
      
      const result = transformAppLinkToWebLink(appLink);
      
      expect(result).toBe(expected);
    });

    test('경로만 변환이 필요한 경우도 처리한다', () => {
      const appLink = 'https://www.picnic.fan/vote/detail/90';
      const expected = 'https://www.picnic.fan/vote/90';
      
      const result = transformAppLinkToWebLink(appLink);
      
      expect(result).toBe(expected);
    });
  });
}); 