import { describe, it, expect } from 'vitest';
import { extractKeysFromSource } from '@/scripts/check-i18n-keys';

/**
 * i18n:check 는 코드의 t('key') 를 locale 파일과 대조한다.
 * `${…}` 가 들어간 템플릿 키는 런타임 값으로 완성되는 동적 키라 정적 대조 대상이 아니다
 * (예: t(`label_vote_${category}`) → label_vote_birthday). 예전에는 이 문자열 자체를
 * 누락 키로 보고해 번역이 다 있어도 exit 1 이었다.
 */
describe('extractKeysFromSource', () => {
  it('정적 키를 추출한다 (따옴표·백틱·tHtml·tDynamic)', () => {
    const source = [
      "t('payment_completed_title')",
      't("recharge_details")',
      't(`plain_template_key`)',
      "tHtml('label_html')",
      "tDynamic('label_dynamic')",
    ].join('\n');
    expect(extractKeysFromSource(source)).toEqual([
      'payment_completed_title',
      'recharge_details',
      'plain_template_key',
      'label_html',
      'label_dynamic',
    ]);
  });

  it('${…} 가 들어간 동적 템플릿 키는 제외한다', () => {
    const source = [
      't(`label_vote_${category}`)',
      't(`goonghap_gender_${subCategory}`)',
      "t('static_key')",
    ].join('\n');
    expect(extractKeysFromSource(source)).toEqual(['static_key']);
  });

  it('get(translations, …) 의 동적 템플릿 키도 제외한다', () => {
    const source = [
      "get(translations, 'common.loading')",
      'get(translations, `menu.${name}`)',
    ].join('\n');
    expect(extractKeysFromSource(source)).toEqual(['common.loading']);
  });
});
