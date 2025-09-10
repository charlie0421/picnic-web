/*
 Adds missing QnA i18n keys to locale JSON files while preserving formatting:
 - qna_new_label_category
 - qna_new_placeholder_category
*/

const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..', 'public', 'locales');

const translations = {
  'en.json': {
    qna_new_label_category: 'Category',
    qna_new_placeholder_category: 'Select a category',
  },
  'ko.json': {
    qna_new_label_category: '카테고리',
    qna_new_placeholder_category: '카테고리를 선택하세요',
  },
  'ja.json': {
    qna_new_label_category: 'カテゴリ',
    qna_new_placeholder_category: 'カテゴリを選択してください',
  },
  'zh-cn.json': {
    qna_new_label_category: '类别',
    qna_new_placeholder_category: '请选择类别',
  },
  'zh-tw.json': {
    qna_new_label_category: '類別',
    qna_new_placeholder_category: '請選擇類別',
  },
  'th.json': {
    qna_new_label_category: 'หมวดหมู่',
    qna_new_placeholder_category: 'เลือกหมวดหมู่',
  },
  'tl.json': {
    qna_new_label_category: 'Kategorya',
    qna_new_placeholder_category: 'Pumili ng kategorya',
  },
  'vi.json': {
    qna_new_label_category: 'Danh mục',
    qna_new_placeholder_category: 'Chọn danh mục',
  },
  'id.json': {
    qna_new_label_category: 'Kategori',
    qna_new_placeholder_category: 'Pilih kategori',
  },
  'es.json': {
    qna_new_label_category: 'Categoría',
    qna_new_placeholder_category: 'Selecciona una categoría',
  },
  'bn.json': {
    qna_new_label_category: 'বিভাগ',
    qna_new_placeholder_category: 'একটি বিভাগ নির্বাচন করুন',
  },
};

function detectIndent(jsonText) {
  const m = jsonText.match(/\n([ \t]+)\"/);
  return m ? m[1] : '  ';
}

function hasKey(jsonText, key) {
  const re = new RegExp('\\"' + key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\"\\s*:');
  return re.test(jsonText);
}

function insertKeysKeepFormat(filePath, kvs) {
  if (!fs.existsSync(filePath)) return false;
  let s = fs.readFileSync(filePath, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const indent = detectIndent(s);

  const need = Object.entries(kvs).filter(([k]) => !hasKey(s, k));
  if (need.length === 0) return false; // nothing to do

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return false;

  const inner = s.slice(start + 1, end);
  const hasAnyProps = /\"[^\"]+\"\s*:/.test(inner);

  const before = s.slice(0, end).replace(/[ \t]*$/, '');
  const after = s.slice(end);

  let ins = '';
  ins += (hasAnyProps ? ',' : '') + eol;
  ins += need
    .map(([k, v], idx) => {
      const line = `${indent}\"${k}\": \"${String(v)
        .replace(/\\/g, '\\\\')
        .replace(/\"/g, '\\\"')}\"`;
      return line + (idx < need.length - 1 ? ',' : '');
    })
    .join(eol);
  ins += eol;

  const out = before + ins + after;
  fs.writeFileSync(filePath, out, 'utf8');
  return true;
}

let changed = 0;
for (const [fileName, kvs] of Object.entries(translations)) {
  const filePath = path.join(baseDir, fileName);
  try {
    if (insertKeysKeepFormat(filePath, kvs)) changed += 1;
  } catch (e) {
    console.error('Failed for', filePath, e.message);
  }
}

console.log(`i18n keys update complete. Files changed: ${changed}`);


