import { withSafeErrors } from '@/utils/with-safe-errors';
import { envelopeTestDisabled, logConsoleCanary } from '../_lib/envtest';

export const dynamic = 'force-dynamic';

// cause 를 읽으면 자기 자신을 던지는 오류. unstable_rethrow 는 신호를 받으면 그 값을 그대로 던지므로,
// 경계가 "넘긴 값이 다시 나왔다"는 것만으로 신호라고 보면 이 오류를 Next 로 올려보낸다.
// 그러면 메시지에 든 요청 값이 Next 의 미처리 오류 로그와 SDK 의 래퍼에 닿는다.
export const GET = withSafeErrors('envtest.boundary.self_throw', async (request: Request): Promise<Response> => {
  const disabled = envelopeTestDisabled();
  if (disabled) return disabled;

  logConsoleCanary(request.headers);
  const error = new Error(`envtest boundary self throw ${request.headers.get('x-envtest-boundary-self') ?? 'none'}`);
  Object.defineProperty(error, 'cause', {
    get() {
      throw error;
    },
  });
  throw error;
});
