import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';

type Step = {
  phase: 'normal' | 'no-context' | 'slow';
  label: string;
  path: string;
  probe?: 'install' | 'remove';
  status: number;
  events: number;
  safeLines: number;
  line: string | null;
  timeoutLines: number;
};
type Observation = {
  step: Step;
  status: number;
  sentAt: number;
  receivedAt: number;
  events: Array<{ arrivedAt: number; respondedAt: number | null }>;
  waits: Array<{ registeredAt: number; settledAt: number | null }>;
  safeLines: number;
  matchingLines: number;
  timeoutLines: number;
};

const require = createRequire(import.meta.url);
const { STEPS, NORMAL_DELAY_MS, SLOW_DELAY_MS, RESPONSE_BUDGET_MS, FLUSH_TIMEOUT_LINE, evaluateDelivery } = require(
  path.join(process.cwd(), 'scripts/envelope-test/delivery.js'),
) as {
  STEPS: Step[];
  NORMAL_DELAY_MS: number;
  SLOW_DELAY_MS: number;
  RESPONSE_BUDGET_MS: number;
  FLUSH_TIMEOUT_LINE: string;
  evaluateDelivery: (observations: Observation[]) => { failures: string[] };
};

/** 기대대로 돈 실행의 관측. 시각은 요청을 보낸 때를 0 으로 둔 ms 다. */
function clean(step: Step): Observation {
  const delay = step.phase === 'slow' ? SLOW_DELAY_MS : NORMAL_DELAY_MS;
  const events = Array.from({ length: step.events }, () => ({ arrivedAt: 12, respondedAt: 12 + delay }));
  // 보통 단계의 flush 는 전송이 끝난 뒤에, 느린 단계의 flush 는 제한(2000ms)에서 끝난다.
  const settledAt = step.phase === 'slow' ? 2010 : 12 + delay + 3;
  return {
    step,
    status: step.status,
    sentAt: 0,
    receivedAt: 8,
    events,
    waits: step.phase === 'no-context' ? [] : [{ registeredAt: 6, settledAt }],
    safeLines: step.safeLines,
    matchingLines: step.line === null ? 0 : step.safeLines,
    timeoutLines: step.timeoutLines,
  };
}

const run = (change?: (observations: Observation[]) => void) => {
  const observations = STEPS.map(clean);
  change?.(observations);
  return evaluateDelivery(observations).failures;
};

const of = (observations: Observation[], phase: Step['phase'], match: (step: Step) => boolean = () => true) => {
  const found = observations.find((observation) => observation.step.phase === phase && match(observation.step));
  if (!found) throw new Error(`단계가 없다: ${phase}`);
  return found;
};

describe('전달 시나리오의 단계', () => {
  it('세 사례를 모두 담는다: 정상, 요청 컨텍스트 없음, 제한 초과', () => {
    expect([...new Set(STEPS.map((step) => step.phase))]).toEqual(['normal', 'no-context', 'slow']);
    expect(new Set(STEPS.map((step) => step.label)).size).toBe(STEPS.length);
  });

  it('첫 요청이 가짜 요청 컨텍스트를 달고 기록을 남긴다 — 서버의 첫 요청이 곧 측정 대상이다', () => {
    expect(STEPS[0]).toMatchObject({ phase: 'normal', probe: 'install', events: 1 });
  });

  it('수집기의 지연이 flush 제한(2초)의 양쪽에 있고, 응답 예산은 제한보다 짧다', () => {
    expect(NORMAL_DELAY_MS).toBeLessThan(2000);
    expect(SLOW_DELAY_MS).toBeGreaterThan(2000);
    expect(RESPONSE_BUDGET_MS).toBeLessThan(2000);
    expect(FLUSH_TIMEOUT_LINE).toBe('[sentry] flush timeout');
  });

  it('제한 초과 줄은 느린 단계에서 경계가 오류를 기록한 요청에만 기대한다', () => {
    for (const step of STEPS) {
      const boundaryRecorded = step.path.includes('/delivery-safe') && step.events > 0;
      expect(step.timeoutLines, step.label).toBe(step.phase === 'slow' && boundaryRecorded ? 1 : 0);
    }
    // 여러 번 남겨도 한 줄이고, 감싸지 않은 라우트는 느려도 남기지 않는다.
    expect(STEPS.some((step) => step.phase === 'slow' && step.events === 3 && step.timeoutLines === 1)).toBe(true);
    expect(STEPS.some((step) => step.phase === 'slow' && step.path.includes('/delivery-plain') && step.timeoutLines === 0)).toBe(true);
  });
});

