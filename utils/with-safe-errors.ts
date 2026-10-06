/**
 * 결제·인증 route handler 의 경계 (설계 §4.7, §4.3).
 *
 *   export const POST = withSafeErrors('payment.portone.webhook.unhandled', async (request) => { … });
 *
 * 핸들러가 던진 오류를 여기서 잡아 logSafeError 로 남기고 고정된 500 을 돌려준다. 원본 오류는 Next 로
 * 전파되지 않으므로 Next 의 미처리 오류 로그(원본 메시지를 서버 출력에 찍는다)와 onRequestError 에 닿지 않는다.
 *
 * redirect()·notFound() 같은 Next 의 제어 흐름 신호는 오류가 아니므로 올려보낸다. 다만 던진 값을 그대로 올려보내지 않고,
 * 판정에 쓴 값으로 같은 뜻의 신호를 새로 만들어 올려보낸다. 던진 값과 같은 객체가 아니다 — 그 값의 메시지·stack·cause 와
 * 다른 속성은 경계 밖으로 나가지 않는다. redirect 앞에서 cookies() 로 쓴 쿠키는 Next 가 요청 저장소에서 꺼내 싣는다.
 *
 * 오류를 기록한 요청에는 요청당 한 번, 응답 뒤에 Sentry.flush 를 걸어 결과를 본다. SDK 의 route handler 래퍼도
 * 요청마다 flush 를 걸지만 결과를 버리므로 제한 초과를 알 수 없다. 이 경고는 "전역 큐가 제한 안에 비워지지
 * 않았다"는 뜻이고 특정 이벤트의 실패를 가리키지 않는다.
 *
 * 서버 전용이다. after 와 AsyncLocalStorage 를 쓴다.
 */
import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';
import { after } from 'next/server';

import type { LogEventCode } from './log-event-codes';
import { logSafeError, setSafeErrorListener } from './log-safe-error';

/** SDK 의 route handler 래퍼가 쓰는 제한과 같다(@sentry/nextjs 의 flushSafelyWithTimeout). */
export const FLUSH_TIMEOUT_MS = 2000;
export const FLUSH_TIMEOUT_LINE = '[sentry] flush timeout';
export const FLUSH_FAILED_LINE = '[sentry] flush failed';

type RequestRecord = { recorded: boolean };

const requestRecords = new AsyncLocalStorage<RequestRecord>();

// logSafeError 가 불릴 때마다 지금 요청에 표시한다. 경계 밖(브라우저, 감싸지 않은 라우트)에서는 store 가 없다.
setSafeErrorListener(() => {
  const record = requestRecords.getStore();
  if (record) record.recorded = true;
});

async function flushAndReport(): Promise<void> {
  // DSN 이 없으면 SDK 가 초기화되지 않는다(sentry.server.config.js). 그때 flush 는 false 를 준다 — 제한 초과가 아니다.
  if (!Sentry.getClient()) return;
  try {
    if (!(await Sentry.flush(FLUSH_TIMEOUT_MS))) console.warn(FLUSH_TIMEOUT_LINE);
  } catch {
    // after 콜백 밖으로 던지면 Next 가 그 오류 객체를 통째로 찍는다. 고정된 한 줄만 남긴다.
    console.warn(FLUSH_FAILED_LINE);
  }
}

/** cause 사슬을 따라가는 깊이의 상한. 읽을 때마다 새 cause 를 내놓는 값에서도 멈춘다. */
const MAX_CAUSE_DEPTH = 10;

/** 던진 값을 읽다가 예외가 났다는 표식. 그 예외 대신 이것을 던진다 — 원래 예외는 어디로도 내보내지 않는다. */
const UNREADABLE = Symbol('unreadable');

/** 판정하면서 던진 값에서 읽은 속성 값. 읽은 순서대로 들어 있다. */
type ReadValues = ReadonlyMap<string | symbol, unknown>;

