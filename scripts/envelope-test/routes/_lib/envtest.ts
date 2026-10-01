/**
 * envelope 테스트용 라우트의 공통 코드. 이 디렉터리는 라우트가 아니다 — 실행기(scripts/envelope-test/run.js)가
 * 테스트 빌드를 만들 때만 app/api/envelope-test/ 로 복사했다가 지운다(scripts/envelope-test/build-switch.js).
 * 여기에는 비밀처럼 보이는 값을 두지 않는다 — 실행기가 요청 헤더로 넘긴다.
 */

/** 보통 빌드에는 들어가지 않지만, 잘못 들어간 경우에 대비한 두 번째 문이다. */
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
