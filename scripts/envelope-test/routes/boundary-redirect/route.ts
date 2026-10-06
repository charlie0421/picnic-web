import { redirect } from 'next/navigation';

import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// redirect() 가 던지는 신호. Next 는 digest 만 보고 이 신호를 응답(307)으로 바꾼다 — message 는 읽지 않는다.
// 경계가 판정에 쓰지 않는 message 까지 읽으면 getter 의 예외를 만나 신호를 오류로 다루고 500 을 돌려준다.
export const GET = withSafeErrors('envtest.boundary.unhandled', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const secret = request.headers.get('x-envtest-boundary-redirect') ?? 'none';
  try {
    redirect('/api/envelope-test/redirected');
  } catch (signal) {
    Object.defineProperty(signal as object, 'message', {
      get() {
        throw new Error(`envtest redirect message ${secret}`);
      },
    });
    throw signal;
  }
});
