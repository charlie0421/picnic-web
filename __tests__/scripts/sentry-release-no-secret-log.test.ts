import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** 빌드 로그에 토큰이 찍히거나, 토큰 파일이 추적되는 일이 다시 생기지 않게 고정한다. */
describe('Sentry 토큰 노출 방지', () => {
  it('빌드 설정 어디서도 SENTRY_AUTH_TOKEN 값을 로그에 찍지 않는다', () => {
    for (const file of ['next.config.js', 'scripts/sentry-build-options.js', 'scripts/generate-build-version.js']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src, file).not.toMatch(/console\.\w+\([^)]*SENTRY_AUTH_TOKEN/);
    }
  });

  it('.sentryclirc 는 gitignore 되고 예제 파일에는 토큰이 없다', () => {
    const ignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8');
    expect(ignore.split('\n')).toContain('.sentryclirc');
    const example = join(process.cwd(), '.sentryclirc.example');
    expect(existsSync(example)).toBe(true);
    expect(readFileSync(example, 'utf8')).not.toMatch(/token\s*=/);
  });
});
