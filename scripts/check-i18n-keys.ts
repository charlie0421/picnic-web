/*
  i18n translation keys cross-checker
  - 스캔: ts/tsx 파일에서 t('key')/t("key")/t(`key`) 패턴과 get(translations, 'a.b') 패턴을 추출
  - 비교: public/locales/*.json의 키들과 상호 비교
  - 출력: 누락 키(코드에는 있는데 일부/모든 언어 파일에 없음), 미사용 키(언어 파일에는 있는데 코드에서 안 씀), 언어 간 불일치(언어별 키 집합 차이)
*/

import fs from 'fs';
import path from 'path';

type LangFile = {
  lang: string;
  keys: Set<string>;
};

const projectRoot = process.cwd();
const srcDirs = [
  'app',
  'components',
  'hooks',
  'lib',
  'stores',
  'utils',
  'contexts',
  // config 내 JSON에서 i18nKey를 사용하는 항목도 스캔 대상에 포함
  'config',
];

const localesDir = path.join(projectRoot, 'public', 'locales');

function walk(dir: string, exts: string[], files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, exts, files);
    } else if (exts.includes(path.extname(name))) {
      files.push(full);
    }
  }
  return files;
}

function flattenJson(obj: any, prefix = ''): string[] {
  const result: string[] = [];
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        result.push(...flattenJson(v, p));
      } else {
        result.push(p);
      }
    }
  }
  return result;
}

function loadLocaleFiles(): LangFile[] {
  if (!fs.existsSync(localesDir)) {
    console.error(`Locales directory not found: ${localesDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));
  return files.map((file) => {
    const lang = path.basename(file, '.json');
    const json = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
    return { lang, keys: new Set(flattenJson(json)) };
  });
}

// 코드에서 번역 키 추출
// - t('...') / t("...") / t(`...`)
// - tHtml('...') / tDynamic('...') 포함
// - lodash.get(translations, 'a.b.c') 형태도 스캔
// - 제한: 정적 문자열 리터럴만 대상 (동적 변수는 제외)
const T_CALL_REGEX = /\b(?:t|tHtml|tDynamic)\(\s*(?:"([^"\n\r]*)"|'([^'\n\r]*)'|`([^`\n\r]*)`)/g;
const GET_TRANSLATIONS_REGEX = /\bget\(\s*translations\s*,\s*(?:"([^"\n\r]*)"|'([^'\n\r]*)'|`([^`\n\r]*)`)\s*\)/g;

// config/*.json에서 i18nKey 값을 추출
function extractKeysFromConfigJson(filePath: string): string[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);
    const keys: string[] = [];
    const walk = (v: any) => {
      if (Array.isArray(v)) {
        v.forEach(walk);
      } else if (v && typeof v === 'object') {
        if (typeof v.i18nKey === 'string' && v.i18nKey.trim()) keys.push(v.i18nKey.trim());
        Object.values(v).forEach(walk);
      }
    };
    walk(json);
    return keys;
  } catch {
    return [];
  }
}

function extractKeysFromFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const keys: string[] = [];

  // t('key')류
  {
    const iter = content.matchAll(T_CALL_REGEX);
    let match = iter.next();
    while (!match.done) {
      const m = match.value as RegExpExecArray;
      const key = (m[1] || m[2] || m[3] || '').trim();
      if (key) keys.push(key);
      match = iter.next();
    }
  }

  // get(translations, 'a.b')류
  {
    const iter = content.matchAll(GET_TRANSLATIONS_REGEX);
    let match = iter.next();
    while (!match.done) {
      const m = match.value as RegExpExecArray;
      const key = (m[1] || m[2] || m[3] || '').trim();
      if (key) keys.push(key);
      match = iter.next();
    }
  }

  return keys;
}

function main() {
  const localeFiles = loadLocaleFiles();
  const allLocaleKeys = new Set<string>();
  for (const lf of localeFiles) {
    lf.keys.forEach((k) => allLocaleKeys.add(k));
  }

  const tsFiles: string[] = [];
  for (const dir of srcDirs) {
    tsFiles.push(...walk(path.join(projectRoot, dir), ['.ts', '.tsx']));
  }

  const usedKeys = new Set<string>();
  for (const f of tsFiles) {
    try {
      extractKeysFromFile(f).forEach((k) => usedKeys.add(k));
    } catch {
      // ignore file read/parse errors
    }
  }

  // config JSON의 i18nKey 추가 추출 (예: config/menu.json)
  const configJsonFiles = walk(path.join(projectRoot, 'config'), ['.json']);
  for (const f of configJsonFiles) {
    extractKeysFromConfigJson(f).forEach((k) => usedKeys.add(k));
  }

  // 누락 키: 코드에서 사용했지만 특정 언어 파일에 없음
  const missingByLang: Record<string, string[]> = {};
  for (const { lang, keys } of localeFiles) {
    const missing = Array.from(usedKeys).filter((k) => !keys.has(k));
    if (missing.length) missingByLang[lang] = missing.sort();
  }

  // 미사용 키: 언어 파일에는 있으나 코드에서 한 번도 사용되지 않음
  const unusedByLang: Record<string, string[]> = {};
  for (const { lang, keys } of localeFiles) {
    const unused = Array.from(keys).filter((k) => !usedKeys.has(k));
    if (unused.length) unusedByLang[lang] = unused.sort();
  }

  // 언어 간 불일치: 기준(모든 언어의 합집합) 대비 누락
  const mismatchByLang: Record<string, string[]> = {};
  for (const { lang, keys } of localeFiles) {
    const diff = Array.from(allLocaleKeys).filter((k) => !keys.has(k));
    if (diff.length) mismatchByLang[lang] = diff.sort();
  }

  // 결과 출력
  const hr = () => console.log('\n' + '-'.repeat(80) + '\n');
  console.log('🌐 i18n 번역 키 상호 조회 결과');
  console.log(`- 스캔 대상 소스: ${srcDirs.join(', ')}`);
  console.log(`- 스캔 파일 수: ${tsFiles.length}`);
  console.log(`- 언어 파일: ${localeFiles.map((l) => l.lang).join(', ')}`);
  console.log(`- 코드에서 사용된 키 수: ${usedKeys.size}`);
  console.log(`- 언어 파일 총 키 수(합집합): ${allLocaleKeys.size}`);
  hr();

  const printSection = (title: string, data: Record<string, string[]>) => {
    console.log(`▶ ${title}`);
    const langs = Object.keys(data);
    if (langs.length === 0) {
      console.log('  없음');
      hr();
      return;
    }
    for (const lang of langs) {
      console.log(`  - ${lang} (${data[lang].length}개)`);
      for (const k of data[lang]) {
        console.log(`    • ${k}`);
      }
    }
    hr();
  };

  printSection('누락 키 (코드에는 있으나 해당 언어 파일에 없음)', missingByLang);
  printSection('미사용 키 (언어 파일에는 있으나 코드에서 미사용)', unusedByLang);
  printSection('언어 간 불일치 (다른 언어에는 있으나 해당 언어에는 없음)', mismatchByLang);

  // 종료 코드: 누락 키가 존재하면 비정상 종료로 간주(옵션)
  const hasMissing = Object.values(missingByLang).some((arr) => arr.length > 0);
  process.exit(hasMissing ? 1 : 0);
}

main();


