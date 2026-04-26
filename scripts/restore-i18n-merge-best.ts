/*
  Merge-best restore for target locales (quality-first):
  - For each key, scan ALL backups for the locale (and legacy zh.json for zh-cn)
  - Pick the best candidate value with this priority:
    1) Non-placeholder (value !== key)
    2) For non-en locales, avoid exact English copy if possible
    3) Earliest occurrence (to preserve original tone) among candidates
  - Keep any current keys not present in backups
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
    const v = (obj as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v as any;
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
    (cur as any)[parts[parts.length - 1]] = value as any;
  }
  return root;
}

function listBackups(lang: string): string[] {
  if (!fs.existsSync(localesDir)) return [];
  const files = fs.readdirSync(localesDir);
  const own = files.filter((f) => f.startsWith(`${lang}.json.bak-`));
  if (lang === 'zh-cn') own.push(...files.filter((f) => f.startsWith('zh.json.bak-')));
  // ascending by timestamp (earliest first)
  return own.sort((a, b) => (a.split('.bak-')[1] ?? '').localeCompare(b.split('.bak-')[1] ?? ''));
}

function main() {
  if (!fs.existsSync(localesDir)) {
    console.error(`Locales directory not found: ${localesDir}`);
    process.exit(1);
  }

  const en = readJson(path.join(localesDir, 'en.json')) || {};
  const enFlat = flatten(en);

  let totalChanged = 0;
  for (const lang of TARGET_LANGS) {
    const currentPath = path.join(localesDir, `${lang}.json`);
    if (!fs.existsSync(currentPath)) { console.log(`- ${lang}: file not found, skip`); continue; }

    const current = readJson(currentPath) || {};
    const currentFlat = flatten(current);

    const backups = listBackups(lang);
    if (backups.length === 0) { console.log(`- ${lang}: no backups, skip`); continue; }

    // Build candidate list per key preserving earliest order
    const candidatePerKey: Record<string, string[]> = {};
    for (const bak of backups) {
      const json = readJson(path.join(localesDir, bak));
      if (!json) continue;
      const flat = flatten(json);
      for (const [k, v] of Object.entries(flat)) {
        if (typeof v !== 'string') continue;
        if (!candidatePerKey[k]) candidatePerKey[k] = [];
        candidatePerKey[k].push(v);
      }
    }

    let changed = 0;
    const allKeys = new Set<string>([...Object.keys(candidatePerKey), ...Object.keys(currentFlat)]);
    for (const k of Array.from(allKeys)) {
      const candidates = candidatePerKey[k] || [];
      const nonPlaceholder = candidates.filter((v) => v && v !== k);
      let pick: string | undefined;
      if (lang !== 'en') {
        const avoidEn = nonPlaceholder.filter((v) => v !== enFlat[k]);
        pick = (avoidEn.length > 0 ? avoidEn[0] : (nonPlaceholder[0] || undefined));
      } else {
        pick = nonPlaceholder[0] || undefined;
      }
      if (typeof pick === 'string' && pick && currentFlat[k] !== pick) {
        currentFlat[k] = pick;
        changed += 1;
      }
    }

    if (changed > 0) {
      fs.writeFileSync(currentPath, JSON.stringify(unflatten(currentFlat), null, 2) + '\n', 'utf-8');
      console.log(`✅ ${lang}: merge-best restored ${changed} keys`);
      totalChanged += changed;
    } else {
      console.log(`- ${lang}: no changes`);
    }
  }

  console.log(`Done. Merge-best changed ${totalChanged} keys.`);
}

main();