describe('evaluateDelivery', () => {
  it('기대대로 돈 실행은 실패가 없다', () => {
    expect(run()).toEqual([]);
  });

  it('관측이 빠진 단계를 실패로 본다 — 아무것도 재지 않은 실행이 통과하지 않는다', () => {
    expect(evaluateDelivery([]).failures).toHaveLength(STEPS.length);
    expect(run((observations) => observations.pop())).toEqual([`${STEPS[STEPS.length - 1].label}: 관측이 없다`]);
  });

  it('응답 코드, 이벤트 수, 로그 줄 수가 다르면 실패한다', () => {
    const failures = run((observations) => {
      const target = of(observations, 'normal', (step) => step.events === 3);
      target.status = 500;
      target.events.pop();
      target.safeLines = 2;
      target.matchingLines = 2;
    });
    expect(failures).toEqual([
      '경계 안의 기록 세 번: 응답 코드 기대 200, 실제 500',
      '경계 안의 기록 세 번: 오류 이벤트 기대 3건, 실제 2건',
      '경계 안의 기록 세 번: 로그 줄 기대 3줄, 실제 2줄',
      "경계 안의 기록 세 번: 'ERROR: envtest.delivery.handled' 줄 기대 3줄, 실제 2줄",
    ]);
  });

  it('flush 가 전송 완료보다 먼저 끝나면 실패한다 — #74 가 걱정한 틈이다', () => {
    const failures = run((observations) => {
      const target = of(observations, 'normal');
      target.waits[0].settledAt = 9;
    });
    expect(failures).toEqual([`${STEPS[0].label}: flush 가 전송 완료보다 먼저 끝났다 — 이벤트가 flush 보다 늦게 큐에 들어갔다`]);
  });

  it('응답이 전송 완료를 기다렸으면 실패한다', () => {
    const failures = run((observations) => {
      const target = of(observations, 'normal');
      target.receivedAt = target.events[0].respondedAt as number;
      target.waits[0].settledAt = target.receivedAt + 5;
    });
    expect(failures).toEqual([`${STEPS[0].label}: 응답이 전송 완료보다 늦었다 — 응답이 전송을 기다렸다`]);
  });

  it('flush 가 같은 ms 에 끝난 것은 실패가 아니다', () => {
    expect(
      run((observations) => {
        const target = of(observations, 'normal');
        target.waits[0].settledAt = target.events[0].respondedAt;
      }),
    ).toEqual([]);
  });

  it('SDK 래퍼의 flush 가 요청당 한 번이 아니면 실패한다', () => {
    const none = run((observations) => {
      of(observations, 'normal').waits = [];
    });
    const twice = run((observations) => {
      const target = of(observations, 'normal');
      target.waits.push({ ...target.waits[0] });
    });
    expect(none).toEqual([`${STEPS[0].label}: waitUntil 등록 기대 1건, 실제 0건`]);
    expect(twice).toEqual([`${STEPS[0].label}: waitUntil 등록 기대 1건, 실제 2건`]);
  });

  it('끝나지 않은 flush 와 답하지 못한 이벤트를 실패로 본다', () => {
    const unsettled = run((observations) => {
      of(observations, 'normal').waits[0].settledAt = null;
    });
    const unanswered = run((observations) => {
      of(observations, 'normal').events[0].respondedAt = null;
    });
    expect(unsettled).toEqual([`${STEPS[0].label}: waitUntil 에 건 flush 가 끝나지 않았다`]);
    expect(unanswered).toEqual([`${STEPS[0].label}: 수집기가 답하지 못한 이벤트가 있다`]);
  });

  it('요청 컨텍스트가 없는데 waitUntil 에 걸린 것이 있으면 실패한다', () => {
    const failures = run((observations) => {
      of(observations, 'no-context').waits = [{ registeredAt: 6, settledAt: 300 }];
    });
    expect(failures).toEqual(['요청 컨텍스트 없음: 요청 컨텍스트가 없는데 waitUntil 에 1건이 걸렸다']);
  });

  it('제한 초과 줄의 수가 기대와 다르면 실패한다', () => {
    const missing = run((observations) => {
      of(observations, 'slow', (step) => step.timeoutLines === 1).timeoutLines = 0;
    });
    const duplicated = run((observations) => {
      of(observations, 'slow', (step) => step.events === 3).timeoutLines = 3;
    });
    const unexpected = run((observations) => {
      of(observations, 'slow', (step) => step.path.includes('/delivery-plain')).timeoutLines = 1;
    });
    expect(missing).toEqual(["제한 초과: 경계가 잡은 예외: '[sentry] flush timeout' 기대 1줄, 실제 0줄"]);
    expect(duplicated).toEqual(["제한 초과: 경계 안의 기록 세 번: '[sentry] flush timeout' 기대 1줄, 실제 3줄"]);
    expect(unexpected).toEqual(["제한 초과: 경계 없는 라우트: '[sentry] flush timeout' 기대 0줄, 실제 1줄"]);
  });

  it('느린 단계에서 응답이 늦거나 flush 가 전송 완료까지 기다렸으면 실패한다', () => {
    const slowResponse = run((observations) => {
      of(observations, 'slow').receivedAt = 2100;
    });
    const waited = run((observations) => {
      const target = of(observations, 'slow');
      target.waits[0].settledAt = (target.events[0].respondedAt as number) + 1;
    });
    expect(slowResponse).toEqual(['제한 초과: 경계가 잡은 예외: 응답이 2100ms 걸렸다 — flush 가 응답을 늦췄다']);
    expect(waited).toEqual(['제한 초과: 경계가 잡은 예외: 제한을 넘겼는데 flush 가 전송 완료까지 기다렸다']);
  });
});
