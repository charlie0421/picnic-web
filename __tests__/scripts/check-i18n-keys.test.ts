import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  DYNAMIC_KEY_DOMAINS,
  extractKeysFromSource,
  loadLocaleFiles,
} from '@/scripts/check-i18n-keys';
import {
  CATEGORY_COLORS,
  SUB_CATEGORY_COLORS,
} from '@/components/client/vote/list/vote-card-utils';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

/**
 * i18n:check 는 코드의 t('key') 를 locale 파일과 대조한다.
 * `${…}` 가 들어간 템플릿 키는 런타임 값으로 완성되는 동적 키다 (예: t(`label_vote_${category}`)).
 * 템플릿을 통째로 건너뛰면 실제 누락(label_vote_accumulated 등)이 숨으므로, 값의 도메인이 유한한 템플릿은
 * DYNAMIC_KEY_DOMAINS 로 펼쳐 정적 키처럼 대조하고, 등록되지 않은 템플릿은 미등록으로 보고해 검사를 실패시킨다.
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
    expect(extractKeysFromSource(source)).toEqual({
      keys: [
        'payment_completed_title',
        'recharge_details',
        'plain_template_key',
        'label_html',
        'label_dynamic',
      ],
      unregisteredTemplates: [],
    });
  });

  it('등록된 동적 템플릿 키는 도메인 값으로 펼친다', () => {
    const source = [
      't(`label_vote_${category}`)',
      't(`goonghap_gender_${subCategory}`)',
      "t('static_key')",
    ].join('\n');
    expect(extractKeysFromSource(source)).toEqual({
      keys: [
        'label_vote_birthday',
        'label_vote_debut',
        'label_vote_accumulated',
        'label_vote_special',
        'label_vote_event',
        'label_vote_weekly',
        'goonghap_gender_male',
        'goonghap_gender_female',
        'goonghap_gender_group',
        'goonghap_gender_all',
        'static_key',
      ],
      unregisteredTemplates: [],
    });
  });

  it('등록되지 않은 동적 템플릿 키는 대조 키 대신 미등록으로 보고한다 (get(translations, …) 포함)', () => {
    const source = [
      't(`unknown_${value}`)',
      "get(translations, 'common.loading')",
      'get(translations, `menu.${name}`)',
    ].join('\n');
    expect(extractKeysFromSource(source)).toEqual({
      keys: ['common.loading'],
      unregisteredTemplates: ['unknown_${value}', 'menu.${name}'],
    });
  });
});

describe('vote-card-utils 동적 번역 키', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'components/client/vote/list/vote-card-utils.ts'),
    'utf-8',
  );

  it('도메인이 vote-card-utils 의 카테고리·서브카테고리 값을 모두 포함한다', () => {
    expect(DYNAMIC_KEY_DOMAINS['label_vote_${category}']).toEqual(
      expect.arrayContaining(Object.keys(CATEGORY_COLORS)),
    );
    expect(DYNAMIC_KEY_DOMAINS['goonghap_gender_${subCategory}']).toEqual(
      expect.arrayContaining(Object.keys(SUB_CATEGORY_COLORS)),
    );
  });

  it('카테고리·서브카테고리 라벨 키가 모든 locale 파일에 있다', () => {
    const { keys, unregisteredTemplates } = extractKeysFromSource(source);
    expect(unregisteredTemplates).toEqual([]);

    const locales = loadLocaleFiles();
    expect(locales.map(({ lang }) => lang).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());

    const missing = locales.flatMap(({ lang, keys: localeKeys }) =>
      keys.filter((key) => !localeKeys.has(key)).map((key) => `${lang}: ${key}`),
    );
    expect(missing).toEqual([]);
  });
});
