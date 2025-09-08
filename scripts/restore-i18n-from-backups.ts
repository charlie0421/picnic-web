/*
  Restore i18n translation values from .bak snapshots.
  - For each locale file, if a key's current value looks like a placeholder (equals key string)
    or equals the English value (for non-en locales), try to restore from the earliest backup.
  - For zh-cn, also look into zh.json.bak-* snapshots for legacy values.
*/
import fs from 'fs';
import path from 'path';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(obj || {}).forEach((k) => {
    const key = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  });
  return out;
}

function unflatten(map: Record<string, string>): Json {
  const root: Json = {};
  for (const [key, value] of Object.entries(map)) {
    const parts = key.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

function readJson(p: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function listBackups(lang: string): string[] {
  if (!fs.existsSync(localesDir)) return [];
  const files = fs.readdirSync(localesDir);
  const own = files.filter((f) => f.startsWith(`${lang}.json.bak-`));
  if (lang === 'zh-cn') {
    // also include legacy zh.json backups
    own.push(...files.filter((f) => f.startsWith(`zh.json.bak-`)));
  }
  // sort ascending by timestamp
  return own.sort((a, b) => {
    const ta = a.split('.bak-')[1] ?? '';
    const tb = b.split('.bak-')[1] ?? '';
    return ta.localeCompare(tb);
  });
}

function getBackupValue(lang: string, key: string): string | undefined {
  const backups = listBackups(lang);
  for (const bak of backups) {
    const p = path.join(localesDir, bak);
    const json = readJson(p);
    if (!json) continue;
    const parts = key.split('.');
    let cur: any = json;
    for (const part of parts) {
      cur = cur?.[part];
      if (cur == null) break;
    }
    if (typeof cur === 'string') return cur;
  }
  return undefined;
}

function main() {
  if (!fs.existsSync(localesDir)) {
    console.error(`Locales directory not found: ${localesDir}`);
    process.exit(1);
  }

  const localeFiles = fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ lang: path.basename(f, '.json'), path: path.join(localesDir, f) }));

  const en = readJson(path.join(localesDir, 'en.json')) || {};
  const enFlat = flatten(en);

  let totalRestored = 0;
  for (const { lang, path: filePath } of localeFiles) {
    const current = readJson(filePath) || {};
    const currentFlat = flatten(current);
    let changed = 0;

    for (const [k, v] of Object.entries(currentFlat)) {
      if (typeof v !== 'string') continue;
      const isPlaceholder = v === k;
      const equalsEn = lang !== 'en' && v === enFlat[k];
      if (!isPlaceholder && !equalsEn) continue;

      const bakVal = getBackupValue(lang, k);
      if (typeof bakVal === 'string' && bakVal && bakVal !== v) {
        currentFlat[k] = bakVal;
        changed += 1;
      }
    }

    if (changed > 0) {
      const outJson = unflatten(currentFlat);
      fs.writeFileSync(filePath, JSON.stringify(outJson, null, 2) + '\n', 'utf-8');
      console.log(`✅ Restored ${changed} keys for ${lang}`);
      totalRestored += changed;
    }
  }

  console.log(`Done. Restored total ${totalRestored} keys.`);
}

main();


