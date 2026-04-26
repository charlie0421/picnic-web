/*
  Aggressive restore for specific locales:
  - For target languages, take the earliest backup snapshot and overlay ALL keys' values onto current files.
  - Keeps any new keys that didn't exist in the backup.
  - zh-cn also considers legacy zh.json backups.
*/
import fs from 'fs';
import path from 'path';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');
const TARGET_LANGS = ['ko', 'en', 'id', 'ja', 'zh-cn', 'es'];

function readJson(p: string): Json | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function flatten(obj: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(obj || {}).forEach((k) => {
    const key = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
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
    cur[parts[parts.length - 1]] = value as any;
  }
  return root;
}

function listBackups(lang: string): string[] {
  if (!fs.existsSync(localesDir)) return [];
  const files = fs.readdirSync(localesDir);
  const own = files.filter((f) => f.startsWith(`${lang}.json.bak-`));
  if (lang === 'zh-cn') own.push(...files.filter((f) => f.startsWith('zh.json.bak-')));
  // ascending by timestamp
  return own.sort((a, b) => (a.split('.bak-')[1] ?? '').localeCompare(b.split('.bak-')[1] ?? ''));
}

function main() {
  if (!fs.existsSync(localesDir)) {
    console.error(`Locales directory not found: ${localesDir}`);
    process.exit(1);
  }

  let total = 0;
  for (const lang of TARGET_LANGS) {
    const currentPath = path.join(localesDir, `${lang}.json`);
    if (!fs.existsSync(currentPath)) { console.log(`- ${lang}: file not found, skip`); continue; }

    const backups = listBackups(lang);
    if (backups.length === 0) { console.log(`- ${lang}: no backups, skip`); continue; }
    const earliest = backups[0];
    const earliestJson = readJson(path.join(localesDir, earliest)) || {};
    const earliestFlat = flatten(earliestJson);

    const current = readJson(currentPath) || {};
    const currentFlat = flatten(current);

    let changed = 0;
    for (const [k, v] of Object.entries(earliestFlat)) {
      if (typeof v !== 'string' || !v) continue;
      if (currentFlat[k] !== v) {
        currentFlat[k] = v;
        changed += 1;
      }
    }

    if (changed > 0) {
      fs.writeFileSync(currentPath, JSON.stringify(unflatten(currentFlat), null, 2) + '\n', 'utf-8');
      console.log(`✅ ${lang}: restored ${changed} keys from ${earliest}`);
      total += changed;
    } else {
      console.log(`- ${lang}: no changes`);
    }
  }

  console.log(`Done. Aggressively restored ${total} keys across targets.`);
}

main();


