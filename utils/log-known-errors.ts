/**
 * logSafeError 가 남기는 오류 이름과 오류 코드의 닫힌 목록 (설계 §4.2).
 *
 * 오류의 name 과 공급자가 돌려준 code 는 밖에서 정한 문자열이다. 형식 검사로는 그 값이 비밀인지
 * 가릴 수 없으므로 표에 있는 값만 남긴다. 표에 없으면 이름은 'Error', 코드는 'unknown' 이 된다.
 * 표를 넓히는 일은 이 파일을 고치는 PR 로만 한다.
 */

export const KNOWN_ERROR_NAMES = [
  // ECMAScript
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'URIError',
  'EvalError',
  'AggregateError',
  // fetch · AbortController · AbortSignal.timeout 의 DOMException
  'AbortError',
  'TimeoutError',
  // @supabase/auth-js
  'AuthError',
  'AuthApiError',
  'AuthUnknownError',
  'AuthSessionMissingError',
  'AuthInvalidTokenResponseError',
  'AuthInvalidCredentialsError',
  'AuthImplicitGrantRedirectError',
  'AuthPKCEGrantCodeExchangeError',
  'AuthPKCECodeVerifierMissingError',
  'AuthRetryableFetchError',
  'AuthWeakPasswordError',
  'AuthInvalidJwtError',
  // @supabase/postgrest-js
  'PostgrestError',
  // 이 저장소가 정의한 오류
  'AppError',
  'DataFetchingError',
  'SocialAuthError',
  'AntiAbuseError',
  'AntiAbusePermissionError',
  'WithdrawnUserError',
  'SupabaseError',
  'SupabaseAuthError',
  'SupabaseStorageError',
  'SupabasePostgrestError',
] as const;

export type KnownErrorName = (typeof KNOWN_ERROR_NAMES)[number];

const NAMES: ReadonlySet<unknown> = new Set(KNOWN_ERROR_NAMES);

/** 오류의 이름을 표에서 고른다. 표에 없거나 읽을 수 없으면 'Error' 다. 던지지 않는다. */
export function knownErrorName(error: unknown): KnownErrorName {
  try {
    if (typeof error !== 'object' || error === null) return 'Error';
    const name = (error as { name?: unknown }).name;
    return NAMES.has(name) ? (name as KnownErrorName) : 'Error';
  } catch {
    // name 이 던지는 getter 였다.
    return 'Error';
  }
}

export const KNOWN_ERROR_CODES = [
  // OAuth 2.0 (RFC 6749 §4.1.2.1, §5.2)
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'unsupported_response_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
  // PostgreSQL SQLSTATE — 이 저장소의 코드가 이미 비교하는 값
  '22001',
  '22003',
  '22P02',
  '23502',
  '23503',
  '23505',
  '23514',
  '28P01',
  '42501',
  '42703',
  '42P01',
  // PostgREST — 같은 기준
  'PGRST116',
  'PGRST204',
  'PGRST301',
  'PGRST403',
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export const UNKNOWN_ERROR_CODE = 'unknown';

const ERROR_CODES: ReadonlySet<unknown> = new Set(KNOWN_ERROR_CODES);

/** 공급자가 돌려준 오류 코드를 표에서 고른다. 표에 없으면 'unknown' 이다. */
export function knownErrorCode(value: unknown): KnownErrorCode | typeof UNKNOWN_ERROR_CODE {
  return ERROR_CODES.has(value) ? (value as KnownErrorCode) : UNKNOWN_ERROR_CODE;
}
