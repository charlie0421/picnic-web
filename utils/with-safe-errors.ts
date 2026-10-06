/**
 * 결제·인증 route handler 의 경계 (설계 §4.7, §4.3).
 *
 *   export const POST = withSafeErrors('payment.portone.webhook.unhandled', async (request) => { … });
 *
 * 핸들러가 던진 오류를 여기서 잡아 logSafeError 로 남기고 고정된 500 을 돌려준다. 원본 오류는 Next 로
 * 전파되지 않으므로 Next 의 미처리 오류 로그(원본 메시지를 서버 출력에 찍는다)와 onRequestError 에 닿지 않는다.
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

/**
 * Next 가 이 값 자체를 제어 흐름 신호(redirect, notFound, 동적 렌더링 신호)로 보는가.
 *
 * 던진 값을 unstable_rethrow 에 바로 넘기지 않는다. unstable_rethrow 는 신호를 받으면 그 값을 그대로 다시 던지는데,
 * 읽기를 방해하는 값도 getter 나 Proxy 에서 자기 자신을 던질 수 있어 "넘긴 값이 다시 나왔다"로는 둘을 가리지 못한다.
 * 그래서 속성의 유무와 값만 대신 읽어 주는 객체를 넘긴다. 그 객체가 다시 나오는 길은 판정을 통과하는 것뿐이다.
 *
 * 무엇을 어떤 순서로 읽을지는 unstable_rethrow 가 정한다. 판정은 차례로 해 보다가 맞는 것이 나오면 거기서 끝나므로,
 * redirect() 신호라면 digest 만 읽는다. 미리 다 읽어 두면 판정에 쓰지 않는 속성이 던지는 신호를 놓친다.
 * 같은 속성은 한 번만 읽어 기억한다. 읽다가 던지는 값은 신호가 아니다.
 */
function isNextControlFlow(value: unknown): boolean {
  // 판정은 모두 객체만 신호로 본다.
  if (typeof value !== 'object' || value === null) return false;

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
    return false;
  } catch (thrown) {
    return thrown === probe;
  }
}

/**
 * 던진 값과 그 cause 사슬에서 Next 의 제어 흐름 신호를 찾는다. Next 가 하듯 값을 먼저 판정하고, 신호가 아닐 때만 cause 를 읽는다.
 * 읽다가 던지거나, 이미 본 값으로 돌아오거나, 상한에 닿으면 거기서 멈춘다.
 * 던진 값은 무엇이든 될 수 있다 — cause 가 던지는 getter 일 수도, Proxy 일 수도 있다.
 */
function findControlFlow(error: unknown): { signal: unknown } | null {
  const seen: unknown[] = [];
  let current: unknown = error;
  while (seen.length <= MAX_CAUSE_DEPTH) {
    if (isNextControlFlow(current)) return { signal: current };
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
        // redirect()·notFound() 와 Next 의 동적 렌더링 신호는 오류가 아니다. 그대로 올려보낸다.
        // Next 가 하듯 cause 사슬 안의 신호도 찾는다. 찾는 동안 난 예외는 올려보내지 않는다.
        const found = findControlFlow(error);
        if (found) throw found.signal;
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
