/**
 * 결제·인증 경로의 오류 로그 (설계 §4.2).
 *
 * logError 와 달리 넘겨받은 값을 그대로 쓰지 않는다. 계약을 통과한 값으로 **가린 기록을 새로 만들어**
 * Console 과 Sentry 두 target 에 같은 기록을 넘긴다.
 *
 *   - 사건 코드: 닫힌 목록(log-event-codes.ts)에서만 고른다.
 *   - 오류: 이름 하나만 쓴다. 알려진 이름 표에 없으면 'Error' 다. 원본의 message·stack·cause 는 쓰지 않는다.
 *   - stack: 이 함수를 부른 자리에서 새로 만든다. 요청이나 외부 응답의 값이 들어갈 길이 없다.
 *   - 필드: 이름이 정해진 여덟 개뿐이다. 형식에 맞지 않으면 버리고 그 이름만 droppedFields 에 남긴다.
 *
 * 형식 검사는 값이 비밀인지 가리지 못한다. 형식이 맞는 토큰을 ID 자리에 넘기면 그대로 남는다(설계 §6.4).
 *
 * 이 파일은 브라우저 번들에도 들어간다(lib/supabase/social/**). 서버 전용 코드(next/server, node:*)를
 * import 하지 않는다. 요청당 한 번의 flush 는 서버 전용 파일 with-safe-errors.ts 가 맡는다.
 */
import { FALLBACK_EVENT_CODE, isLogEventCode, type LogEventCode } from './log-event-codes';
import { knownErrorCode, knownErrorName, type KnownErrorName } from './log-known-errors';
import { logger } from './logger';

export type SafeLogFields = {
  /** 사용자 UUID */
  userId?: string;
  /** [A-Za-z0-9_-]{1,64} */
  paymentId?: string;
  /** [A-Za-z0-9_-]{1,64} */
  orderId?: string;
  /** [A-Za-z0-9_-]{1,64} */
  productId?: string;
  /** 100~599 의 정수 */
  httpStatus?: number;
  /** 알려진 코드 표(log-known-errors.ts)에 있는 값. 표에 없으면 'unknown' 으로 남는다 */
  errorCode?: string;
  /** 유한한 수 */
  amount?: number;
  /** [A-Z]{3} */
  currency?: string;
};

type FieldName = keyof SafeLogFields;

/** droppedFields 에 들어갈 수 있는 이름. 호출부가 넘긴 키 이름을 그대로 싣지 않는다. */
export type DroppedField = FieldName | 'code' | 'fields' | 'other';

export type SafeLogRecord = {
  code: LogEventCode;
  errorName: KnownErrorName;
  fields: SafeLogFields;
  droppedFields: DroppedField[];
};

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY = /^[A-Z]{3}$/;

const matching = (pattern: RegExp) => (value: unknown) =>
  typeof value === 'string' && pattern.test(value) ? value : undefined;

/** 필드마다 값을 검증해 남길 값을 돌려준다. undefined 는 "버린다"는 뜻이다. */
const FIELD_RULES: { [Name in FieldName]: (value: unknown) => SafeLogFields[Name] | undefined } = {
  userId: matching(UUID),
  paymentId: matching(ID),
  orderId: matching(ID),
  productId: matching(ID),
  httpStatus: (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined,
  errorCode: knownErrorCode,
  amount: (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined),
  currency: matching(CURRENCY),
};

const FIELD_NAMES = Object.keys(FIELD_RULES) as FieldName[];
const FIELD_NAME_SET: ReadonlySet<string> = new Set(FIELD_NAMES);

function readFields(fields: unknown): { fields: SafeLogFields; dropped: DroppedField[] } {
  if (fields === undefined || fields === null) return { fields: {}, dropped: [] };
  if (typeof fields !== 'object' || Array.isArray(fields)) return { fields: {}, dropped: ['fields'] };

  try {
    const source = fields as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    const dropped: DroppedField[] = [];
    for (const name of FIELD_NAMES) {
      const value = source[name];
      // 값이 없는 것은 버린 것이 아니다.
      if (value === undefined || value === null) continue;
      const checked = FIELD_RULES[name](value);
      if (checked === undefined) dropped.push(name);
      else safe[name] = checked;
    }
    // 정해지지 않은 키는 값도 이름도 싣지 않는다. 있었다는 사실만 남긴다.
    if (Object.keys(source).some((key) => !FIELD_NAME_SET.has(key))) dropped.push('other');
    return { fields: safe as SafeLogFields, dropped };
  } catch {
    // getter 나 Proxy 가 던졌다. 읽다 만 값은 버린다.
    return { fields: {}, dropped: ['fields'] };
  }
}

/**
 * 넘겨받은 값으로 가린 기록을 새로 만든다. 던지지 않는다.
 * 인자의 타입이 unknown 인 것은 런타임에 무엇이 들어와도 같은 계약을 적용하기 위해서다.
 */
export function buildSafeRecord(code: unknown, error: unknown, fields?: unknown): SafeLogRecord {
  const safeCode = isLogEventCode(code) ? code : FALLBACK_EVENT_CODE;
  const read = readFields(fields);
  return {
    code: safeCode,
    errorName: knownErrorName(error),
    fields: read.fields,
    droppedFields: safeCode === code ? read.dropped : ['code', ...read.dropped],
  };
}

type Listener = () => void;
let onRecorded: Listener | undefined;

/**
 * 가린 기록이 남을 때마다 부를 함수를 등록한다. 서버 전용 경계(with-safe-errors.ts)만 쓴다 —
 * "이 요청에서 오류를 기록했는가"를 알아야 요청당 한 번만 flush 를 걸 수 있다(설계 §4.3).
 */
export function setSafeErrorListener(listener: Listener | undefined): void {
  onRecorded = listener;
}

/**
 * 계약을 통과한 값만 콘솔과 Sentry 로 남긴다. 반환값이 없는 동기 함수이고 던지지 않는다.
 *
 * Console target 은 이 호출이 돌아오기 전에 찍는다(Logger.writeLog 의 첫 await 앞에서 target.write 가 불린다).
 * Sentry 전송은 기다리지 않는다. 핸들러가 끝나기 전에 부르면 SDK 의 route handler 래퍼가 건 flush 가 기다린다.
 */
export function logSafeError(code: LogEventCode, error: unknown, fields?: SafeLogFields): void {
  try {
    const record = buildSafeRecord(code, error, fields);

    // 이름을 먼저 정하고 stack 을 잡는다. V8 은 stack 의 첫 줄을 잡는 시점의 name·message 로 만든다.
    const callSite = new Error(record.code);
    callSite.name = record.errorName;
    if (typeof Error.captureStackTrace === 'function') Error.captureStackTrace(callSite, logSafeError);

    const context: Record<string, unknown> = { ...record.fields };
    if (record.droppedFields.length > 0) context.droppedFields = record.droppedFields;

    void logger.safeError(record.code, callSite, context)?.catch?.(() => undefined);
  } catch {
    // 로깅 실패가 요청을 깨뜨리면 안 된다.
  }

  try {
    onRecorded?.();
  } catch {
    // 위와 같다.
  }
}
