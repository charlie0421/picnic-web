import { describe, it, expect } from 'vitest';
import { clientUpgradeMessage } from '@/lib/wallet/client-upgrade-message';

describe('clientUpgradeMessage', () => {
  it('구 번들이 그대로 띄울 수 있는 사람용 문장을 반환한다 (기계 코드가 아님)', () => {
    const msg = clientUpgradeMessage('ko');
    expect(msg).not.toContain('VOTE_CLIENT_UPGRADE_REQUIRED');
    expect(msg).not.toMatch(/^[A-Z_]+$/);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('Accept-Language 의 지역 태그를 기본 언어로 낮춰 매칭한다', () => {
    expect(clientUpgradeMessage('ko-KR')).toBe(clientUpgradeMessage('ko'));
    expect(clientUpgradeMessage('ja-JP')).toBe(clientUpgradeMessage('ja'));
  });

  it('q-value 가 붙은 목록에서 첫 지원 언어를 고른다', () => {
    expect(clientUpgradeMessage('ko-KR,ko;q=0.9,en-US;q=0.8')).toBe(clientUpgradeMessage('ko'));
  });

  it('지원하지 않는 언어만 있으면 영어로 떨어진다', () => {
    expect(clientUpgradeMessage('xx-YY,zz;q=0.9')).toBe(clientUpgradeMessage('en'));
  });

  it('헤더가 없으면 영어로 떨어진다', () => {
    expect(clientUpgradeMessage(null)).toBe(clientUpgradeMessage('en'));
    expect(clientUpgradeMessage('')).toBe(clientUpgradeMessage('en'));
  });

  it('앱 지원 언어를 모두 커버하고 각 언어가 영어 기본값으로 새지 않는다', () => {
    const english = clientUpgradeMessage('en');
    for (const lang of ['ko', 'ja', 'zh', 'es', 'vi', 'id', 'th', 'bn', 'tl', 'my']) {
      const msg = clientUpgradeMessage(lang);
      expect(msg, `${lang} 문구 누락`).toBeTruthy();
      expect(msg, `${lang} 가 영어 기본값으로 새고 있다`).not.toBe(english);
    }
    expect(english).toBeTruthy();
  });
});
