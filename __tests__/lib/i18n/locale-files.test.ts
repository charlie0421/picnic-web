import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SUPPORTED_LANGUAGES } from '@/config/settings';

// 결제 완료 토스트·충전 결과 (components/client/star-candy/payment-polling-helpers.ts)
const PAYMENT_KEYS = [
  'payment_completed_title',
  'payment_completed_description',
  'recharge_details',
  'product_name_label',
  'recharge_star_candy_label',
  'bonus_star_candy_label',
  'payment_amount_label',
  'recharge_result',
  'total_recharge_star_candy_label',
  'current_balance_label',
  'unit_count',
  'currency_krw',
] as const;

// 수량 단위는 언어에 따라 붙이지 않는다 (en: "1,000")
const MAY_BE_EMPTY = new Set<string>(['unit_count']);

// 탈퇴 안내 다이얼로그 (components/ui/Dialog/WithdrawnUserDialog.tsx)
const WITHDRAWAL_KEYS = ['error_message_withdrawal_title', 'error_message_withdrawal_description'];

const loadLocale = (lang: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'locales', `${lang}.json`), 'utf-8'));

/**
 * 누락 키는 클라이언트에서 빈 문자열로 렌더링된다 (기본 언어 사전이 먼저 로드된 경우에만 폴백).
 * 6개 언어의 결제 완료 화면 라벨이 공백이었고, 탈퇴 다이얼로그는 제목·본문이 같은 문구로 중복됐다.
 */
describe.each(SUPPORTED_LANGUAGES)('public/locales/%s.json', (lang) => {
  const locale = loadLocale(lang);

  it('결제 완료·충전 결과 키가 모두 있다', () => {
    const missing = PAYMENT_KEYS.filter((key) => typeof locale[key] !== 'string');
    expect(missing).toEqual([]);
  });

  it('결제 라벨이 비어 있지 않다', () => {
    const empty = PAYMENT_KEYS.filter(
      (key) => !MAY_BE_EMPTY.has(key) && !String(locale[key] ?? '').trim(),
    );
    expect(empty).toEqual([]);
  });

  it('탈퇴 안내 제목·본문 키가 있고 서로 다르다', () => {
    const [title, description] = WITHDRAWAL_KEYS.map((key) => locale[key]);
    expect(typeof title === 'string' && title.trim()).toBeTruthy();
    expect(typeof description === 'string' && description.trim()).toBeTruthy();
    expect(title).not.toBe(description);
  });
});

// 중첩 객체를 점으로 이은 키로 편다(common.loading).
const flattenKeys = (value: unknown, prefix = ''): string[] =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    : [prefix];

/**
 * 한 언어 파일에만 있는 키는 다른 언어에서 빈 문자열이나 키 이름으로 렌더링된다.
 * 키를 추가할 때는 12개 언어 파일에 모두 넣는다(`npm run i18n:check` 의 "언어 간 불일치"와 같은 기준).
 */
describe('언어 파일 간 키 일치', () => {
  const reference = new Set(flattenKeys(loadLocale('en')));

  it.each(SUPPORTED_LANGUAGES.filter((lang) => lang !== 'en'))('%s 의 키 집합이 en 과 같다', (lang) => {
    const keys = new Set(flattenKeys(loadLocale(lang)));
    expect({
      missing: [...reference].filter((key) => !keys.has(key)),
      extra: [...keys].filter((key) => !reference.has(key)),
    }).toEqual({ missing: [], extra: [] });
  });
});