/**
 * Next 가 이 값 자체를 제어 흐름 신호(redirect, notFound, 동적 렌더링 신호)로 보는가. 신호면 판정하면서 읽은 값을 돌려준다.
 *
 * 던진 값을 unstable_rethrow 에 바로 넘기지 않는다. unstable_rethrow 는 신호를 받으면 그 값을 그대로 다시 던지는데,
 * 읽기를 방해하는 값도 getter 나 Proxy 에서 자기 자신을 던질 수 있어 "넘긴 값이 다시 나왔다"로는 둘을 가리지 못한다.
 * 그래서 속성의 유무와 값만 대신 읽어 주는 객체를 넘긴다. 그 객체가 다시 나오는 길은 판정을 통과하는 것뿐이다.
 *
 * 무엇을 어떤 순서로 읽을지는 unstable_rethrow 가 정한다. 판정은 차례로 해 보다가 맞는 것이 나오면 거기서 끝나므로,
 * redirect() 신호라면 digest 만 읽는다. 미리 다 읽어 두면 판정에 쓰지 않는 속성이 던지는 신호를 놓친다.
 * 같은 속성은 한 번만 읽어 기억한다. 읽다가 던지는 값은 신호가 아니다.
 */
function readAsControlFlow(value: unknown): ReadValues | null {
  // 판정은 모두 객체만 신호로 본다.
  if (typeof value !== 'object' || value === null) return null;

  const source: object = value;
  const present = new Map<string | symbol, boolean>();
  const values = new Map<string | symbol, unknown>();
  const reading = <Result>(read: () => Result): Result => {
    try {
      return read();
    } catch {
      throw UNREADABLE;
    }
  };
  // 대상이 빈 객체라 Error 가 아니다 — unstable_rethrow 가 cause 를 따라가지 않는다. 사슬은 경계가 따라간다.
  const probe = new Proxy(
    {},
    {
      has(_target, key) {
        if (!present.has(key)) present.set(key, reading(() => Reflect.has(source, key)));
        return present.get(key) === true;
      },
      get(_target, key) {
        if (!values.has(key)) values.set(key, reading(() => Reflect.get(source, key)));
        return values.get(key);
      },
    },
  );

  try {
    unstable_rethrow(probe);
    return null;
  } catch (thrown) {
    return thrown === probe ? values : null;
  }
}

/**
 * unstable_rethrow 가 이 값을 신호로 보는가. 경계가 만든 값에만 쓴다 —
 * getter 가 없는 값이라, 넘긴 값이 다시 나오는 길은 판정을 통과하는 것뿐이다.
 */
function nextRethrows(owned: object): boolean {
  try {
    unstable_rethrow(owned);
    return false;
  } catch (thrown) {
    return thrown === owned;
  }
}

/**
 * 경계가 올려보내는 신호를 만든다. 가진 것은 여기서 정한 문장과 판정에 쓰이는 표식뿐이다.
 * stack 도 정해 둔 한 줄로 바꾼다 — 엔진이 만든 stack 에는 호출한 함수의 이름이 들어가고, 이름은 값에서 올 수 있다(log-safe-error.ts).
 * redirect 가 아닌 신호는 SDK 가 예외로 보낼 수 있다(forbidden, unauthorized 등). 그 이벤트에 실리는 것이 이 문장과 stack 이다.
 */
function ownedSignal(message: string, marks: { digest: string } | { $$typeof: symbol }): Error {
  const signal = new Error(message);
  signal.stack = `Error: ${message}`;
  return Object.assign(signal, marks);
}

/**
 * Next 가 Location 헤더에 그대로 싣는 주소다. 실을 수 없는 값이면 Next 안에서 그 값이 든 오류가 난다.
 * 그런 주소의 redirect 는 올려보내지 않는다.
 */
function isLocationSafe(url: string): boolean {
  // Node 의 http 가 헤더 값으로 받는 문자만 받는다. 줄바꿈·NUL 같은 제어 문자와 Latin-1 밖의 문자는 받지 않는다.
  if (url.trim() === '' || !/^[\t\x20-\x7e\x80-\xff]+$/.test(url)) return false;
  try {
    // Next 가 응답을 만들 때 하는 일이다.
    void new Headers({ Location: url });
    return true;
  } catch {
    return false;
  }
}

