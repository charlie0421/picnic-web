import fs from 'fs';
import path from 'path';
import {
  AuthApiError,
  AuthError,
  AuthImplicitGrantRedirectError,
  AuthInvalidCredentialsError,
  AuthInvalidJwtError,
  AuthInvalidTokenResponseError,
  AuthPKCECodeVerifierMissingError,
  AuthPKCEGrantCodeExchangeError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  AuthWeakPasswordError,
  PostgrestError,
} from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  KNOWN_ERROR_CODES,
  KNOWN_ERROR_NAMES,
  UNKNOWN_ERROR_CODE,
  knownErrorCode,
  knownErrorName,
} from '@/utils/log-known-errors';

const root = process.cwd();

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

describe('알려진 오류 이름 표', () => {
  it('중복이 없고 첫 값이 Error 다', () => {
    expect(new Set(KNOWN_ERROR_NAMES).size).toBe(KNOWN_ERROR_NAMES.length);
    expect(KNOWN_ERROR_NAMES[0]).toBe('Error');
  });

  // 표의 이름이 설치된 라이브러리가 실제로 쓰는 이름인지 본다. 라이브러리가 이름을 바꾸면 여기서 드러난다.
  it.each([
    new AuthError('m'),
    new AuthApiError('m', 400, 'c'),
    new AuthUnknownError('m', null),
    new AuthSessionMissingError(),
    new AuthInvalidTokenResponseError(),
    new AuthInvalidCredentialsError('m'),
    new AuthImplicitGrantRedirectError('m'),
    new AuthPKCEGrantCodeExchangeError('m'),
    new AuthPKCECodeVerifierMissingError(),
    new AuthRetryableFetchError('m', 0),
    new AuthWeakPasswordError('m', 422, []),
    new AuthInvalidJwtError('m'),
    new PostgrestError({ message: 'm', details: 'd', hint: 'h', code: 'c' }),
    new TypeError('m'),
    new RangeError('m'),
    new SyntaxError('m'),
    new ReferenceError('m'),
    new URIError('m'),
    new EvalError('m'),
    new AggregateError([], 'm'),
    new DOMException('m', 'AbortError'),
    new DOMException('m', 'TimeoutError'),
  ])('$name 을 그대로 남긴다', (error) => {
    expect(KNOWN_ERROR_NAMES).toContain(error.name);
    expect(knownErrorName(error)).toBe(error.name);
  });

  it('이 저장소가 정의한 오류 이름이 모두 표에 있다', () => {
    const files = [...walk(path.join(root, 'utils/error')), ...walk(path.join(root, 'lib'))];
    const names = files.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/this\.name\s*=\s*['"]([A-Za-z]+)['"]/g)].map((match) => match[1]),
    );
    expect(names.length).toBeGreaterThan(5);
    for (const name of new Set(names)) {
      expect(KNOWN_ERROR_NAMES, `${name} 이 utils/log-known-errors.ts 의 표에 없다`).toContain(name);
    }
  });

  it('Error 가 아닌 객체의 name 도 표에서 고른다', () => {
    expect(knownErrorName({ name: 'AuthApiError', message: 'plain object' })).toBe('AuthApiError');
  });

  it.each([
    ['표에 없는 이름', Object.assign(new Error('x'), { name: 'CnryNameError' })],
    ['비밀이 든 이름', Object.assign(new Error('x'), { name: 'Bearer cnry-secret-token-1234567890' })],
    ['Object.prototype 의 키', { name: 'constructor' }],
    ['문자열로 바뀌는 객체', { name: { toString: () => 'TypeError' } }],
    ['이름이 없는 객체', { message: 'x' }],
    ['문자열', 'TypeError'],
    ['숫자', 500],
    ['null', null],
    ['undefined', undefined],
    ['함수', TypeError],
  ])('%s 은(는) Error 로 남긴다', (_label, value) => {
    expect(knownErrorName(value)).toBe('Error');
  });

  it('name 을 읽다가 던져도 Error 로 남긴다', () => {
    const throwing = Object.defineProperty({}, 'name', {
      get() {
        throw new Error('cnry getter');
      },
    });
    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error('cnry proxy');
        },
      },
    );
    expect(knownErrorName(throwing)).toBe('Error');
    expect(knownErrorName(proxy)).toBe('Error');
  });
});

describe('알려진 오류 코드 표', () => {
  it('중복이 없고 unknown 은 표에 없다', () => {
    expect(new Set(KNOWN_ERROR_CODES).size).toBe(KNOWN_ERROR_CODES.length);
    expect(KNOWN_ERROR_CODES).not.toContain(UNKNOWN_ERROR_CODE);
  });

  it.each([...KNOWN_ERROR_CODES])('%s 를 그대로 남긴다', (code) => {
    expect(knownErrorCode(code)).toBe(code);
  });

  it.each([
    ['표에 없는 코드', 'made_up_code'],
    // 코드처럼 생긴 비밀. 형식 검사로는 가릴 수 없어 표로 고른다(설계 §4.2).
    ['코드 모양의 비밀', 'CNRY_BEARER_91c2'],
    ['SQLSTATE 모양이지만 표에 없는 값', '99999'],
    ['대소문자가 다른 값', 'INVALID_GRANT'],
    ['앞뒤 공백', ' invalid_grant'],
    ['Object.prototype 의 키', 'constructor'],
    ['숫자', 23505],
    ['null', null],
    ['undefined', undefined],
    ['문자열로 바뀌는 객체', { toString: () => 'invalid_grant' }],
  ])('%s 은(는) unknown 으로 남긴다', (_label, value) => {
    expect(knownErrorCode(value)).toBe('unknown');
  });
});
