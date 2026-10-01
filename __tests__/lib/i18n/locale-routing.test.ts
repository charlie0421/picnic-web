import { describe, expect, it } from 'vitest';
import {
  classifyFirstSegment,
  normalizeLanguageTag,
  resolvePreferredLanguage,
  type LanguageSignals,
} from '@/lib/i18n/locale-routing';

const signals = (partial: Partial<LanguageSignals> = {}): LanguageSignals => ({
  referer: null,
  host: 'www.picnic.fan',
  cookieLocale: null,
  acceptLanguage: null,
  ...partial,
});

describe('normalizeLanguageTag', () => {
  it.each([
    ['KO', 'ko'],
    ['zh_TW', 'zh-tw'],
    ['ZH-Hant-TW', 'zh-tw'],
    ['zh-Hans-TW', 'zh-cn'],
    ['zh', 'zh-cn'],
    ['zh-HK', 'zh-tw'],
    ['zh-SG', 'zh-cn'],
    ['en-US', 'en'],
    ['es-419', 'es'],
    ['jp', 'ja'],
    ['fil-PH', 'tl'],
    [' ko ', 'ko'],
  ])('%s → %s', (tag, expected) => {
    expect(normalizeLanguageTag(tag)).toBe(expected);
  });

  it.each(['pt-BR', '', '   ', 'xx', 'api'])('%j → null', (tag) => {
    expect(normalizeLanguageTag(tag)).toBeNull();
  });

  it('null·undefined 는 null', () => {
    expect(normalizeLanguageTag(null)).toBeNull();
    expect(normalizeLanguageTag(undefined)).toBeNull();
  });
});

describe('classifyFirstSegment', () => {
  it.each(['en', 'zh-tw', 'my'])('%s 는 canonical', (raw) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'canonical', lang: raw });
  });

  it.each([
    ['KO', 'ko'],
    ['zh', 'zh-cn'],
    ['en-US', 'en'],
    ['fil', 'tl'],
    ['fil-PH', 'tl'],
    ['%6Bo', 'ko'],
    ['%7A%68-tw', 'zh-tw'],
    ['zh_TW', 'zh-tw'],
    ['jp', 'ja'],
  ])('%s 는 variant(%s)', (raw, lang) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'variant', lang });
  });

  it.each([
    'xx', 'fr', 'pt-BR', 'login', 'api', 'ads', 'faq', 'wp-admin', '.env', 'favicon.ico',
    'my-page', 'id-card', 'en-route', 'my_page', '',
  ])('%j 는 other', (raw) => {
    expect(classifyFirstSegment(raw)).toEqual({ kind: 'other' });
  });

  it('잘못된 percent-encoding 은 undecodable', () => {
    expect(classifyFirstSegment('%E0%A4%A')).toEqual({ kind: 'undecodable' });
  });
});

describe('resolvePreferredLanguage', () => {
  it('호스트가 같은 Referer 의 정규 언어가 쿠키보다 앞선다', () => {
    expect(
      resolvePreferredLanguage(
        signals({ referer: 'https://www.picnic.fan/th/vote', cookieLocale: 'ja', acceptLanguage: 'ko' }),
      ),
    ).toBe('th');
  });

  it.each([
    ['호스트가 다른 Referer', 'https://evil.example/th/vote'],
    ['정규 언어가 아닌 Referer', 'https://www.picnic.fan/KO/vote'],
    ['언어가 없는 Referer', 'https://www.picnic.fan/login'],
    ['해석할 수 없는 Referer', 'not a url'],
  ])('%s 는 무시하고 쿠키로 간다', (_label, referer) => {
    expect(resolvePreferredLanguage(signals({ referer, cookieLocale: 'ja' }))).toBe('ja');
  });

  it('Host 헤더가 없으면 Referer 를 쓰지 않는다', () => {
    expect(
      resolvePreferredLanguage(signals({ referer: 'https://www.picnic.fan/th/vote', host: null, cookieLocale: 'ja' })),
    ).toBe('ja');
  });

  it('쿠키가 Accept-Language 보다 앞선다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: 'ja', acceptLanguage: 'ko-KR' }))).toBe('ja');
  });

  it('지원하지 않는 쿠키 값은 무시한다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: 'xx', acceptLanguage: 'ko-KR' }))).toBe('ko');
  });

  it('Accept-Language 는 q 가 큰 순서, 같으면 적힌 순서로 본다', () => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'fr;q=0.9,ja;q=0.8,ko;q=0.95' }))).toBe('ko');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'th,vi' }))).toBe('th');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.8' }))).toBe('zh-tw');
  });

  it('q=0, *, 숫자가 아닌 q 의 태그는 버린다', () => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'th;q=abc,vi;q=0.3' }))).toBe('vi');
    expect(resolvePreferredLanguage(signals({ acceptLanguage: 'ko;q=0,*;q=0.9,ja;q=0.1' }))).toBe('ja');
  });

  it('신호가 없으면 en', () => {
    expect(resolvePreferredLanguage(signals())).toBe('en');
  });

  // Review Focus 3: 깨진 헤더는 예외 없이 다음 신호로 넘어간다
  it.each([
    [';;;,,q='],
    [',,,,'],
    ['q=1'],
    [Array.from({ length: 500 }, (_, i) => `x${i};q=0.${i % 10}`).join(',')],
  ])('깨진 Accept-Language 는 en 으로 떨어진다', (acceptLanguage) => {
    expect(resolvePreferredLanguage(signals({ acceptLanguage }))).toBe('en');
  });

  it('깨진 쿠키 값은 무시한다', () => {
    expect(resolvePreferredLanguage(signals({ cookieLocale: '%E0%A4%A', acceptLanguage: 'ko' }))).toBe('ko');
  });
});
