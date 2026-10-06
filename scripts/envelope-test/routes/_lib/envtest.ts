/**
 * envelope 테스트용 라우트의 공통 코드. 이 디렉터리는 라우트가 아니다 — 실행기(scripts/envelope-test/run.js)가
 * 테스트 빌드를 만들 때만 app/api/envelope-test/ 로 복사했다가 지운다(scripts/envelope-test/build-switch.js).
 * 여기에는 비밀처럼 보이는 값을 두지 않는다 — 실행기가 요청 헤더로 넘긴다.
 */

/** 보통 빌드에는 들어가지 않지만, 잘못 들어간 경우에 대비한 두 번째 문이다. */
export function envelopeTestDisabled(): Response | null {
  return process.env.ENVELOPE_TEST === '1' ? null : new Response(null, { status: 404 });
}

/**
 * 서버 출력에만 남아야 하는 줄. console breadcrumb 으로 Sentry 에 실리면 안 된다.
 * console.warn 으로 찍는다 — 운영 빌드는 compiler.removeConsole 로 console.log 를 지운다(error·warn 만 남는다).
 */
export function logConsoleCanary(headers: Headers): void {
  console.warn(`envtest console ${headers.get('x-envtest-console') ?? 'none'}`);
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

/**
 * 경계 함수와 계약 함수를 시험하는 오류. 이름·메시지·stack·cause 에 요청 헤더의 값을 섞는다.
 * 이 가운데 어느 것도 Sentry 와 서버 출력에 나오면 안 된다(설계 §4.2).
 */
export function hostileError(headers: Headers): Error {
  const value = (name: string) => headers.get(`x-envtest-boundary-${name}`) ?? 'none';
  const error = new Error(
    [
      `envtest boundary ${value('message')}`,
      `url=https://envtest.invalid/callback?code=${value('query')}`,
      `jwt=${value('jwt')}`,
      `auth=Bearer ${value('bearer')}`,
    ].join(' '),
    { cause: new Error(`envtest cause ${value('cause')}`) },
  );
  error.name = `Envtest${value('name')}`;
  error.stack = `${error.name}: envtest boundary\n    at https://envtest.invalid/app.js?code=${value('stack')}:1:1`;
  return error;
}
