/*
  Restore locale files to the most complete backup snapshot.
  - For each lang json in public/locales, find all backups: <lang>.json.bak-*
    (and legacy zh.json.bak-* for zh-cn), choose the one with the largest
    number of flattened keys, and restore the current file to that snapshot.
  - Creates a safety backup of current files before overwriting.
*/
import fs from 'fs';
import path from 'path';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');

function timestamp() {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readJson(p: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function flatten(obj: Json, prefix = ''): string[] {
  const out: string[] = [];
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out.push(...flatten(v, key));
      } else {
        out.push(key);
      }
    }
  }
  return out;
}

function listBackupsForLang(lang: string): string[] {
  if (!fs.existsSync(localesDir)) return [];
  const files = fs.readdirSync(localesDir);
  const own = files.filter((f) => f.startsWith(`${lang}.json.bak-`));
  if (lang === 'zh-cn') {
    own.push(...files.filter((f) => f.startsWith('zh.json.bak-')));
  }
  return own;
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

  const safetySuffix = `.pre-restore-${timestamp()}`;
  let restoredCount = 0;

  for (const { lang, path: filePath } of localeFiles) {
    const candidates = listBackupsForLang(lang);
    if (candidates.length === 0) {
      console.log(`- ${lang}: no backups found, skip`);
      continue;
    }

    let bestFile: string | null = null;
    let bestCount = -1;
    for (const bak of candidates) {
      const p = path.join(localesDir, bak);
      const json = readJson(p);
      if (!json) continue;
      const count = flatten(json).length;
      if (count > bestCount) {
        bestCount = count;
        bestFile = p;
      }
    }
    if (!bestFile) {
      console.log(`- ${lang}: backups unreadable, skip`);
      continue;
    }

    // safety backup current file
    fs.copyFileSync(filePath, `${filePath}${safetySuffix}`);
    // restore
    const bestJson = readJson(bestFile) ?? {};
    fs.writeFileSync(filePath, JSON.stringify(bestJson, null, 2) + '\n', 'utf-8');
    restoredCount += 1;
    console.log(`✅ ${lang}: restored from '${path.basename(bestFile)}' (keys=${bestCount})`);
  }

  console.log(`Done. Restored ${restoredCount}/${localeFiles.length} locale files to most complete backups.`);
}

main();


