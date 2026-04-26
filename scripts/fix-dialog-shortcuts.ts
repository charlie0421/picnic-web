/*
  Ensure the following flat keys are properly localized across all locales:
    - dialog_login_required_login_button
    - dialog_login_required_cancel_button

  Strategy per locale file:
    1) If nested values exist (dialog.login_required.login_button / cancel_button), copy them.
    2) Else, fill from language-specific fallback map.
    3) Do NOT overwrite if already properly localized (i.e., not equal to the key string itself).
*/
import fs from 'fs';
import path from 'path';

type Json = any;

const projectRoot = process.cwd();
const localesDir = path.join(projectRoot, 'public', 'locales');

const FALLBACK: Record<string, { login: string; cancel: string }> = {
  en: { login: 'Login', cancel: 'Cancel' },
  ko: { login: '로그인', cancel: '취소' },
  ja: { login: 'ログイン', cancel: 'キャンセル' },
  id: { login: 'Masuk', cancel: 'Batal' },
  'zh-cn': { login: '登录', cancel: '取消' },
  'zh-tw': { login: '登入', cancel: '取消' },
  es: { login: 'Iniciar sesión', cancel: 'Cancelar' },
  bn: { login: 'লগইন', cancel: 'বাতিল' },
  tl: { login: 'Mag-login', cancel: 'Kanselahin' },
  th: { login: 'เข้าสู่ระบบ', cancel: 'ยกเลิก' },
  vi: { login: 'Đăng nhập', cancel: 'Hủy' },
};

function getByPath(obj: any, pathStr: string): any {
  const parts = pathStr.split('.');
  let cur = obj;
  for (const p of parts) {
    cur = cur?.[p];
    if (cur == null) return cur;
  }
  return cur;
}

function setByPath(obj: any, pathStr: string, value: string) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function main() {
  if (!fs.existsSync(localesDir)) {
    console.error(`Locales directory not found: ${localesDir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));
  let totalChanged = 0;
  for (const file of files) {
    const lang = path.basename(file, '.json');
    const filePath = path.join(localesDir, file);
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Json;

    const nestedLogin = getByPath(json, 'dialog.login_required.login_button');
    const nestedCancel = getByPath(json, 'dialog.login_required.cancel_button');
    const flatLogin = json['dialog_login_required_login_button'];
    const flatCancel = json['dialog_login_required_cancel_button'];

    let changed = 0;

    // login_button
    if (typeof flatLogin !== 'string' || flatLogin === 'dialog_login_required_login_button') {
      let value: string | undefined = typeof nestedLogin === 'string' ? nestedLogin : undefined;
      if (!value) value = FALLBACK[lang]?.login ?? FALLBACK['en'].login;
      if (value) {
        json['dialog_login_required_login_button'] = value;
        changed += 1;
      }
    }

    // cancel_button
    if (typeof flatCancel !== 'string' || flatCancel === 'dialog_login_required_cancel_button') {
      let value: string | undefined = typeof nestedCancel === 'string' ? nestedCancel : undefined;
      if (!value) value = FALLBACK[lang]?.cancel ?? FALLBACK['en'].cancel;
      if (value) {
        json['dialog_login_required_cancel_button'] = value;
        changed += 1;
      }
    }

    if (changed > 0) {
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
      console.log(`✅ Fixed ${changed} keys for ${lang}`);
      totalChanged += changed;
    }
  }

  console.log(`Done. Changed total ${totalChanged} keys.`);
}

main();


