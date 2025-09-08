/*
  Fill placeholders in target locales using EN as source, without overwriting existing translations.
  - Only updates keys where target value equals the key itself or equals the EN value
  - Preserves tokens like {name} and HTML tags
  - Default targets: ['id','ja','zh-cn'] (can be extended if needed)
*/
import fs from 'fs';
import path from 'path';
import translate from '@iamtraction/google-translate';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');
const SOURCE_LANG = 'en';
const TARGETS = ['id', 'ja', 'zh-cn'] as const;

const API_LANG_MAP: Record<string, string> = {
  'zh-cn': 'zh-CN',
};

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

function tokenize(text: string) {
  if (typeof text !== 'string') return { masked: String(text ?? ''), tokens: [] as string[] };
  const tokens: string[] = [];
  let masked = text.replace(/\{[^}]+\}/g, (m) => {
    const idx = tokens.push(m) - 1;
    return `__PH_${idx}__`;
  });
  masked = masked.replace(/<[^>]+>/g, (m) => {
    const idx = tokens.push(m) - 1;
    return `__TAG_${idx}__`;
  });
  return { masked, tokens };
}

function detokenize(text: string, tokens: string[]) {
  let out = text;
  out = out.replace(/__PH_(\d+)__/gi, (_, i) => tokens[Number(i)] ?? '');
  out = out.replace(/__TAG_(\d+)__/gi, (_, i) => tokens[Number(i)] ?? '');
  return out;
}

async function main() {
  const srcPath = path.join(localesDir, `${SOURCE_LANG}.json`);
  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    process.exit(1);
  }
  const enJson = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Json;
  const enFlat = flatten(enJson);

  for (const target of TARGETS) {
    const targetPath = path.join(localesDir, `${target}.json`);
    if (!fs.existsSync(targetPath)) continue;
    const targetJson = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as Json;
    const targetFlat = flatten(targetJson);

    let changed = 0;
    const apiLang = API_LANG_MAP[target] || target;

    for (const [k, v] of Object.entries(targetFlat)) {
      const enVal = enFlat[k];
      if (typeof v !== 'string' || typeof enVal !== 'string') continue;
      const isPlaceholder = v === k;
      const equalsEn = v === enVal;
      if (!isPlaceholder && !equalsEn) continue;

      const { masked, tokens } = tokenize(enVal);
      try {
        const res = await translate(masked, { from: SOURCE_LANG, to: apiLang });
        const translated: string = (res && res.text) || masked;
        const restored = detokenize(translated, tokens);
        if (restored && restored !== v) {
          targetFlat[k] = restored;
          changed += 1;
        }
      } catch (e) {
        // ignore translation error, leave as is
      }
    }

    if (changed > 0) {
      const outJson = unflatten(targetFlat);
      fs.writeFileSync(targetPath, JSON.stringify(outJson, null, 2) + '\n', 'utf-8');
      console.log(`✅ Filled ${changed} placeholders for ${target}`);
    } else {
      console.log(`No placeholders filled for ${target}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


