/**
 * Sentry SDK 가 스스로 붙이는 데이터의 범위. 서버·edge 설정이 함께 쓴다.
 * 설계: docs/superpowers/specs/2026-10-02-log-redaction-and-delivery-design.md §4.1
 */

/**
 * requestDataIntegration 이 이벤트의 request 에 붙일 것. 기본값은 쿠키·헤더·쿼리·본문을 모두 붙인다
 * (sendDefaultPii 와 무관하다). url 만 남기고, 그 쿼리는 scrubEvent 가 뗀다.
 */
export const REQUEST_DATA_INCLUDE = Object.freeze({
  cookies: false,
  headers: false,
  query_string: false,
  data: false,
  url: true,
  ip: false,
});

/** 기본 integration 에서 Console 을 뺀다. 서버의 console 출력은 Vercel 로그에 이미 있다. */
export function withoutConsole<T extends { name: string }>(integrations: T[]): T[] {
  return integrations.filter((integration) => integration.name !== 'Console');
}

/**
 * 환경변수로 받은 표본율. 0 과 1 사이의 수만 받고, 그 밖의 값이면 기본값을 쓴다.
 * envelope 테스트(scripts/envelope-test/run.js)가 표본을 강제할 때 쓴다. 운영 환경변수에는 두지 않는다.
 */
export function resolveTracesSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback;
}