/**
 * Next 는 digest 를 느슨하게 읽는다: redirect 는 `NEXT_REDIRECT;방식;주소;응답 코드;` 뒤에 무엇이 붙어도 받고,
 * 응답 코드는 수로 바꿔 본다. 접근 fallback(notFound 등)도 `NEXT_HTTP_ERROR_FALLBACK;응답 코드` 뒤를 보지 않는다.
 * 그 문자열을 그대로 옮기면 무엇이든 실어 보낼 수 있으므로, Next 가 꺼내 쓰는 값만 꺼내 Next 가 만드는 모양으로 다시 적는다.
 * 방식과 응답 코드가 Next 가 받는 값인지는 다시 적은 신호를 unstable_rethrow 에 넘겨 확인한다(normalizedSignal).
 */
function redirectSignal(digest: string): Error | null {
  const parts = digest.split(';');
  if (parts[0] !== 'NEXT_REDIRECT' || parts.length < 4) return null;
  const url = parts.slice(2, -2).join(';');
  if (!isLocationSafe(url)) return null;
  return ownedSignal('NEXT_REDIRECT', { digest: `NEXT_REDIRECT;${parts[1]};${url};${Number(parts[parts.length - 2])};` });
}

function accessFallbackSignal(digest: string): Error | null {
  const parts = digest.split(';');
  if (parts[0] !== 'NEXT_HTTP_ERROR_FALLBACK') return null;
  const canonical = `NEXT_HTTP_ERROR_FALLBACK;${Number(parts[1])}`;
  return ownedSignal(canonical, { digest: canonical });
}

/** digest 가 통째로 정해진 값인 신호(동적 렌더링 신호 등). Next 가 그 값 하나만으로 신호로 볼 때만 만든다. */
function constantDigestSignal(digest: string): Error | null {
  return digest.includes(';') || !nextRethrows({ digest }) ? null : ownedSignal(digest, { digest });
}

/** React 가 postpone 을 알아보는 값. */
const REACT_POSTPONE = Symbol.for('react.postpone');

/** Next 가 동적 postpone 으로 보는 문장. 던진 값의 문장(경로와 호출한 API 가 들어 있다)은 쓰지 않는다. */
const DYNAMIC_POSTPONE_MESSAGE =
  'Route needs to bail out of prerendering at this point because it used a dynamic API. ' +
  'Learn more: https://nextjs.org/docs/messages/ppr-caught-error';

/**
 * 판정하면서 읽은 값으로 새 신호를 만든다. 던진 값은 다시 읽지 않는다.
 *
 * 어느 판정에서 끝났는지는 읽은 흔적으로 안다. unstable_rethrow 는 digest 로 정해지는 신호(redirect, 접근 fallback,
 * 정해진 digest)를 먼저 보고, 그다음에 message(동적 postpone)와 $$typeof(React 의 postpone)를 본다.
 * message 를 읽지 않았다면 digest 에서 끝난 것이다. 읽었다면 값 하나만 실은 객체를 unstable_rethrow 에 넘겨 어느 것인지 묻는다.
 */
function candidateSignal(read: ReadValues): Error | null {
  const digest = read.get('digest');
  const fromDigest = (make: (digest: string) => Error | null) => (typeof digest === 'string' ? make(digest) : null);

  if (!read.has('message')) {
    return fromDigest((value) => redirectSignal(value) ?? accessFallbackSignal(value) ?? constantDigestSignal(value));
  }

  const message = read.get('message');
  if (typeof message === 'string' && nextRethrows({ message })) {
    // Next 는 동적 postpone 을 React 의 postpone 으로 던진다. 던진 값의 $$typeof 는 판정이 읽지 않으므로 정해 둔 값을 싣는다.
    return ownedSignal(DYNAMIC_POSTPONE_MESSAGE, { $$typeof: REACT_POSTPONE });
  }
  const mark = read.get('$$typeof');
  if (typeof mark === 'symbol' && nextRethrows({ $$typeof: mark })) return ownedSignal('React postpone', { $$typeof: mark });
  // prerender 가 끝난 뒤의 거부처럼, digest 로 정해지지만 판정 순서가 뒤인 신호.
  return fromDigest(constantDigestSignal);
}

