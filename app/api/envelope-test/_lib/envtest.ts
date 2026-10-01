/**
 * envelope 테스트용 라우트의 공통 코드. route.envtest.ts 는 ENVELOPE_TEST=1 로 만든 빌드에만 들어간다
 * (scripts/envelope-test/build-switch.js). 여기에는 비밀처럼 보이는 값을 두지 않는다 — 실행기가 요청 헤더로 넘긴다.
 */

/** 빌드에서 이미 갈리지만, 잘못 들어간 경우에 대비한 두 번째 문이다. */
export function envelopeTestDisabled(): Response | null {
  return process.env.ENVELOPE_TEST === '1' ? null : new Response(null, { status: 404 });
}

/** 서버 표준 출력에만 남아야 하는 줄. console breadcrumb 으로 Sentry 에 실리면 안 된다. */
export function logConsoleCanary(headers: Headers): void {
  console.log(`envtest console ${headers.get('x-envtest-console') ?? 'none'}`);
}

/** 처리되지 않은 예외의 메시지. URL 쿼리, JWT 모양, Bearer 토큰, 이메일을 섞는다. */
export function unhandledMessage(headers: Headers): string {
  const value = (name: string) => headers.get(`x-envtest-${name}`) ?? 'none';
  return [
    `envtest unhandled ${value('marker')}`,
    `url=https://envtest.invalid/callback?code=${value('url-query')}`,
    `jwt=${value('jwt')}`,
    `auth=Bearer ${value('bearer')}`,
    `email=${value('email')}`,
  ].join(' ');
}
