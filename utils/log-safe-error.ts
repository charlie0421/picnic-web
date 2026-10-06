/**
 * 결제·인증 경로의 오류 로그 (설계 §4.2).
 *
 * logError 와 달리 넘겨받은 값을 그대로 쓰지 않는다. 계약을 통과한 값으로 **가린 기록을 새로 만들어**
 * Console 과 Sentry 두 target 에 같은 기록을 넘긴다.
 *
 *   - 사건 코드: 닫힌 목록(log-event-codes.ts)에서만 고른다.
 *   - 오류: 이름 하나만 쓴다. 알려진 이름 표에 없으면 'Error' 다. 원본의 message·stack·cause 는 쓰지 않는다.
 *   - stack: 이 함수를 부른 자리에서 새로 만든다. 위치(스크립트 이름·줄·칸)만 싣고 함수 이름은 싣지 않는다 —
 *     함수 이름은 값에서 올 수 있다.
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

  try {
    // 여기부터는 무엇이든 던질 수 있다. 취소된 Proxy 는 Array.isArray 에서도 던진다.
    if (typeof fields !== 'object' || Array.isArray(fields)) return { fields: {}, dropped: ['fields'] };
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
    // 정해지지 않은 키는 값도 이름도 싣지 않는다. 있었다는 사실만 남긴다. Symbol 키와 열거되지 않는 키도 센다.
    if (Reflect.ownKeys(source).some((key) => typeof key !== 'string' || !FIELD_NAME_SET.has(key))) dropped.push('other');
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

/**
 * 호출 지점의 위치만으로 stack 의 프레임을 만든다.
 *
 * 엔진이 만들어 주는 stack 문자열은 쓰지 않는다. 그 문자열에는 함수 이름이 들어가는데, 함수 이름은 코드가 아니라
 * 값에서 올 수 있다: `{ [action]() { … } }` 의 action 이 요청 값이면 V8 은 그것을 프레임에 적는다. 이름에 줄바꿈을
 * 넣으면 위치처럼 생긴 줄도 만들 수 있어, 문자열을 걸러서는 막지 못한다. 그래서 구조화된 호출 지점(CallSite)에서
 * 스크립트 이름·줄·칸만 꺼낸다. 스크립트 이름은 번들의 것이다.
 *
 * 이 API(V8)가 없는 엔진에서는 프레임을 싣지 않는다. Error.prepareStackTrace 는 잠깐 바꿨다가 되돌린다 —
 * 그 사이에 다른 코드가 끼어들 틈이 없다(동기 구간이다).
 */
function locationFrames(below: (...args: never[]) => unknown): string[] {
  if (typeof Error.captureStackTrace !== 'function') return [];

  const previous = Error.prepareStackTrace;
  try {
    Error.prepareStackTrace = (_error, sites) => sites;
    const holder: { stack?: unknown } = {};
    Error.captureStackTrace(holder, below);
    const sites = holder.stack;
    if (!Array.isArray(sites)) return [];

    const frames: string[] = [];
    for (const site of sites as NodeJS.CallSite[]) {
      const file = site.getScriptNameOrSourceURL() ?? site.getFileName();
      const line = site.getLineNumber();
      if (typeof file !== 'string' || file === '' || /[\r\n]/.test(file) || typeof line !== 'number') continue;
      const column = site.getColumnNumber();
      // 브라우저의 스크립트 주소에는 쿼리가 붙을 수 있다.
      frames.push(`    at ${file.replace(/[?#].*$/, '')}:${line}:${typeof column === 'number' ? column : 0}`);
    }
    return frames;
  } catch {
    return [];
  } finally {
    Error.prepareStackTrace = previous;
  }
}

/** 기록을 만들다가 던져도 가린 로그 한 줄은 남긴다(설계 §4.3 의 1). 여기의 대체 기록은 상수뿐이다. */
function recordFor(code: unknown, error: unknown, fields: unknown): SafeLogRecord {
  try {
    return buildSafeRecord(code, error, fields);
  } catch {
    return {
      code: isLogEventCode(code) ? code : FALLBACK_EVENT_CODE,
      errorName: 'Error',
      fields: {},
      droppedFields: ['fields'],
    };
  }
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
    const record = recordFor(code, error, fields);

    // stack 은 우리가 만든다: 첫 줄은 표에서 고른 이름과 사건 코드, 나머지는 호출 지점의 위치뿐이다.
    const callSite = new Error(record.code);
    callSite.name = record.errorName;
    callSite.stack = [`${record.errorName}: ${record.code}`, ...locationFrames(logSafeError)].join('\n');

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
