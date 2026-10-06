import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// 읽을 때마다 달라지는 redirect() 신호. digest 는 처음 몇 번(?reads=1|2)만 redirect 의 것이고 그 뒤로는 평범한 문자열이다.
// 경계가 이 값을 그대로 올려보내면, 경계에서는 redirect 였던 것이 SDK 의 래퍼와 Next 가 다시 읽을 때는 평범한 오류가 된다.
// 그러면 메시지·stack·cause 에 든 요청 값이 예외 이벤트와 Next 의 미처리 오류 로그에 찍힌다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const secret = request.headers.get('x-envtest-boundary-stateful') ?? 'none';
  const validReads = new URL(request.url).searchParams.get('reads') === '2' ? 2 : 1;
  // redirect 앞에서 쓴 쿠키는 Next 가 요청 저장소에서 꺼내 응답에 싣는다. 신호 객체에 실려 가지 않는다.
  (await cookies()).set('envtest-boundary', 'kept', { path: '/' });

  try {
    redirect('/api/envelope-test/redirected');
  } catch (signal) {
    const hostile = signal as Error & { digest: string; user?: unknown };
    const real = hostile.digest;
    let reads = 0;
    Object.defineProperty(hostile, 'digest', {
      get() {
        reads += 1;
        return reads <= validReads ? real : `envtest ordinary digest ${secret}`;
      },
    });
    hostile.message = `envtest stateful message ${secret}`;
    hostile.stack = `Error: envtest stateful\n    at https://envtest.invalid/app.js?code=${secret}:1:1`;
    hostile.cause = new Error(`envtest stateful cause ${secret}`);
    hostile.user = { email: `${secret}@envtest.invalid` };
    throw hostile;
  }
});