/**
 * 올려보낼 신호. 던진 값도, 그 값의 일부도 아니다 — 경계가 만든 값이라 뒤에서 누가 몇 번을 읽어도 같다.
 * 던진 값을 그대로 올려보내면 Next 와 SDK 가 그것을 다시 읽는다. 읽을 때마다 달라지는 값은 경계에서는 redirect 였다가
 * 그 뒤로는 평범한 오류가 되어, 메시지·stack·cause 가 그대로 찍힌다.
 *
 * 만든 신호를 unstable_rethrow 가 신호로 보지 않으면(null) 올려보내지 않는다. Location 에 실을 수 없는 주소의 redirect 도 그렇다.
 */
function normalizedSignal(read: ReadValues): Error | null {
  const candidate = candidateSignal(read);
  return candidate !== null && nextRethrows(candidate) ? candidate : null;
}

/**
 * 던진 값과 그 cause 사슬에서 Next 의 제어 흐름 신호를 찾아, 올려보낼 새 신호를 돌려준다.
 * Next 가 하듯 값을 먼저 판정하고, 신호가 아닐 때만 cause 를 읽는다.
 * 읽다가 던지거나, 이미 본 값으로 돌아오거나, 상한에 닿으면 거기서 멈춘다.
 * 던진 값은 무엇이든 될 수 있다 — cause 가 던지는 getter 일 수도, Proxy 일 수도 있다.
 */
function findControlFlow(error: unknown): Error | null {
  const seen: unknown[] = [];
  let current: unknown = error;
  while (seen.length <= MAX_CAUSE_DEPTH) {
    const read = readAsControlFlow(current);
    // Next 라면 이 값을 올려보낸다. 안전한 신호로 옮길 수 없으면 오류로 다룬다 — 사슬을 더 보지 않는다.
    if (read) return normalizedSignal(read);
    seen.push(current);
    let next: unknown;
    try {
      if (!(current instanceof Error) || !('cause' in current)) break;
      next = current.cause;
    } catch {
      break;
    }
    if (seen.includes(next)) break;
    current = next;
  }
  return null;
}

function scheduleFlush(): void {
  try {
    after(flushAndReport);
  } catch {
    // 요청 범위 밖(테스트가 핸들러를 직접 부를 때)이거나 waitUntil 이 없는 환경이다.
    // 가린 로그 한 줄은 이미 남았다(설계 §4.3 의 1). 응답을 깨뜨리지 않는다.
  }
}

export function withSafeErrors<Args extends unknown[]>(
  code: LogEventCode,
  handler: (...args: Args) => Response | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const run = async (): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        // redirect()·notFound() 와 Next 의 동적 렌더링 신호는 오류가 아니다. 같은 뜻의 새 신호를 올려보낸다 — 던진 값은 나가지 않는다.
        // Next 가 하듯 cause 사슬 안의 신호도 찾는다. 찾는 동안 난 예외는 올려보내지 않는다.
        const signal = findControlFlow(error);
        if (signal) throw signal;
        logSafeError(code, error);
        // 본문에 오류 메시지를 넣지 않는다.
        return Response.json({ error: 'Internal server error' }, { status: 500 });
      }
    };

    // 경계가 겹치면 바깥 경계가 flush 를 건다. 요청당 한 번이다.
    if (requestRecords.getStore()) return run();

    const record: RequestRecord = { recorded: false };
    try {
      return await requestRecords.run(record, run);
    } finally {
      if (record.recorded) scheduleFlush();
    }
  };
}
