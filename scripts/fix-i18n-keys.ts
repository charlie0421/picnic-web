/*
  i18n fixer
  순서:
  1) 미사용 키 제거: 코드에서 한 번도 사용되지 않는 키를 각 언어 파일에서 제거
  2) 누락 키 채우기: 코드에서 사용하는데 언어 파일에 없는 키를 기본 언어(en)의 값을 복사해 채움(없으면 키 문자열로 채움)
  3) 언어 간 불일치 해소: 모든 언어가 동일한 키 집합을 갖도록 맞춤

  안전장치:
  - 백업 파일 생성: public/locales/*.json.bak-YYYYMMDDHHmmss
*/

import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');
const srcDirs = ['app', 'components', 'hooks', 'lib', 'stores', 'utils', 'contexts'];
const DEFAULT_LANG = 'en';

function timestamp() {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

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
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        result.push(...flattenJson(v, p));
      } else {
        result.push(p);
      }
    }
  }
  return result;
}

function setByPath(obj: any, pathStr: string, value: any) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cur[key] !== 'object' || cur[key] === null || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function deleteByPath(obj: any, pathStr: string) {
  const parts = pathStr.split('.');
  let cur = obj;
  let traversable = true;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cur[key] !== 'object' || cur[key] === null || Array.isArray(cur[key])) {
      traversable = false;
      break;
    }
    cur = cur[key];
  }
  if (traversable && cur && Object.prototype.hasOwnProperty.call(cur, parts[parts.length - 1])) {
    delete cur[parts[parts.length - 1]];
    return;
  }
  // Fallback: 리터럴 키("a.b.c") 자체가 상위 객체에 존재하는 경우 제거
  if (Object.prototype.hasOwnProperty.call(obj, pathStr)) {
    delete (obj as any)[pathStr];
  }
}

const T_CALL_REGEX = /\b(?:t|tHtml|tDynamic)\(\s*(?:"([^"\n\r]*)"|'([^'\n\r]*)'|`([^`\n\r]*)`)/g;
const GET_TRANSLATIONS_REGEX = /\bget\(\s*translations\s*,\s*(?:"([^"\n\r]*)"|'([^'\n\r]*)'|`([^`\n\r]*)`)\s*\)/g;

function extractKeysFromFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const keys: string[] = [];
  {
    const iter = content.matchAll(T_CALL_REGEX);
    let r = iter.next();
    while (!r.done) {
      const m = r.value as RegExpExecArray;
      const key = (m[1] || m[2] || m[3] || '').trim();
      if (key) keys.push(key);
      r = iter.next();
    }
  }
  {
    const iter = content.matchAll(GET_TRANSLATIONS_REGEX);
    let r = iter.next();
    while (!r.done) {
      const m = r.value as RegExpExecArray;
      const key = (m[1] || m[2] || m[3] || '').trim();
      if (key) keys.push(key);
      r = iter.next();
    }
  }
  return keys;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function main() {
  const localeFiles = fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ lang: path.basename(f, '.json'), path: path.join(localesDir, f) }));

  const locales: Record<string, any> = {};
  for (const lf of localeFiles) {
    locales[lf.lang] = JSON.parse(fs.readFileSync(lf.path, 'utf-8'));
  }

  const backupSuffix = `.bak-${timestamp()}`;
  for (const lf of localeFiles) {
    fs.copyFileSync(lf.path, `${lf.path}${backupSuffix}`);
  }

  const tsFiles: string[] = [];
  for (const dir of srcDirs) tsFiles.push(...walk(path.join(projectRoot, dir), ['.ts', '.tsx']));
  const usedKeys = new Set<string>();
  for (const f of tsFiles) extractKeysFromFile(f).forEach((k) => usedKeys.add(k));

  // 현재 키 맵 산출 함수
  const computeFlatByLang = () => {
    const map: Record<string, Set<string>> = {};
    for (const { lang } of localeFiles) {
      map[lang] = new Set(flattenJson(locales[lang]));
    }
    return map;
  };

  // 1) 미사용 키 제거 (usedKeys에 없는 키 제거)
  let flattenedByLang: Record<string, Set<string>> = computeFlatByLang();
  for (const { lang } of localeFiles) {
    const toDelete = Array.from(flattenedByLang[lang]).filter((k) => !usedKeys.has(k));
    if (toDelete.length === 0) continue;
    const clone = deepClone(locales[lang]);
    toDelete.forEach((k) => deleteByPath(clone, k));
    locales[lang] = clone;
  }

  // 삭제 이후 재계산
  flattenedByLang = computeFlatByLang();
  // 2) 누락 키 채우기 (기준: DEFAULT_LANG)
  let defaultKeys = new Set(flattenJson(locales[DEFAULT_LANG] || {}));
  for (const { lang } of localeFiles) {
    const currentKeys = new Set(flattenJson(locales[lang] || {}));
    const missing = Array.from(usedKeys).filter((k) => !currentKeys.has(k));
    if (missing.length === 0) continue;

    const clone = deepClone(locales[lang] || {});
    for (const key of missing) {
      // 기본 언어에 동일 키가 있으면 그 값을 복사, 없으면 키명 자체로 채움
      let value: any = key;
      if (defaultKeys.has(key)) {
        // 값 추출
        const parts = key.split('.');
        let cur: any = locales[DEFAULT_LANG];
        for (const p of parts) cur = cur?.[p];
        value = typeof cur === 'string' ? cur : key;
      }
      setByPath(clone, key, value);
    }
    locales[lang] = clone;
  }

  // 누락 채움 이후 재계산
  flattenedByLang = computeFlatByLang();
  defaultKeys = new Set(flattenJson(locales[DEFAULT_LANG] || {}));

  // 3) 언어 간 불일치 해소: 모든 언어가 동일 키 집합 갖도록 맞춤
  // 기준: (기본 언어 키 ∪ usedKeys) — 불필요한 키 재도입 방지
  const targetKeySet = new Set<string>([...Array.from(defaultKeys), ...Array.from(usedKeys)]);
  for (const { lang } of localeFiles) {
    const currentKeys = new Set(flattenJson(locales[lang] || {}));
    const missing = Array.from(targetKeySet).filter((k) => !currentKeys.has(k));
    if (missing.length === 0) continue;

    const clone = deepClone(locales[lang] || {});
    for (const key of missing) {
      // 기본 언어 값 우선, 없으면 키명
      let value: any = key;
      if (defaultKeys.has(key)) {
        const parts = key.split('.');
        let cur: any = locales[DEFAULT_LANG];
        for (const p of parts) cur = cur?.[p];
        value = typeof cur === 'string' ? cur : key;
      }
      setByPath(clone, key, value);
    }
    locales[lang] = clone;
  }

  // 저장
  for (const lf of localeFiles) {
    fs.writeFileSync(lf.path, JSON.stringify(locales[lf.lang], null, 2) + '\n', 'utf-8');
  }

  console.log('✅ i18n 자동 수정 완료');
  console.log(`- 백업 확장자: ${backupSuffix}`);
}

main();


