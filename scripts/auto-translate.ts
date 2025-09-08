/*
  Auto translate locale files from en.json to target languages.
  - Preserves placeholders like {name}
  - Preserves simple HTML tags like <a ...>...</a>, <br/>
  - Flattens JSON, translates leaf strings, then rebuilds
*/
import fs from 'fs';
import path from 'path';
// ESM/CJS 호환: default 또는 모듈 자체를 함수로 취득
import translate from '@iamtraction/google-translate';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');

// Source language and targets
const SOURCE_LANG = 'en';
const TARGET_LANGS = ['zh-tw','es','bn','tl','th','vi'] as const;

// Map for API language codes (if different)
const API_LANG_MAP: Record<string, string> = {
  'zh-tw': 'zh-TW',
  'zh-cn': 'zh-CN',
  // others are same as file code
};

// Utility: flatten JSON to dot keys
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
      if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) {
        cur[p] = {};
      }
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

// Tokenization for placeholders and tags
function tokenize(text: string) {
  if (typeof text !== 'string') return { masked: String(text ?? ''), tokens: [] as string[] };
  const tokens: string[] = [];
  // 1) placeholders like {name}
  let masked = text.replace(/\{[^}]+\}/g, (m) => {
    const idx = tokens.push(m) - 1;
    return `__PH_${idx}__`;
  });
  // 2) HTML tags like <a ...>...</a> and self-closing tags
  masked = masked.replace(/<[^>]+>/g, (m) => {
    const idx = tokens.push(m) - 1;
    return `__TAG_${idx}__`;
  });
  return { masked, tokens };
}

function detokenize(text: string, tokens: string[]) {
  let out = text;
  // 일부 번역 엔진이 대소문자를 변경하는 경우가 있어, 대소문자 무시 매칭으로 복원
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
  const srcJson = JSON.parse(fs.readFileSync(srcPath, 'utf-8')) as Json;
  const srcFlat = flatten(srcJson);

  // Build cache for identical strings → translated string per target
  const valueCache: Record<string, Record<string, string>> = {};

  for (const target of TARGET_LANGS) {
    const targetPath = path.join(localesDir, `${target}.json`);
    const apiLang = API_LANG_MAP[target] || target;

    const outFlat: Record<string, string> = {};
    const entries = Object.entries(srcFlat);

    for (const [k, v] of entries) {
      if (typeof v !== 'string') {
        outFlat[k] = v == null ? '' : String(v);
        continue;
      }

      // Skip keys that look like static debug placeholders (value == key)
      if (v === k) {
        outFlat[k] = v;
        continue;
      }

      // Tokenize placeholders/tags
      const { masked, tokens } = tokenize(v);

      // Use cache if available
      valueCache[v] ||= {};
      if (valueCache[v][target]) {
        outFlat[k] = detokenize(valueCache[v][target], tokens);
        continue;
      }

      try {
        const res = await translate(masked, { from: SOURCE_LANG, to: apiLang });
        const translated: string = (res && res.text) || masked;
        valueCache[v][target] = translated;
        outFlat[k] = detokenize(translated, tokens);
      } catch (e) {
        // Fallback to source on failure
        console.warn(`Translate failed [${k}] to ${target}:`, (e as Error).message);
        outFlat[k] = v;
      }
    }

    const outJson = unflatten(outFlat);
    fs.writeFileSync(targetPath, JSON.stringify(outJson, null, 2) + '\n', 'utf-8');
    console.log(`✅ Wrote translations: ${targetPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


