import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 원격 스키마로 추적 파일(types/supabase.ts)을 덮어쓰는 타입 생성은 명시적 명령으로만 실행한다.
 * dev/build/start 의 pre 훅이 네트워크·Supabase CLI 에 의존하거나 작업 트리를 바꾸면 안 된다.
 */
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('schema type generation scripts', () => {
  it('어떤 pre* 훅도 타입 생성을 호출하지 않는다', () => {
    const offenders = Object.entries(pkg.scripts)
      .filter(([name]) => name.startsWith('pre'))
      .filter(([, cmd]) => /gen:types|schema:types|supabase gen types/.test(cmd))
      .map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  it('명시적 동기화 명령 schema:types:sync 가 있고 gen:types 는 그 별칭이다', () => {
    expect(pkg.scripts['schema:types:sync']).toBe('sh scripts/sync-schema-types.sh');
    expect(pkg.scripts['gen:types']).toBe('npm run -s schema:types:sync');
  });

  it('동기화 스크립트는 임시 파일에 생성한 뒤 검증하고 교체한다(실패 시 기존 파일 보존)', () => {
    const script = readFileSync(join(process.cwd(), 'scripts/sync-schema-types.sh'), 'utf8');
    expect(script).toMatch(/set -eu/);
    expect(script).toMatch(/mktemp/);
    expect(script).toMatch(/export type Database/);
    expect(script).toMatch(/mv "\$tmp" types\/supabase\.ts/);
  });
});
